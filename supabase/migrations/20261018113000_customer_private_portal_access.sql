BEGIN;


CREATE SCHEMA IF NOT EXISTS salonpro_private;
REVOKE ALL ON SCHEMA salonpro_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS salonpro_private.portal_read_protection (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 preview_salons text[] NOT NULL DEFAULT '{}'::text[],
 pseudonym_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex')
);
REVOKE ALL ON salonpro_private.portal_read_protection FROM PUBLIC, anon, authenticated;
INSERT INTO salonpro_private.portal_read_protection(singleton,enabled) VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION salonpro_private.portal_enabled(p_salon_code text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT enabled OR coalesce(lower(trim(p_salon_code))=ANY(preview_salons),false) FROM salonpro_private.portal_read_protection WHERE singleton),true)
$$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_owner(p_salon_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(auth.role()='service_role',false) OR (auth.uid() IS NOT NULL AND public.workspace_access_allowed()
 AND EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=public.current_workspace_id()
 AND w.slug=lower(trim(p_salon_code))))
$$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_customer(p_salon_code text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE token text; cid uuid;
BEGIN
 BEGIN token:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-salonpro-customer-token';
 EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
 IF token IS NULL OR token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT c.id INTO cid FROM public.customer_payment_sessions s
 JOIN public.customers c ON c.id=s.customer_id AND c.is_active IS NOT FALSE
 JOIN public.customer_login_credentials k ON k.customer_id=c.id AND k.password_hash=s.credential_hash
 JOIN public.workspaces w ON w.id=c.workspace_id
 WHERE s.token_hash=encode(extensions.digest(token,'sha256'),'hex') AND s.expires_at>now()
 AND w.slug=lower(trim(p_salon_code));
 RETURN cid;
END $$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_proof_supplied() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 RETURN nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-salonpro-customer-token','') IS NOT NULL;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_owns_request(p_id uuid,p_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.booking_requests r JOIN public.customers c ON c.id=p_customer AND c.workspace_id=r.workspace_id
 WHERE r.id=p_id AND (r.customer_id=c.id OR (r.customer_id IS NULL
 AND nullif(trim(c.email::text),'') IS NOT NULL AND nullif(trim(c.phone),'') IS NOT NULL
 AND lower(trim(r.customer_email::text))=lower(trim(c.email::text))
 AND right(regexp_replace(r.customer_phone,'\D','','g'),10)=right(regexp_replace(c.phone,'\D','','g'),10))))
$$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_owns_appointment(p_id uuid,p_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.appointments a JOIN public.customers c ON c.id=p_customer AND c.workspace_id=a.workspace_id
 WHERE a.id=p_id AND (a.customer_id=c.id OR (a.customer_id IS NULL AND
 (salonpro_private.portal_owns_request(a.booking_request_id,c.id) OR
 (a.booking_request_id IS NULL AND nullif(trim(c.full_name),'') IS NOT NULL
 AND lower(trim(a.customer_name))=lower(trim(c.full_name))
 AND (SELECT count(*) FROM public.customers x WHERE x.workspace_id=c.workspace_id
 AND lower(trim(x.full_name))=lower(trim(c.full_name)))=1)))))
$$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_occupancy_alias(p_salon text,p_date text,p_label text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 SELECT 'occ_'||substr(encode(extensions.hmac(coalesce(p_date,'')||'|'||lower(trim(coalesce(p_label,''))),
 (SELECT pseudonym_secret FROM salonpro_private.portal_read_protection WHERE singleton)||'|'||lower(trim(p_salon)),'sha256'),'hex'),1,24)
$$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_occupancy_label(p_salon text,p_date text,p_id text,p_label text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; rid text:=regexp_replace(p_id,'^(pending|accepted)-','');
BEGIN
 cid:=salonpro_private.portal_customer(p_salon);
 IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.customers c WHERE c.id=cid AND coalesce(c.registration_status,'approved')='approved')
 AND (EXISTS(SELECT 1 FROM public.appointments a WHERE a.id::text=rid AND salonpro_private.portal_owns_appointment(a.id,cid))
 OR EXISTS(SELECT 1 FROM public.booking_requests r WHERE r.id::text=rid AND salonpro_private.portal_owns_request(r.id,cid))) THEN RETURN p_label; END IF;
 RETURN salonpro_private.portal_occupancy_alias(p_salon,p_date,p_label);
END $$;
CREATE OR REPLACE FUNCTION salonpro_private.portal_assert(p_salon_code text,p_email text,p_phone text,p_allow_pending boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;
BEGIN
 IF NOT salonpro_private.portal_enabled(p_salon_code) OR salonpro_private.portal_owner(p_salon_code) THEN RETURN; END IF;
 cid:=salonpro_private.portal_customer(p_salon_code);
 IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.customers c WHERE c.id=cid
 AND nullif(trim(p_email),'') IS NOT NULL AND nullif(trim(p_phone),'') IS NOT NULL
 AND lower(trim(c.email::text))=lower(trim(p_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_phone,'\D','','g'),10)
 ) THEN
   IF NOT p_allow_pending AND NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=cid AND coalesce(c.registration_status,'approved')='approved') THEN
     RAISE EXCEPTION 'customer_registration_pending' USING ERRCODE='42501';
   END IF;
   RETURN;
 END IF;
 RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501';
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salonpro_private FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_portal_access_requirement_v1(p_salon_code text,p_customer_email text,p_customer_phone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT jsonb_build_object('found',true,'passwordRequired',EXISTS(
 SELECT 1 FROM public.customer_login_credentials k WHERE k.customer_id=c.id))
 FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND nullif(trim(p_customer_email),'') IS NOT NULL AND nullif(trim(p_customer_phone),'') IS NOT NULL
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10)
 ORDER BY c.updated_at DESC,c.id LIMIT 1),jsonb_build_object('found',false))
$$;
REVOKE ALL ON FUNCTION public.get_customer_portal_access_requirement_v1(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_requirement_v1(text,text,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_customer_portal_session_v1(p_salon_code text,p_customer_email text,p_customer_phone text,p_customer_password text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE cid uuid; credential text; matches integer; token text; expiry timestamptz:=now()+interval '7 days';
BEGIN
 IF nullif(trim(p_customer_email),'') IS NULL OR length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'))<>10
 OR length(coalesce(p_customer_password,''))=0 OR length(p_customer_password)>1024 THEN RAISE EXCEPTION 'customer_password_required'; END IF;
 SELECT count(*) INTO matches FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND (w.is_internal_tester OR w.subscription_status IN ('demo','active'))
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10);
 SELECT c.id,k.password_hash INTO cid,credential FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 JOIN public.customer_login_credentials k ON k.customer_id=c.id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10);
 IF matches<>1 OR cid IS NULL OR credential IS NULL OR extensions.crypt(p_customer_password,credential) IS DISTINCT FROM credential THEN RAISE EXCEPTION 'invalid_customer_password'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.customer_payment_sessions(token_hash,customer_id,credential_hash,expires_at)
 VALUES(encode(extensions.digest(token,'sha256'),'hex'),cid,credential,expiry);
 RETURN jsonb_build_object('token',token,'expiresAt',expiry);
END $$;
REVOKE ALL ON FUNCTION public.create_customer_portal_session_v1(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_session_v1(text,text,text,text) TO anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION salonpro_private.impl_2a5d2f2848d6709499b9(p_salon_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_payload jsonb := '{}'::jsonb;
  v_workspace_payload jsonb := '{}'::jsonb;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and (w.is_internal_tester = true or w.subscription_status in ('demo', 'active'))
  order by
    case when w.subscription_status = 'active' then 0 else 1 end,
    w.updated_at desc nulls last,
    w.created_at desc nulls last,
    w.id desc
  limit 1;

  if v_workspace.id is null then
    return null;
  end if;

  v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
  v_workspace_payload := coalesce(v_owner_payload -> 'workspace', '{}'::jsonb);

  return jsonb_build_object(
    'workspace',
      jsonb_build_object(
        'id', v_workspace.id,
        'ownerEmail', coalesce(nullif(trim(v_workspace_payload ->> 'ownerEmail'), ''), v_workspace.owner_email::text),
        'salonCode', coalesce(nullif(trim(v_workspace_payload ->> 'salonCode'), ''), v_workspace.slug),
        'salonName', coalesce(nullif(trim(v_workspace_payload ->> 'salonName'), ''), v_workspace.salon_name),
        'salonNameDisplayStyle', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameDisplayStyle'), ''), 'corsivo'),
        'salonNameFontVariant', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameFontVariant'), ''), 'neon'),
        'businessPhone', coalesce(nullif(trim(v_workspace_payload ->> 'businessPhone'), ''), coalesce(v_workspace.owner_phone, '')),
        'activityCategory', coalesce(nullif(trim(v_workspace_payload ->> 'activityCategory'), ''), ''),
        'salonAddress', coalesce(nullif(trim(v_workspace_payload ->> 'salonAddress'), ''), nullif(trim(v_workspace.street_line), ''), ''),
        'streetType', coalesce(nullif(trim(v_workspace_payload ->> 'streetType'), ''), ''),
        'streetName', coalesce(nullif(trim(v_workspace_payload ->> 'streetName'), ''), ''),
        'streetNumber', coalesce(nullif(trim(v_workspace_payload ->> 'streetNumber'), ''), ''),
        'city', coalesce(nullif(trim(v_workspace_payload ->> 'city'), ''), nullif(trim(v_workspace.city), ''), ''),
        'postalCode', coalesce(nullif(trim(v_workspace_payload ->> 'postalCode'), ''), nullif(trim(v_workspace.postal_code), ''), ''),
        'subscriptionPlan', v_workspace.subscription_plan,
        'subscriptionStatus', v_workspace.subscription_status,
        'autoAcceptBookingRequests', coalesce(v_workspace.auto_accept_booking_requests, false),
        'autoAcceptBookingRequestsUpdatedAt', v_workspace.auto_accept_booking_requests_updated_at,
        'clientWelcomeEnabled', v_workspace.client_welcome_enabled,
        'clientWelcomeTitle', v_workspace.client_welcome_title,
        'clientWelcomeMessage', v_workspace.client_welcome_message,
        'customerReminderHoursBefore',
          greatest(0, least(168, coalesce(v_workspace.customer_reminder_hours_before, 24))),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti', coalesce(v_owner_payload -> 'clienti', '[]'::jsonb),
    'appuntamenti',
      public.overlay_canonical_appointment_timing_v1(
        v_workspace.id,
        coalesce(v_owner_payload -> 'appuntamenti', '[]'::jsonb)
      ),
    'servizi', coalesce(v_owner_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_owner_payload -> 'operatori', '[]'::jsonb),
    'richiestePrenotazione',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', booking_request.id,
              'data', booking_request.appointment_date,
              'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
              'servizio', booking_request.requested_service_name,
              'prezzo', booking_request.requested_price,
              'durataMinuti', booking_request.requested_duration_minutes,
              'nome', booking_request.customer_name,
              'cognome', booking_request.customer_surname,
              'email', booking_request.customer_email,
              'telefono', booking_request.customer_phone,
              'instagram', coalesce(booking_request.customer_instagram, ''),
              'note', coalesce(booking_request.notes, ''),
              'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
              'origine', case when booking_request.origin = 'backoffice' then 'backoffice' else 'frontend' end,
              'stato',
                case booking_request.status
                  when 'accepted' then 'Accettata'
                  when 'rejected' then 'Rifiutata'
                  when 'cancelled' then 'Annullata'
                  else 'In attesa'
                end,
              'cancellationSource', booking_request.cancellation_source,
              'createdAt', booking_request.created_at,
              'viewedByCliente', booking_request.viewed_by_customer,
              'viewedBySalon',
                case
                  when booking_request.status in ('pending', 'cancelled') then false
                  else true
                end
            )
            order by booking_request.created_at desc
          )
          from public.booking_requests as booking_request
          where coalesce(booking_request.payment_hold_state,'paid')='paid' and booking_request.workspace_id = v_workspace.id
            and (
              booking_request.status not in ('pending', 'accepted')
              or not exists (
                select 1
                from public.booking_requests as terminal_request
                where terminal_request.workspace_id = v_workspace.id
                  and terminal_request.status in ('cancelled', 'rejected')
                  and terminal_request.appointment_date = booking_request.appointment_date
                  and terminal_request.appointment_time = booking_request.appointment_time
                  and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                    lower(trim(coalesce(booking_request.requested_service_name, '')))
                  and public.same_public_booking_operator_identity(
                    terminal_request.requested_operator_id,
                    terminal_request.requested_operator_name,
                    booking_request.requested_operator_id,
                    booking_request.requested_operator_name
                  )
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(booking_request.customer_name, ''),
                        coalesce(booking_request.customer_surname, '')
                      )
                    )
                  )
                  and not exists (
                    select 1
                    from public.booking_requests as newer_active_request
                    where newer_active_request.workspace_id = terminal_request.workspace_id
                      and newer_active_request.status in ('pending', 'accepted')
                      and newer_active_request.appointment_date = terminal_request.appointment_date
                      and newer_active_request.appointment_time = terminal_request.appointment_time
                      and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                        lower(trim(coalesce(terminal_request.requested_service_name, '')))
                      and public.same_public_booking_operator_identity(
                        newer_active_request.requested_operator_id,
                        newer_active_request.requested_operator_name,
                        terminal_request.requested_operator_id,
                        terminal_request.requested_operator_name
                      )
                      and lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(newer_active_request.customer_name, ''),
                            coalesce(newer_active_request.customer_surname, '')
                          )
                        )
                      ) = lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(terminal_request.customer_name, ''),
                            coalesce(terminal_request.customer_surname, '')
                          )
                        )
                      )
                      and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                        coalesce(terminal_request.created_at, '-infinity'::timestamptz)
                  )
              )
            )
        ),
        '[]'::jsonb
      ),
    'paymentHoldOccupancy',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'data',r.appointment_date,'ora',to_char(r.appointment_time,'HH24:MI'),
      'servizio',r.requested_service_name,'durataMinuti',r.requested_duration_minutes,
      'operatoreId',r.requested_operator_id,'operatoreNome',r.requested_operator_name,
      'requiredRole',r.required_role,'phaseSnapshot',r.phase_snapshot,
      'phaseOperatorAssignments',r.phase_operator_assignments,'phaseOverlapOverrides',r.phase_overlap_overrides,
      'appointmentGroupId',r.appointment_group_id,'appointmentGroupOrder',r.appointment_group_order,
      'stato','In attesa','viewedByCliente',true,'viewedBySalon',true,
      'paymentHoldState',r.payment_hold_state,'paymentHoldExpiresAt',r.payment_hold_expires_at)
      order by r.appointment_date,r.appointment_time,r.id) from booking_requests r
      where r.workspace_id=v_workspace.id and r.status='pending'::request_status
        and r.payment_hold_state='awaiting_payment'),'[]'::jsonb),
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_2a5d2f2848d6709499b9(text) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.get_client_portal_snapshot(p_salon_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE payload jsonb; cid uuid; wid uuid; approved boolean:=false; own_requests uuid[]; own_appointments uuid[];
BEGIN
 payload:=salonpro_private.impl_2a5d2f2848d6709499b9(p_salon_code);
 IF payload IS NULL OR NOT salonpro_private.portal_enabled(p_salon_code) OR salonpro_private.portal_owner(p_salon_code) THEN RETURN payload; END IF;
 cid:=salonpro_private.portal_customer(p_salon_code); wid:=(payload#>>'{workspace,id}')::uuid;
 IF cid IS NULL AND salonpro_private.portal_proof_supplied() THEN RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(c.registration_status,'approved')='approved' INTO approved FROM public.customers c WHERE c.id=cid;
 IF coalesce(approved,false) THEN
 SELECT array_agg(r.id) INTO own_requests FROM public.booking_requests r WHERE r.workspace_id=wid
 AND salonpro_private.portal_owns_request(r.id,cid);
 SELECT array_agg(a.id) INTO own_appointments FROM public.appointments a WHERE a.workspace_id=wid
 AND salonpro_private.portal_owns_appointment(a.id,cid);
 END IF;
 RETURN payload || jsonb_build_object(
 'clienti',coalesce((SELECT jsonb_agg(CASE WHEN coalesce(approved,false) THEN e-'nota' ELSE
 jsonb_build_object('id',e->'id','nome','','email',e->'email','telefono',e->'telefono','registrationStatus','pending','fonte',e->'fonte') END)
 FROM jsonb_array_elements(coalesce(payload->'clienti','[]')) e WHERE cid IS NOT NULL AND e->>'id'=cid::text),'[]'),
 'appuntamenti',coalesce((SELECT jsonb_agg(CASE WHEN e->>'id'=ANY(own_appointments::text[]) THEN e-'nota'-'note'-'occasionalCustomer' ELSE
 (SELECT coalesce(jsonb_object_agg(k,v),'{}') FROM jsonb_each(e) x(k,v) WHERE k=ANY(ARRAY[
 'id','data','ora','servizio','durataMinuti','operatoreId','operatoreNome','phaseSnapshot','phaseConfig','phaseOperatorAssignments',
 'mestiereRichiesto','requiredRole','appointmentGroupId','appointmentGroupOrder','appointmentGroupSize','bookingRequestId','compositionId','dependencyServiceId','phaseOverlapOverrides','macchinarioIds','macchinarioNomi']))
 || jsonb_build_object('cliente',salonpro_private.portal_occupancy_alias(p_salon_code,e->>'data',e->>'cliente'),'prezzo',0) END) FROM jsonb_array_elements(coalesce(payload->'appuntamenti','[]')) e),'[]'),
 'richiestePrenotazione',coalesce((SELECT jsonb_agg(CASE WHEN e->>'id'=ANY(own_requests::text[]) THEN e ELSE
 (SELECT coalesce(jsonb_object_agg(k,v),'{}') FROM jsonb_each(e) x(k,v) WHERE k=ANY(ARRAY[
 'id','data','ora','servizio','durataMinuti','operatoreId','operatoreNome','phaseSnapshot','phaseConfig','phaseOperatorAssignments',
 'requiredRole','stato','appointmentGroupId','appointmentGroupOrder','appointmentGroupSize','macchinarioIds','macchinarioNomi','paymentHoldState']))
 || jsonb_build_object('nome',salonpro_private.portal_occupancy_alias(p_salon_code,e->>'data',trim(concat_ws(' ',e->>'nome',e->>'cognome'))),'cognome','','email','','telefono','','prezzo',0) END)
 FROM jsonb_array_elements(coalesce(payload->'richiestePrenotazione','[]')) e),'[]'));
END $$;


CREATE OR REPLACE FUNCTION salonpro_private.impl_759e6f772ea3babc3f57(p_salon_code text, p_appointment_group_id uuid, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_seed_customer_id uuid;
  v_customer_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_request record;
  v_results jsonb := '[]'::jsonb;
  v_cancelled_request_ids uuid[] := array[]::uuid[];
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'booking_request_not_found';
  end if;

  select request.customer_id
  into v_seed_customer_id
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = p_appointment_group_id
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  limit 1;

  if not found then
    raise exception 'booking_request_not_found';
  end if;

  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);
  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.defer_linked_customer_cancel_push', 'on', true);

  for v_request in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = p_appointment_group_id
      and (
        (v_seed_customer_id is not null and request.customer_id = v_seed_customer_id)
        or (
          v_customer_email is not null
          and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email
        )
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        )
      )
      and request.status::text in ('pending', 'accepted')
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    v_results := v_results || jsonb_build_array(
      public.cancel_public_booking_request(
        p_salon_code,
        v_request.id,
        p_customer_email::citext,
        p_customer_phone
      )
    );
    v_cancelled_request_ids := array_append(v_cancelled_request_ids, v_request.id);
  end loop;

  update public.appointment_groups
  set status = 'cancelled', updated_at = timezone('utc', now())
  where id = p_appointment_group_id
    and workspace_id = v_workspace_id
    and not exists (
      select 1
      from public.booking_requests as request
      where request.workspace_id = v_workspace_id
        and request.appointment_group_id = p_appointment_group_id
        and request.status::text in ('pending', 'accepted')
    );

  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);
  perform set_config('salonpro.skip_booking_request_push', 'off', true);
  perform set_config('salonpro.defer_linked_customer_cancel_push', 'off', true);
  perform public.queue_linked_customer_cancellation_owner_push_v1(
    v_workspace_id,
    p_appointment_group_id
  );

  return jsonb_build_object(
    'groupId', p_appointment_group_id,
    'cancelledRequestIds', to_jsonb(v_cancelled_request_ids),
    'cancelled', true,
    'results', v_results
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_759e6f772ea3babc3f57(text,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_public_booking_group_v1(p_salon_code text, p_appointment_group_id uuid, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_759e6f772ea3babc3f57(p_salon_code,p_appointment_group_id,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_ea2f58c51b5f89a37f93(p_salon_code text, p_request_id uuid, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_group_id uuid;
  v_seed_customer_id uuid;
  v_customer_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_request record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_cancelled_request_ids uuid[] := array[]::uuid[];
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'booking_request_not_found';
  end if;

  select request.appointment_group_id, request.customer_id
  into v_group_id, v_seed_customer_id
  from public.booking_requests as request
  where request.id = p_request_id
    and request.workspace_id = v_workspace_id
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  limit 1;

  if not found then
    raise exception 'booking_request_not_found';
  end if;

  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);

  if v_group_id is not null then
    perform set_config('salonpro.skip_booking_request_push', 'on', true);
    perform set_config('salonpro.defer_linked_customer_cancel_push', 'on', true);
  end if;

  for v_request in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and (
        (v_group_id is not null and request.appointment_group_id = v_group_id)
        or (v_group_id is null and request.id = p_request_id)
      )
      and (
        (v_seed_customer_id is not null and request.customer_id = v_seed_customer_id)
        or (
          v_customer_email is not null
          and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email
        )
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        )
      )
      and request.status::text in ('pending', 'accepted')
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    v_result := public.cancel_public_booking_request(
      p_salon_code,
      v_request.id,
      p_customer_email::citext,
      p_customer_phone
    );
    v_results := v_results || jsonb_build_array(v_result);
    v_cancelled_request_ids := array_append(v_cancelled_request_ids, v_request.id);
  end loop;

  if v_group_id is not null and not exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
      and request.status::text in ('pending', 'accepted')
  ) then
    update public.appointment_groups
    set status = 'cancelled',
        updated_at = timezone('utc', now())
    where id = v_group_id
      and workspace_id = v_workspace_id;
  end if;

  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);

  if v_group_id is not null then
    perform set_config('salonpro.skip_booking_request_push', 'off', true);
    perform set_config('salonpro.defer_linked_customer_cancel_push', 'off', true);
    perform public.queue_linked_customer_cancellation_owner_push_v1(
      v_workspace_id,
      v_group_id
    );
  end if;

  return jsonb_build_object(
    'bookingRequestId', p_request_id,
    'appointmentGroupId', v_group_id,
    'cancelledRequestIds', to_jsonb(v_cancelled_request_ids),
    'cancelled', true,
    'results', v_results
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_ea2f58c51b5f89a37f93(text,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_public_booking_request_or_group_v2(p_salon_code text, p_request_id uuid, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_ea2f58c51b5f89a37f93(p_salon_code,p_request_id,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_821b1491989440914269(p_salon_code text, p_waitlist_ids uuid[], p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_cancelled_count integer := 0;
  v_cancelled_entry public.booking_slot_waitlist%rowtype;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  if p_waitlist_ids is null or array_length(p_waitlist_ids, 1) is null then
    return 0;
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  for v_cancelled_entry in
    update public.booking_slot_waitlist as waitlist
    set
      status = 'cancelled',
      expires_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where waitlist.workspace_id = v_workspace_id
      and waitlist.id = any(p_waitlist_ids)
      and waitlist.status in ('waiting', 'notified', 'expired')
      and (
        (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
    returning *
  loop
    perform public.archive_public_slot_waitlist_entry(
      v_cancelled_entry.id,
      case
        when v_cancelled_entry.notified_at is not null then 'dismissed'
        else 'cancelled'
      end,
      case
        when v_cancelled_entry.notified_at is not null then 'customer_not_needed'
        else 'customer_cancelled'
      end
    );
    v_cancelled_count := v_cancelled_count + 1;
  end loop;

  return coalesce(v_cancelled_count, 0);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_821b1491989440914269(text,uuid[],citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cancel_public_slot_waitlist_alerts(p_salon_code text, p_waitlist_ids uuid[], p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_821b1491989440914269(p_salon_code,p_waitlist_ids,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_52937f6abe04d51f9349(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_app_instance_id text DEFAULT NULL::text, p_platform store_platform DEFAULT 'manual'::store_platform, p_stale_after_seconds integer DEFAULT 90)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_existing_instance_id text;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10);
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 90), 60);
begin
  if v_salon_code = '' then
    raise exception 'salon_code_required';
  end if;

  if v_customer_email is null and nullif(v_customer_phone, '') is null then
    raise exception 'customer_identity_required';
  end if;

  if nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    raise exception 'app_instance_required';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = v_salon_code
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select
    customer.id,
    nullif(trim(coalesce(customer.active_client_app_instance_id, '')), ''),
    customer.active_client_last_seen_at
  into
    v_customer_id,
    v_existing_instance_id,
    v_existing_last_seen_at
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
      or (nullif(v_customer_phone, '') is not null and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone)
    )
  order by
    case
      when v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text then 0
      else 1
    end,
    customer.updated_at desc nulls last,
    customer.created_at desc nulls last
  limit 1
  for update;

  if v_customer_id is null then
    raise exception 'customer_not_found';
  end if;

  if
    v_existing_instance_id is null
    or v_existing_instance_id = trim(p_app_instance_id)
    or v_existing_last_seen_at is null
    or v_existing_last_seen_at <= v_now - make_interval(secs => v_stale_after_seconds)
  then
    update public.customers
    set
      active_client_app_instance_id = trim(p_app_instance_id),
      active_client_platform = p_platform,
      active_client_claimed_at = case
        when v_existing_instance_id = trim(p_app_instance_id)
          then coalesce(active_client_claimed_at, v_now)
        else v_now
      end,
      active_client_last_seen_at = v_now,
      updated_at = v_now
    where id = v_customer_id;

    return query select true, 'ok'::text;
    return;
  end if;

  return query select false, 'active_on_another_client_device'::text;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_52937f6abe04d51f9349(text,citext,text,text,store_platform,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_public_customer_app_session(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_app_instance_id text DEFAULT NULL::text, p_platform store_platform DEFAULT 'manual'::store_platform, p_stale_after_seconds integer DEFAULT 90) RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,true);
 RETURN QUERY SELECT * FROM salonpro_private.impl_52937f6abe04d51f9349(p_salon_code,p_customer_email,p_customer_phone,p_app_instance_id,p_platform,p_stale_after_seconds); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_da9a4df9552a36950a6a(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(communication_id uuid, title text, body text, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace uuid;
  v_email text := nullif(lower(trim(p_customer_email::text)), '');
  v_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone,''), '\D+', '', 'g'),10),'');
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_candidate record;
  v_claimed integer;
begin
  if v_email is null and v_phone is null then return; end if;
  select id into v_workspace from public.workspaces where slug = lower(trim(p_salon_code));
  if v_workspace is null then return; end if;
  -- Serialize the matching recipient set (also covers matching duplicate customer rows).
  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text, 731));
  for v_candidate in
    select distinct c.id, coalesce(c.reminder_title, c.title) as title, coalesce(c.reminder_body, c.body) as body, c.reminder_ends_at, c.created_at
    from public.customer_communications c
    join public.customers u on u.workspace_id=v_workspace
    where c.workspace_id=v_workspace and c.kind='custom'
      and c.reminder_cancelled_at is null
      and (c.reminder_all_customers or exists(select 1 from public.customer_communication_recipients r where r.communication_id=c.id and r.customer_id=u.id))
      and not exists(select 1 from public.customer_communication_reminder_dismissals x where x.communication_id=c.id and x.customer_id=u.id)
      and c.reminder_starts_at <= now() and c.reminder_ends_at > now()
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
      and not exists (select 1 from public.customer_communication_reminder_days d
        where d.communication_id=c.id and d.customer_id=u.id and d.shown_day=v_today)
    order by c.created_at, c.id
  loop
    -- Materialize inbox membership for newly registered customers, without push delivery.
    insert into public.customer_communication_recipients(communication_id,customer_id,delivery_status)
    select v_candidate.id,u.id,'unavailable' from public.customers u
    where u.workspace_id=v_workspace
      and exists(select 1 from public.customer_communications c where c.id=v_candidate.id and c.reminder_all_customers)
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
    on conflict do nothing;
    insert into public.customer_communication_reminder_days(communication_id,customer_id,shown_day)
    select v_candidate.id, u.id, v_today
    from public.customer_communication_recipients r
    join public.customers u on u.id=r.customer_id and u.workspace_id=v_workspace
    where r.communication_id=v_candidate.id
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
    on conflict do nothing;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      return query select v_candidate.id, v_candidate.title, v_candidate.body, v_candidate.reminder_ends_at;
      return;
    end if;
  end loop;
end $function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_da9a4df9552a36950a6a(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_public_customer_daily_reminder(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(communication_id uuid, title text, body text, ends_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_da9a4df9552a36950a6a(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_3b0cfd7dd8214f03007d(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(communication_id uuid, title text, body text, ends_at timestamp with time zone, image_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select r.*,c.image_path from public.claim_public_customer_daily_reminder(p_salon_code,p_customer_email,p_customer_phone) r
 join public.customer_communications c on c.id=r.communication_id;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_3b0cfd7dd8214f03007d(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_public_customer_daily_reminder_v2(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(communication_id uuid, title text, body text, ends_at timestamp with time zone, image_path text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_3b0cfd7dd8214f03007d(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_dce9ed08f8e88e4e6dc2(p_communication_id uuid, p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w uuid;
  e text := nullif(lower(trim(p_customer_email::text)),'');
  p text := nullif(right(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'),10),'');
  n integer;
begin
  if e is null and p is null then return false; end if;
  select id into w from public.workspaces where slug=lower(trim(p_salon_code));
  insert into public.customer_communication_reminder_dismissals(communication_id,customer_id)
  select c.id,u.id from public.customer_communications c join public.customers u on u.workspace_id=c.workspace_id
  where c.id=p_communication_id and c.workspace_id=w and c.reminder_starts_at is not null
    and (c.reminder_all_customers or exists(select 1 from public.customer_communication_recipients r where r.communication_id=c.id and r.customer_id=u.id))
    and (e is null or lower(trim(u.email::text))=e)
    and (p is null or right(regexp_replace(coalesce(u.phone,''),'\D','','g'),10)=p)
  on conflict (communication_id,customer_id) do update set dismissed_at=excluded.dismissed_at;
  get diagnostics n = row_count;
  return n>0;
end $function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_dce9ed08f8e88e4e6dc2(uuid,text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_public_customer_popup_v1(p_communication_id uuid, p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_dce9ed08f8e88e4e6dc2(p_communication_id,p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_d8b85bef15d497a94f8a(p_salon_code text, p_idempotency_key text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_group public.appointment_groups%rowtype;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_request_ids jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_all_accepted boolean := false;
  v_any_active boolean := false;
  v_root_request record;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = ''
    or trim(coalesce(p_idempotency_key, '')) = ''
    or (v_customer_email is null and v_customer_phone is null)
  then
    return null;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(p_salon_code))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is null then
    return null;
  end if;

  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.source = 'frontend'
    and appointment_group.idempotency_key = trim(p_idempotency_key)
    and appointment_group.status = 'active'
    and coalesce(appointment_group.metadata ->> 'dependencyServiceId', '') <> ''
  limit 1;

  if v_group.id is null then
    return null;
  end if;

  -- Do not disclose a group merely because its idempotency key is known.
  if not exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group.id
      and (
        (v_customer_email is not null and request.customer_email = v_customer_email)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  ) then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(request.id order by request.appointment_group_order, request.created_at, request.id),
      '[]'::jsonb
    ),
    count(*)::integer,
    bool_and(request.status = 'accepted'::public.request_status),
    bool_or(request.status in ('pending'::public.request_status, 'accepted'::public.request_status))
  into v_request_ids, v_item_count, v_all_accepted, v_any_active
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group.id
    and request.status in ('pending'::public.request_status, 'accepted'::public.request_status);

  -- A dependency is valid only when both phases are present.  Never turn a
  -- partial write into a false success acknowledgement.
  if v_item_count <> 2 or not coalesce(v_any_active, false) then
    return null;
  end if;

  select
    request.id,
    request.status,
    request.created_at,
    request.viewed_by_salon,request.payment_hold_state,request.payment_hold_expires_at,request.payment_hold_batch_id
  into v_root_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group.id
    and request.status in ('pending'::public.request_status, 'accepted'::public.request_status)
  order by request.appointment_group_order nulls first, request.created_at, request.id
  limit 1;

  return jsonb_build_object(
    'id', v_root_request.id,
    'groupId', v_group.id,
    'requestIds', v_request_ids,
    'itemCount', v_item_count,
    'status', case when coalesce(v_all_accepted, false) then 'accepted' else 'pending' end,
    'createdAt', v_root_request.created_at,
    'viewedBySalon', coalesce(v_root_request.viewed_by_salon, false),'paymentHoldState',v_root_request.payment_hold_state,'paymentHoldExpiresAt',v_root_request.payment_hold_expires_at,'paymentHoldBatchId',v_root_request.payment_hold_batch_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_d8b85bef15d497a94f8a(text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.find_public_booking_dependency_by_idempotency_v1(p_salon_code text, p_idempotency_key text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_d8b85bef15d497a94f8a(p_salon_code,p_idempotency_key,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_39793cd381260893e884(p_salon_code text, p_appointment_date date, p_appointment_time time without time zone, p_requested_service_name text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_requested_service_name text := lower(trim(coalesce(p_requested_service_name, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_booking_request record;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    return null;
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is null then
    return null;
  end if;

  select
    booking_request.id,
    booking_request.workspace_id,
    booking_request.status,
    booking_request.appointment_date,
    booking_request.appointment_time,
    booking_request.requested_service_name,
    booking_request.customer_email,
    booking_request.customer_phone,
    booking_request.created_at,
    booking_request.updated_at,
    booking_request.cancellation_source,
    booking_request.appointment_group_id,
    booking_request.payment_hold_state,booking_request.payment_hold_expires_at,booking_request.payment_hold_batch_id
  into v_booking_request
  from public.booking_requests as booking_request
  left join public.appointment_groups as appointment_group
    on appointment_group.workspace_id = booking_request.workspace_id
   and appointment_group.id = booking_request.appointment_group_id
  where booking_request.workspace_id = v_workspace_id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and booking_request.status in ('pending', 'accepted')
    and (
      lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_requested_service_name
      or (
        booking_request.appointment_group_id is not null
        and coalesce(booking_request.appointment_group_order, 0) = 0
        and lower(trim(coalesce(appointment_group.title, ''))) = v_requested_service_name
      )
    )
    and (
      (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
    )
  order by
    case
      when lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_requested_service_name then 0
      else 1
    end,
    case booking_request.status when 'accepted' then 0 when 'pending' then 1 else 2 end,
    booking_request.updated_at desc nulls last,
    booking_request.created_at desc nulls last
  limit 1;

  if v_booking_request.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_booking_request.id,
    'workspaceId', v_booking_request.workspace_id,
    'status', v_booking_request.status,
    'appointmentDate', v_booking_request.appointment_date,
    'appointmentTime', v_booking_request.appointment_time,
    'serviceName', v_booking_request.requested_service_name,
    'appointmentGroupId', v_booking_request.appointment_group_id,
    'paymentHoldState',v_booking_request.payment_hold_state,'paymentHoldExpiresAt',v_booking_request.payment_hold_expires_at,'paymentHoldBatchId',v_booking_request.payment_hold_batch_id,
    'customerEmail', coalesce(v_booking_request.customer_email::text, ''),
    'customerPhone', coalesce(v_booking_request.customer_phone, ''),
    'createdAt', v_booking_request.created_at,
    'updatedAt', v_booking_request.updated_at,
    'cancellationSource', v_booking_request.cancellation_source
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_39793cd381260893e884(text,date,time without time zone,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.find_public_booking_request_by_composite(p_salon_code text, p_appointment_date date, p_appointment_time time without time zone, p_requested_service_name text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_39793cd381260893e884(p_salon_code,p_appointment_date,p_appointment_time,p_requested_service_name,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_7beb4e0d8dd046eaeb39(p_salon_code text, p_customer_email text, p_customer_phone text)
 RETURNS TABLE(request_id uuid, operator_change_status text, service_name text, appointment_date date, appointment_time time without time zone, duration_minutes integer, original_operator_id text, original_operator_name text, proposed_operator_id text, proposed_operator_name text, requested_at timestamp with time zone, expires_at timestamp with time zone, responded_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    request.id,
    request.operator_change_status,
    request.requested_service_name,
    request.appointment_date,
    request.appointment_time,
    request.requested_duration_minutes,
    request.operator_change_original_id,
    request.operator_change_original_name,
    request.operator_change_proposed_id,
    request.operator_change_proposed_name,
    request.operator_change_requested_at,
    request.operator_change_expires_at,
    request.operator_change_responded_at
  from public.booking_requests as request
  join public.workspaces as workspace
    on workspace.id = request.workspace_id
  where lower(trim(workspace.slug)) = lower(trim(coalesce(p_salon_code, '')))
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
      ''
    ) is not null
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10)
    and request.operator_change_status is not null
    and (
      (
        request.status::text = 'pending'
        and request.operator_change_status = 'pending'
      )
      or (
        request.operator_change_status <> 'pending'
        and request.operator_change_responded_at >=
          timezone('utc', now()) - interval '30 days'
      )
    )
  order by request.operator_change_requested_at desc nulls last;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_7beb4e0d8dd046eaeb39(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_booking_operator_changes_v1(p_salon_code text, p_customer_email text, p_customer_phone text) RETURNS TABLE(request_id uuid, operator_change_status text, service_name text, appointment_date date, appointment_time time without time zone, duration_minutes integer, original_operator_id text, original_operator_name text, proposed_operator_id text, proposed_operator_name text, requested_at timestamp with time zone, expires_at timestamp with time zone, responded_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_7beb4e0d8dd046eaeb39(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_864f1c94729444a5a7c6(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    communication.id as communication_id,
    communication.kind,
    communication.title,
    communication.body,
    communication.appointment_id,
    communication.created_at,
    recipient.read_at
  from public.customer_communication_recipients as recipient
  join public.customer_communications as communication
    on communication.id = recipient.communication_id
  join public.customers as customer
    on customer.id = recipient.customer_id
  where communication.workspace_id = v_workspace_id
    and customer.workspace_id = v_workspace_id
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
    )
  order by communication.created_at desc
  limit 100;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_864f1c94729444a5a7c6(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_communications(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_864f1c94729444a5a7c6(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_57b18121e1d33b3c72f7(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_communication_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  if (p_before_created_at is null) <> (p_before_communication_id is null) then
    raise exception using
      errcode = '22023',
      message = 'invalid_public_customer_communications_cursor';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  with candidate_communications as (
    select
      communication.id as communication_id,
      communication.kind,
      communication.title,
      communication.body,
      communication.appointment_id,
      communication.created_at
    from public.customer_communications as communication
    where communication.workspace_id = v_workspace_id
      and (
        p_before_created_at is null
        or (communication.created_at, communication.id) <
          (p_before_created_at, p_before_communication_id)
      )
      and exists (
        select 1
        from public.customer_communication_recipients as recipient
        join public.customers as customer
          on customer.id = recipient.customer_id
        where recipient.communication_id = communication.id
          and customer.workspace_id = v_workspace_id
          and (
            v_customer_email is null
            or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
          )
          and (
            v_customer_phone is null
            or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
              v_customer_phone
          )
      )
    order by communication.created_at desc, communication.id desc
    limit v_limit
  )
  select
    candidate.communication_id,
    candidate.kind,
    candidate.title,
    candidate.body,
    candidate.appointment_id,
    candidate.created_at,
    recipient_state.read_at
  from candidate_communications as candidate
  cross join lateral (
    select
      case
        when count(*) filter (where recipient.read_at is null) > 0
          then null::timestamptz
        else max(recipient.read_at)
      end as read_at
    from public.customer_communication_recipients as recipient
    join public.customers as customer
      on customer.id = recipient.customer_id
    where recipient.communication_id = candidate.communication_id
      and customer.workspace_id = v_workspace_id
      and (
        v_customer_email is null
        or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      and (
        v_customer_phone is null
        or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
  ) as recipient_state
  order by candidate.created_at desc, candidate.communication_id desc;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_57b18121e1d33b3c72f7(text,citext,text,timestamp with time zone,uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_communications_page_v1(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_communication_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100) RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_57b18121e1d33b3c72f7(p_salon_code,p_customer_email,p_customer_phone,p_before_created_at,p_before_communication_id,p_limit); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_cd24a5a8188ae4fc1fe4(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_communication_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone, image_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select r.*,c.image_path from public.get_public_customer_communications_page_v1(p_salon_code,p_customer_email,p_customer_phone,p_before_created_at,p_before_communication_id,p_limit) r
 join public.customer_communications c on c.id=r.communication_id order by r.created_at desc,r.communication_id desc;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_cd24a5a8188ae4fc1fe4(text,citext,text,timestamp with time zone,uuid,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_communications_page_v2(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_communication_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100) RETURNS TABLE(communication_id uuid, kind text, title text, body text, appointment_id text, created_at timestamp with time zone, read_at timestamp with time zone, image_path text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_cd24a5a8188ae4fc1fe4(p_salon_code,p_customer_email,p_customer_phone,p_before_created_at,p_before_communication_id,p_limit); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_70b759155143f0267cfe(p_salon_code text, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_global_auto boolean := false;
  v_mode text := 'inherit';
  v_overrides jsonb := '{}'::jsonb;
  v_blocked_services jsonb := '[]'::jsonb;
  v_blocked_compositions jsonb := '[]'::jsonb;
begin
  select workspace.id, coalesce(workspace.auto_accept_booking_requests, false)
  into v_workspace_id, v_global_auto
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (workspace.is_internal_tester is true or workspace.subscription_status in ('demo', 'active'))
  limit 1;

  if v_workspace_id is null then
    return jsonb_build_object('customerFound', false, 'effectiveAutoAccept', false);
  end if;

  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is not null
  then
    select customer.id into v_customer_id
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.is_active is not false
      and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
      and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
        regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    order by customer.updated_at desc
    limit 1;
  end if;

  if v_customer_id is not null then
    select coalesce(policy.acceptance_mode, 'inherit') into v_mode
    from (select 1) as singleton
    left join public.customer_online_booking_policies as policy
      on policy.workspace_id = v_workspace_id and policy.customer_id = v_customer_id;

    select
      coalesce(jsonb_object_agg(override.service_id::text, override.is_allowed), '{}'::jsonb),
      coalesce(jsonb_agg(override.service_id), '[]'::jsonb)
    into v_overrides, v_blocked_services
    from public.customer_online_service_overrides as override
    where override.workspace_id = v_workspace_id
      and override.customer_id = v_customer_id
      and override.is_allowed is false;

    select coalesce(jsonb_agg(distinct blocked.composition_id), '[]'::jsonb)
    into v_blocked_compositions
    from (
      select direct.composition_id
      from public.customer_online_composition_overrides as direct
      where direct.workspace_id = v_workspace_id
        and direct.customer_id = v_customer_id
        and direct.is_allowed is false
      union
      select item.composition_id
      from public.service_composition_items as item
      join public.customer_online_service_overrides as override
        on override.workspace_id = item.workspace_id
        and override.customer_id = v_customer_id
        and override.service_id = item.service_id
        and override.is_allowed is false
      where item.workspace_id = v_workspace_id
    ) as blocked;
  end if;

  return jsonb_build_object(
    'customerFound', v_customer_id is not null,
    'acceptanceMode', v_mode,
    'effectiveAutoAccept', case v_mode
      when 'auto' then true
      when 'manual' then false
      else v_global_auto
    end,
    'serviceOverrides', coalesce(v_overrides, '{}'::jsonb),
    'blockedServiceIds', coalesce(v_blocked_services, '[]'::jsonb),
    'blockedCompositionIds', coalesce(v_blocked_compositions, '[]'::jsonb)
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_70b759155143f0267cfe(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_online_booking_policy_v1(p_salon_code text, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_70b759155143f0267cfe(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_a09c82e2a71ae5e02c48(p_salon_code text, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_workspace_id uuid;
  v_customer_id uuid;
  v_allowed boolean := true;
begin
  v_result := public.get_public_customer_online_booking_policy_v1(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is not null
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is not null
  then
    select customer.id into v_customer_id
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.is_active is not false
      and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
      and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
        regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    order by customer.updated_at desc
    limit 1;
  end if;

  if v_customer_id is not null then
    select coalesce(policy.allow_same_day_same_service, true)
    into v_allowed
    from (select 1) as singleton
    left join public.customer_online_booking_policies as policy
      on policy.workspace_id = v_workspace_id
      and policy.customer_id = v_customer_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'allowSameDaySameService', coalesce(v_allowed, true)
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_a09c82e2a71ae5e02c48(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_online_booking_policy_v2(p_salon_code text, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_a09c82e2a71ae5e02c48(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_3c025fa6e6358cd2ac38(p_salon_code text, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_result jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (workspace.is_internal_tester is true or workspace.subscription_status in ('demo', 'active'))
  limit 1;

  if v_workspace_id is null then return '{}'::jsonb; end if;
  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is null
    or nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is null
  then
    return '{}'::jsonb;
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is null then return '{}'::jsonb; end if;

  select coalesce(
    jsonb_object_agg(
      duration_override.service_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'serviceId', duration_override.service_id,
        'durationMinutes', duration_override.duration_minutes,
        'phaseConfig', duration_override.phase_config
      ))
    ),
    '{}'::jsonb
  ) into v_result
  from public.customer_service_duration_overrides as duration_override
  where duration_override.workspace_id = v_workspace_id
    and duration_override.customer_id = v_customer_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_3c025fa6e6358cd2ac38(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_service_duration_overrides_v1(p_salon_code text, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_3c025fa6e6358cd2ac38(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_83a3be6b52ee578a63f9(p_salon_code text, p_customer_email text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_result jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (workspace.is_internal_tester is true or workspace.subscription_status in ('demo', 'active'))
  limit 1;

  if v_workspace_id is null then return '{}'::jsonb; end if;
  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is null
    or nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is null
  then
    return '{}'::jsonb;
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is null then return '{}'::jsonb; end if;

  select coalesce(
    jsonb_object_agg(
      price_override.service_id::text,
      jsonb_build_object(
        'serviceId', price_override.service_id,
        'price', price_override.price
      )
    ),
    '{}'::jsonb
  ) into v_result
  from public.customer_service_price_overrides as price_override
  where price_override.workspace_id = v_workspace_id
    and price_override.customer_id = v_customer_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_83a3be6b52ee578a63f9(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_service_price_overrides_v1(p_salon_code text, p_customer_email text, p_customer_phone text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_83a3be6b52ee578a63f9(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_d4da14bea98163ad79ba(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, appointment_group_id uuid, status request_status, cancellation_source text, viewed_by_customer boolean, customer_email citext, customer_phone text, appointment_date date, appointment_time time without time zone, requested_service_name text, updated_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    request.id,
    request.appointment_group_id,
    request.status,
    request.cancellation_source,
    request.viewed_by_customer,
    request.customer_email,
    request.customer_phone,
    request.appointment_date,
    request.appointment_time,
    request.requested_service_name,
    request.updated_at,
    request.created_at
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.viewed_by_customer = false
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
    and (
      (
        request.status::text = 'pending'
        and request.operator_change_status = 'pending'
      )
      or request.status::text in (
        'accepted',
        'auto_accepted',
        'rejected',
        'declined'
      )
      or (
        request.status::text = 'cancelled'
        and lower(trim(coalesce(request.cancellation_source, ''))) = 'salone'
      )
    )
  order by request.updated_at desc, request.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_d4da14bea98163ad79ba(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_unread_booking_badge_rows(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(id uuid, appointment_group_id uuid, status request_status, cancellation_source text, viewed_by_customer boolean, customer_email citext, customer_phone text, appointment_date date, appointment_time time without time zone, requested_service_name text, updated_at timestamp with time zone, created_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_d4da14bea98163ad79ba(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_56e8702384b0be5c5035(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_unread_count bigint := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  select count(distinct communication.id)
  into v_unread_count
  from public.customer_communication_recipients as recipient
  join public.customer_communications as communication
    on communication.id = recipient.communication_id
  join public.customers as customer
    on customer.id = recipient.customer_id
  where communication.workspace_id = v_workspace_id
    and customer.workspace_id = v_workspace_id
    and recipient.read_at is null
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
        v_customer_phone
    );

  return coalesce(v_unread_count, 0);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_56e8702384b0be5c5035(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_unread_communication_count_v1(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_56e8702384b0be5c5035(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_ca39ac46be5ddd751948(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, appointment_date date, appointment_time time without time zone, requested_service_name text, requested_operator_id text, requested_operator_name text, notified_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    waitlist.id,
    waitlist.appointment_date,
    waitlist.appointment_time,
    waitlist.requested_service_name,
    waitlist.requested_operator_id,
    waitlist.requested_operator_name,
    waitlist.notified_at,
    waitlist.created_at,
    waitlist.updated_at
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status = 'notified'
    and waitlist.viewed_by_customer = false
    and (
      waitlist.appointment_date > timezone('Europe/Rome', now())::date
      or (
        waitlist.appointment_date = timezone('Europe/Rome', now())::date
        and waitlist.appointment_time > timezone('Europe/Rome', now())::time
      )
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
  order by waitlist.notified_at desc nulls last, waitlist.updated_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_ca39ac46be5ddd751948(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_unread_waitlist_badge_rows(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(id uuid, appointment_date date, appointment_time time without time zone, requested_service_name text, requested_operator_id text, requested_operator_name text, notified_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_ca39ac46be5ddd751948(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_c14bdb70a481c38e8d44(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, workspace_id uuid, appointment_date date, appointment_time time without time zone, requested_service_name text, requested_duration_minutes integer, customer_name text, customer_surname text, customer_email citext, customer_phone text, customer_instagram text, notes text, status text, notified_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, requested_operator_id text, requested_operator_name text, archived_status text, archived_reason text, archived_at timestamp with time zone, is_archived boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  perform public.process_public_slot_waitlist(v_workspace_id, null, null);

  return query
  select combined.*
  from (
    select
      waitlist.id,
      waitlist.workspace_id,
      waitlist.appointment_date,
      waitlist.appointment_time,
      waitlist.requested_service_name,
      waitlist.requested_duration_minutes,
      waitlist.customer_name,
      waitlist.customer_surname,
      waitlist.customer_email,
      waitlist.customer_phone,
      waitlist.customer_instagram,
      waitlist.notes,
      waitlist.status,
      waitlist.notified_at,
      waitlist.expires_at,
      waitlist.created_at,
      waitlist.updated_at,
      waitlist.requested_operator_id,
      waitlist.requested_operator_name,
      null::text as archived_status,
      null::text as archived_reason,
      null::timestamptz as archived_at,
      false as is_archived
    from public.booking_slot_waitlist as waitlist
    where waitlist.workspace_id = v_workspace_id
      and waitlist.status in ('waiting', 'notified', 'expired')
      and (
        (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )

    union all

    select
      coalesce(archive.source_waitlist_id, archive.id) as id,
      archive.workspace_id,
      archive.appointment_date,
      archive.appointment_time,
      archive.requested_service_name,
      archive.requested_duration_minutes,
      archive.customer_name,
      archive.customer_surname,
      archive.customer_email,
      archive.customer_phone,
      archive.customer_instagram,
      archive.notes,
      'expired'::text as status,
      archive.notified_at,
      archive.expires_at,
      coalesce(archive.original_created_at, archive.archived_at) as created_at,
      archive.archived_at as updated_at,
      archive.requested_operator_id,
      archive.requested_operator_name,
      archive.archived_status,
      archive.archived_reason,
      archive.archived_at,
      true as is_archived
    from public.booking_slot_waitlist_archive as archive
    where archive.workspace_id = v_workspace_id
      and (
        (v_customer_email is not null and lower(trim(archive.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(archive.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  ) as combined
  order by coalesce(combined.archived_at, combined.notified_at, combined.updated_at, combined.created_at) desc;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_c14bdb70a481c38e8d44(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_waitlist_alerts(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS TABLE(id uuid, workspace_id uuid, appointment_date date, appointment_time time without time zone, requested_service_name text, requested_duration_minutes integer, customer_name text, customer_surname text, customer_email citext, customer_phone text, customer_instagram text, notes text, status text, notified_at timestamp with time zone, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, requested_operator_id text, requested_operator_name text, archived_status text, archived_reason text, archived_at timestamp with time zone, is_archived boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_c14bdb70a481c38e8d44(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_4b855d6fc20717783410(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('booking_plan',case when a.is_archived then (select ar.booking_plan from public.booking_slot_waitlist_archive ar where ar.source_waitlist_id=a.id and ar.archived_at=a.archived_at limit 1) else w.booking_plan end)), '[]'::jsonb)
 from public.get_public_customer_waitlist_alerts(p_salon_code,p_customer_email,p_customer_phone) a
 left join public.booking_slot_waitlist w on w.id=a.id;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_4b855d6fc20717783410(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_customer_waitlist_alerts_v2(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_4b855d6fc20717783410(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_ef5d93080b8fe6f120cb(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_appointment_date date DEFAULT NULL::date, p_requested_service_name text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS SETOF booking_slot_waitlist
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_requested_operator_id text;
  v_requested_operator_name text;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_requested_operator_id := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  perform public.process_public_slot_waitlist(v_workspace_id, p_appointment_date, null);

  return query
  select waitlist.*
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace_id
    and (
      waitlist.status = 'waiting'
      or (
        waitlist.status = 'notified'
        and (waitlist.expires_at is null or waitlist.expires_at > timezone('utc', now()))
      )
    )
    and (p_appointment_date is null or waitlist.appointment_date = p_appointment_date)
    and (
      p_requested_service_name is null
      or lower(trim(waitlist.requested_service_name)) = lower(trim(p_requested_service_name))
    )
    and (
      (
        v_requested_operator_id is null
        and v_requested_operator_name is null
        and nullif(trim(coalesce(waitlist.requested_operator_id, '')), '') is null
        and nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), '') is null
      )
      or (
        v_requested_operator_id is not null
        and nullif(trim(coalesce(waitlist.requested_operator_id, '')), '') = v_requested_operator_id
      )
      or (
        v_requested_operator_id is null
        and v_requested_operator_name is not null
        and nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), '') = v_requested_operator_name
      )
    )
    and (
      (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
  order by waitlist.created_at asc;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_ef5d93080b8fe6f120cb(text,citext,text,date,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_slot_waitlist_entries(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_appointment_date date DEFAULT NULL::date, p_requested_service_name text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text) RETURNS SETOF booking_slot_waitlist
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN QUERY SELECT * FROM salonpro_private.impl_ef5d93080b8fe6f120cb(p_salon_code,p_customer_email,p_customer_phone,p_appointment_date,p_requested_service_name,p_requested_operator_id,p_requested_operator_name); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_f4414c43c696d5656607(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_app_instance_id text DEFAULT NULL::text, p_stale_after_seconds integer DEFAULT 90)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_existing_instance_id text;
  v_existing_last_seen_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10);
  v_stale_after_seconds integer := greatest(coalesce(p_stale_after_seconds, 90), 60);
begin
  if v_salon_code = '' or nullif(trim(coalesce(p_app_instance_id, '')), '') is null then
    return false;
  end if;

  if v_customer_email is null and nullif(v_customer_phone, '') is null then
    return false;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = v_salon_code
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  select
    customer.id,
    nullif(trim(coalesce(customer.active_client_app_instance_id, '')), ''),
    customer.active_client_last_seen_at
  into
    v_customer_id,
    v_existing_instance_id,
    v_existing_last_seen_at
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
      or (nullif(v_customer_phone, '') is not null and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone)
    )
  order by
    case
      when v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text then 0
      else 1
    end,
    customer.updated_at desc nulls last,
    customer.created_at desc nulls last
  limit 1
  for update;

  if v_customer_id is null then
    return false;
  end if;

  if v_existing_instance_id = trim(p_app_instance_id) then
    update public.customers
    set
      active_client_last_seen_at = v_now,
      updated_at = v_now
    where id = v_customer_id;

    return true;
  end if;

  if
    v_existing_instance_id is null
    or v_existing_last_seen_at is null
    or v_existing_last_seen_at <= v_now - make_interval(secs => v_stale_after_seconds)
  then
    return false;
  end if;

  return false;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_f4414c43c696d5656607(text,citext,text,text,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.heartbeat_public_customer_app_session(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_app_instance_id text DEFAULT NULL::text, p_stale_after_seconds integer DEFAULT 90) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,true);
 RETURN salonpro_private.impl_f4414c43c696d5656607(p_salon_code,p_customer_email,p_customer_phone,p_app_instance_id,p_stale_after_seconds); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_49bb145f817b4111bfa3(p_salon_code text, p_requested_service_name text, p_requested_duration_minutes integer DEFAULT 60, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_customer_name text DEFAULT NULL::text, p_customer_surname text DEFAULT ''::text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace public.workspaces%rowtype;
  v_existing public.booking_slot_waitlist%rowtype;
  v_reusable public.booking_slot_waitlist%rowtype;
  v_entry public.booking_slot_waitlist%rowtype;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_requested_operator_id text;
  v_requested_operator_name text;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_surname := trim(coalesce(p_customer_surname, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_service_name := trim(coalesce(p_requested_service_name, ''));
  v_requested_operator_id := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_requested_operator_name, '')), '');

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  -- Waiting for a free slot is a booking action too. Use the locking gate
  -- before any reuse/cancellation write, including the already-available path.
  perform public.assert_customer_registration_approved_for_write_v1(
    v_workspace.id, v_customer_email::text, v_customer_phone);

  if v_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  if public.is_public_booking_slot_available(
    v_workspace.id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_service_name,
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', null,
      'status', 'available',
      'alreadyJoined', false,
      'slotAlreadyAvailable', true
    );
  end if;

  select waitlist.*
  into v_existing
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
    and waitlist.status = 'waiting'
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  if v_existing.id is not null then
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and id <> v_existing.id
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', v_existing.id,
      'status', v_existing.status,
      'alreadyJoined', true
    );
  end if;

  select waitlist.*
  into v_reusable
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  update public.booking_slot_waitlist
  set
    status = 'cancelled',
    expires_at = null,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace.id
    and appointment_date = p_appointment_date
    and appointment_time = p_appointment_time
    and lower(trim(requested_service_name)) = lower(v_service_name)
    and lower(trim(customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
    and (v_reusable.id is null or id <> v_reusable.id)
    and status in ('waiting', 'notified', 'expired');

  if v_reusable.id is not null then
    update public.booking_slot_waitlist
    set
      requested_duration_minutes = greatest(coalesce(p_requested_duration_minutes, 60), 1),
      requested_operator_id = v_requested_operator_id,
      requested_operator_name = v_requested_operator_name,
      customer_name = v_customer_name,
      customer_surname = v_customer_surname,
      customer_email = v_customer_email,
      customer_phone = v_customer_phone,
      customer_instagram = v_customer_instagram,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = 'waiting',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where id = v_reusable.id
    returning * into v_entry;
  else
    insert into public.booking_slot_waitlist (
      workspace_id,
      appointment_date,
      appointment_time,
      requested_service_name,
      requested_duration_minutes,
      requested_operator_id,
      requested_operator_name,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      notes,
      status,
      notified_at,
      expires_at
    )
    values (
      v_workspace.id,
      p_appointment_date,
      p_appointment_time,
      v_service_name,
      greatest(coalesce(p_requested_duration_minutes, 60), 1),
      v_requested_operator_id,
      v_requested_operator_name,
      v_customer_name,
      v_customer_surname,
      v_customer_email,
      v_customer_phone,
      v_customer_instagram,
      nullif(trim(coalesce(p_notes, '')), ''),
      'waiting',
      null,
      null
    )
    returning * into v_entry;
  end if;

  select waitlist.*
  into v_entry
  from public.booking_slot_waitlist as waitlist
  where waitlist.id = v_entry.id;

  return jsonb_build_object(
    'waitlistEntryId', v_entry.id,
    'status', v_entry.status,
    'alreadyJoined', false,
    'expiresAt', v_entry.expires_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_49bb145f817b4111bfa3(text,text,integer,date,time without time zone,text,text,citext,text,text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.join_public_slot_waitlist(p_salon_code text, p_requested_service_name text, p_requested_duration_minutes integer DEFAULT 60, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_customer_name text DEFAULT NULL::text, p_customer_surname text DEFAULT ''::text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_49bb145f817b4111bfa3(p_salon_code,p_requested_service_name,p_requested_duration_minutes,p_appointment_date,p_appointment_time,p_customer_name,p_customer_surname,p_customer_email,p_customer_phone,p_customer_instagram,p_notes,p_requested_operator_id,p_requested_operator_name); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_2ff3aa573ad94dcad4a3(p_salon_code text, p_requested_service_name text, p_requested_duration_minutes integer DEFAULT 60, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_customer_name text DEFAULT NULL::text, p_customer_surname text DEFAULT ''::text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text, p_booking_plan jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace public.workspaces%rowtype;
  v_probe public.booking_slot_waitlist%rowtype;
  v_existing public.booking_slot_waitlist%rowtype;
  v_reusable public.booking_slot_waitlist%rowtype;
  v_entry public.booking_slot_waitlist%rowtype;
  v_customer_name text;
  v_customer_surname text;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_instagram text;
  v_service_name text;
  v_requested_operator_id text;
  v_requested_operator_name text;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and (w.is_internal_tester is true or w.subscription_status in ('demo', 'active'))
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_customer_name := trim(coalesce(p_customer_name, ''));
  v_customer_surname := trim(coalesce(p_customer_surname, ''));
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_service_name := trim(coalesce(p_requested_service_name, ''));
  v_requested_operator_id := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name := nullif(trim(coalesce(p_requested_operator_name, '')), '');

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  -- Waiting for a free slot is a booking action too. Use the locking gate
  -- before any reuse/cancellation write, including the already-available path.
  perform public.assert_customer_registration_approved_for_write_v1(
    v_workspace.id, v_customer_email::text, v_customer_phone);

  if v_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  if p_booking_plan is null or p_booking_plan->>'version' is distinct from '1' or coalesce(p_requested_duration_minutes,0) not between 1 and 1440 then
    raise exception 'waitlist_booking_plan_required';
  end if;
  v_probe.workspace_id := v_workspace.id;
  v_probe.appointment_date := p_appointment_date;
  v_probe.appointment_time := p_appointment_time;
  v_probe.requested_duration_minutes := p_requested_duration_minutes;
  v_probe.requested_service_name := v_service_name;
  v_probe.requested_operator_id := v_requested_operator_id;
  v_probe.requested_operator_name := v_requested_operator_name;
  v_probe.customer_email := v_customer_email;
  v_probe.customer_phone := v_customer_phone;
  v_probe.customer_name := v_customer_name;
  v_probe.customer_surname := v_customer_surname;
  v_probe.booking_plan := p_booking_plan;
  if p_booking_plan ? 'range' then
    if p_booking_plan->'range'->>'key' not in ('day','morning','afternoon')
       or (p_booking_plan->'range'->>'startMinute')::integer < 0
       or (p_booking_plan->'range'->>'endMinute')::integer > 1439
       or (p_booking_plan->'range'->>'startMinute')::integer > (p_booking_plan->'range'->>'endMinute')::integer
       or (p_booking_plan->'range'->>'stepMinutes')::integer not between 1 and 120 then
      raise exception 'invalid_waitlist_range';
    end if;
    if p_appointment_time <> make_time((p_booking_plan->'range'->>'endMinute')::integer / 60, (p_booking_plan->'range'->>'endMinute')::integer % 60,0) then
      raise exception 'invalid_waitlist_range_end';
    end if;
  end if;
  if not (p_booking_plan ? 'range') and public.is_waitlist_plan_available_v1(v_probe) then
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and booking_plan is not distinct from p_booking_plan
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', null,
      'status', 'available',
      'alreadyJoined', false,
      'slotAlreadyAvailable', true
    );
  end if;

  select waitlist.*
  into v_existing
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
    and waitlist.status = 'waiting'
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  if v_existing.id is not null then
    if v_existing.booking_plan is distinct from p_booking_plan then
      raise exception 'waitlist_existing_plan_differs';
    end if;
    update public.booking_slot_waitlist
    set
      status = 'cancelled',
      expires_at = null,
      updated_at = timezone('utc', now())
    where workspace_id = v_workspace.id
      and appointment_date = p_appointment_date
      and appointment_time = p_appointment_time
      and lower(trim(requested_service_name)) = lower(v_service_name)
      and lower(trim(customer_email::text)) = v_customer_email::text
      and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
      and id <> v_existing.id
      and status in ('waiting', 'notified', 'expired');

    return jsonb_build_object(
      'waitlistEntryId', v_existing.id,
      'status', v_existing.status,
      'alreadyJoined', true
    );
  end if;

  select waitlist.*
  into v_reusable
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace.id
    and waitlist.appointment_date = p_appointment_date
    and waitlist.appointment_time = p_appointment_time
    and lower(trim(waitlist.requested_service_name)) = lower(v_service_name)
    and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
      coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
      coalesce(lower(v_requested_operator_name), '')
  order by coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at) desc, waitlist.created_at desc
  limit 1;

  update public.booking_slot_waitlist
  set
    status = 'cancelled',
    expires_at = null,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace.id
    and appointment_date = p_appointment_date
    and appointment_time = p_appointment_time
    and lower(trim(requested_service_name)) = lower(v_service_name)
    and lower(trim(customer_email::text)) = v_customer_email::text
    and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') = v_customer_phone
    and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = coalesce(v_requested_operator_id, '')
    and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = coalesce(lower(v_requested_operator_name), '')
    and (v_reusable.id is null or id <> v_reusable.id)
    and status in ('waiting', 'notified', 'expired');

  if v_reusable.id is not null then
    update public.booking_slot_waitlist
    set
      booking_plan = p_booking_plan,
      requested_duration_minutes = greatest(coalesce(p_requested_duration_minutes, 60), 1),
      requested_operator_id = v_requested_operator_id,
      requested_operator_name = v_requested_operator_name,
      customer_name = v_customer_name,
      customer_surname = v_customer_surname,
      customer_email = v_customer_email,
      customer_phone = v_customer_phone,
      customer_instagram = v_customer_instagram,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = 'waiting',
      notified_at = null,
      expires_at = null,
      updated_at = timezone('utc', now())
    where id = v_reusable.id
    returning * into v_entry;
  else
    insert into public.booking_slot_waitlist (
      booking_plan,
      workspace_id,
      appointment_date,
      appointment_time,
      requested_service_name,
      requested_duration_minutes,
      requested_operator_id,
      requested_operator_name,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      notes,
      status,
      notified_at,
      expires_at
    )
    values (
      p_booking_plan,
      v_workspace.id,
      p_appointment_date,
      p_appointment_time,
      v_service_name,
      greatest(coalesce(p_requested_duration_minutes, 60), 1),
      v_requested_operator_id,
      v_requested_operator_name,
      v_customer_name,
      v_customer_surname,
      v_customer_email,
      v_customer_phone,
      v_customer_instagram,
      nullif(trim(coalesce(p_notes, '')), ''),
      'waiting',
      null,
      null
    )
    returning * into v_entry;
  end if;

  if p_booking_plan ? 'range' then
    update public.booking_slot_waitlist set range_available_times = public.waitlist_range_available_times_v1(v_entry), range_resolved = false where id=v_entry.id;
  end if;
  select waitlist.* into v_entry from public.booking_slot_waitlist as waitlist where waitlist.id=v_entry.id;

  return jsonb_build_object(
    'waitlistEntryId', v_entry.id,
    'status', v_entry.status,
    'alreadyJoined', false,
    'expiresAt', v_entry.expires_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_2ff3aa573ad94dcad4a3(text,text,integer,date,time without time zone,text,text,citext,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.join_public_slot_waitlist_v2(p_salon_code text, p_requested_service_name text, p_requested_duration_minutes integer DEFAULT 60, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_customer_name text DEFAULT NULL::text, p_customer_surname text DEFAULT ''::text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text, p_booking_plan jsonb DEFAULT NULL::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_2ff3aa573ad94dcad4a3(p_salon_code,p_requested_service_name,p_requested_duration_minutes,p_appointment_date,p_appointment_time,p_customer_name,p_customer_surname,p_customer_email,p_customer_phone,p_customer_instagram,p_notes,p_requested_operator_id,p_requested_operator_name,p_booking_plan); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_0488740108a21480d474(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_events jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_updated_count integer := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  if jsonb_array_length(p_events) = 0 then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  with raw_events as (
    select event.value as payload
    from jsonb_array_elements(p_events) with ordinality as event(value, position)
    where jsonb_typeof(event.value) = 'object'
      and event.position <= 500
  ),
  parsed_events as (
    select distinct
      case
        when trim(coalesce(payload ->> 'requestId', '')) ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(payload ->> 'requestId')::uuid
        else null
      end as request_id,
      case lower(trim(coalesce(
        payload ->> 'expectedStatus',
        payload ->> 'statusCode',
        payload ->> 'status',
        ''
      )))
        when 'accettata' then 'accepted'
        when 'confermata' then 'accepted'
        when 'rifiutata' then 'rejected'
        when 'declined' then 'rejected'
        when 'annullata' then 'cancelled'
        when 'in attesa' then 'pending'
        else lower(trim(coalesce(
          payload ->> 'expectedStatus',
          payload ->> 'statusCode',
          payload ->> 'status',
          ''
        )))
      end as expected_status,
      lower(trim(coalesce(
        payload ->> 'expectedCancellationSource',
        payload ->> 'cancellationSource',
        ''
      ))) as expected_cancellation_source,
      trim(coalesce(
        payload ->> 'expectedAppointmentDate',
        payload ->> 'appointmentDate',
        ''
      )) as expected_appointment_date,
      left(trim(coalesce(
        payload ->> 'expectedAppointmentTime',
        payload ->> 'appointmentTime',
        ''
      )), 5) as expected_appointment_time,
      lower(regexp_replace(trim(coalesce(
        payload ->> 'expectedServiceName',
        payload ->> 'serviceName',
        ''
      )), '\s+', ' ', 'g')) as expected_service_name,
      case
        when trim(coalesce(
          payload ->> 'expectedUpdatedAt',
          payload ->> 'eventVersion',
          payload ->> 'updatedAt',
          ''
        )) ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
        then trim(coalesce(
          payload ->> 'expectedUpdatedAt',
          payload ->> 'eventVersion',
          payload ->> 'updatedAt'
        ))::timestamptz
        else null
      end as expected_updated_at
    from raw_events
  ),
  matched_anchors as (
    select distinct
      request.id,
      request.appointment_group_id,
      case lower(request.status::text)
        when 'auto_accepted' then 'accepted'
        when 'declined' then 'rejected'
        else lower(request.status::text)
      end as expected_status,
      lower(trim(coalesce(request.cancellation_source, ''))) as expected_cancellation_source,
      event.expected_updated_at
    from parsed_events as event
    join public.booking_requests as request
      on request.workspace_id = v_workspace_id
      and request.id = event.request_id
      and request.viewed_by_customer = false
      and case lower(request.status::text)
        when 'auto_accepted' then 'accepted'
        when 'declined' then 'rejected'
        else lower(request.status::text)
      end = event.expected_status
      and lower(trim(coalesce(request.cancellation_source, ''))) =
        event.expected_cancellation_source
      and request.appointment_date::text = event.expected_appointment_date
      and left(request.appointment_time::text, 5) = event.expected_appointment_time
      and lower(regexp_replace(trim(coalesce(request.requested_service_name, '')), '\s+', ' ', 'g')) =
        event.expected_service_name
      and event.expected_updated_at is not null
      and request.updated_at = event.expected_updated_at
      and (
        request.status::text <> 'pending'
        or request.operator_change_status = 'pending'
      )
      and (
        (
          v_customer_email is not null
          and lower(trim(coalesce(request.customer_email::text, ''))) =
            v_customer_email::text
        )
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
            v_customer_phone
        )
      )
  )
  update public.booking_requests as request
  set
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where request.workspace_id = v_workspace_id
    and request.viewed_by_customer = false
    and (
      request.status::text <> 'pending'
      or request.operator_change_status = 'pending'
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
    )
    and exists (
      select 1
      from matched_anchors as anchor
      where (
        anchor.appointment_group_id is null
        and request.id = anchor.id
      )
      or (
        anchor.appointment_group_id is not null
        and request.appointment_group_id = anchor.appointment_group_id
        and case lower(request.status::text)
          when 'auto_accepted' then 'accepted'
          when 'declined' then 'rejected'
          else lower(request.status::text)
        end = anchor.expected_status
        and lower(trim(coalesce(request.cancellation_source, ''))) =
          anchor.expected_cancellation_source
        and request.updated_at <= anchor.expected_updated_at
      )
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count > 0 then
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end if;

  return v_updated_count;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_0488740108a21480d474(text,citext,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_public_booking_notification_events_viewed_v2(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_events jsonb DEFAULT '[]'::jsonb) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_0488740108a21480d474(p_salon_code,p_customer_email,p_customer_phone,p_events); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_82d77d61f57a0bcc55ce(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_updated_count integer := 0;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  update public.booking_requests as booking_request
  set
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where booking_request.workspace_id = v_workspace_id
    and booking_request.status <> 'pending'
    and booking_request.viewed_by_customer = false
    and (
      (v_customer_email is not null and lower(trim(booking_request.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count > 0 then
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end if;

  return v_updated_count;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_82d77d61f57a0bcc55ce(text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_public_booking_requests_viewed(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_82d77d61f57a0bcc55ce(p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_449be28e4b246676db43(p_communication_id uuid, p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_updated_count integer := 0;
begin
  if p_communication_id is null or (v_customer_email is null and v_customer_phone is null) then
    return false;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  update public.customer_communication_recipients as recipient
  set read_at = coalesce(recipient.read_at, timezone('utc', now()))
  from public.customer_communications as communication,
       public.customers as customer
  where recipient.communication_id = p_communication_id
    and communication.id = recipient.communication_id
    and communication.workspace_id = v_workspace_id
    and customer.id = recipient.customer_id
    and customer.workspace_id = v_workspace_id
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
    );

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_449be28e4b246676db43(uuid,text,citext,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_public_customer_communication_read(p_communication_id uuid, p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_449be28e4b246676db43(p_communication_id,p_salon_code,p_customer_email,p_customer_phone); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_5b8a9cc207ffe6854130(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_waitlist_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_updated_count integer := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  update public.booking_slot_waitlist as waitlist
  set viewed_by_customer = true
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status = 'notified'
    and waitlist.viewed_by_customer = false
    and (
      p_waitlist_ids is null
      or (
        cardinality(p_waitlist_ids) > 0
        and waitlist.id = any(p_waitlist_ids)
      )
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    );

  get diagnostics v_updated_count = row_count;
  return coalesce(v_updated_count, 0);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_5b8a9cc207ffe6854130(text,citext,text,uuid[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_public_customer_waitlist_alerts_viewed(p_salon_code text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text, p_waitlist_ids uuid[] DEFAULT NULL::uuid[]) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM salonpro_private.portal_assert(p_salon_code,p_customer_email::text,p_customer_phone,false);
 RETURN salonpro_private.impl_5b8a9cc207ffe6854130(p_salon_code,p_customer_email,p_customer_phone,p_waitlist_ids); END $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_eeff2f058a357d9f8c8f(p_salon_code text, p_appointment_date date DEFAULT NULL::date)
 RETURNS TABLE(id text, data date, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, operatore_id text, operatore_nome text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target_workspace as (
    select portal.workspace_id
    from public.client_portals as portal
    where portal.salon_code = lower(trim(p_salon_code))
      and portal.subscription_status = 'active'
    limit 1
  ),
  live_appointments as (
    select
      appointment.id::text as id,
      appointment.appointment_date as data,
      to_char(appointment.appointment_time, 'HH24:MI') as ora,
      appointment.customer_name as cliente,
      appointment.service_name as servizio,
      appointment.price as prezzo,
      appointment.duration_minutes as durata_minuti,
      ''::text as operatore_id,
      ''::text as operatore_nome
    from public.appointments as appointment
    join target_workspace as workspace on workspace.workspace_id = appointment.workspace_id
    where p_appointment_date is null or appointment.appointment_date = p_appointment_date
  ),
  live_booking_requests as (
    select
      ('request-' || booking_request.id::text) as id,
      booking_request.appointment_date as data,
      to_char(booking_request.appointment_time, 'HH24:MI') as ora,
      trim(concat_ws(' ', booking_request.customer_name, nullif(booking_request.customer_surname, ''))) as cliente,
      booking_request.requested_service_name as servizio,
      booking_request.requested_price as prezzo,
      booking_request.requested_duration_minutes as durata_minuti,
      ''::text as operatore_id,
      ''::text as operatore_nome
    from public.booking_requests as booking_request
    join target_workspace as workspace on workspace.workspace_id = booking_request.workspace_id
    where booking_request.status in ('pending', 'accepted')
      and (p_appointment_date is null or booking_request.appointment_date = p_appointment_date)
      and not exists (
        select 1
        from public.appointments as appointment
        where appointment.booking_request_id = booking_request.id
      )
  )
  select *
  from live_appointments
  union all
  select *
  from live_booking_requests
  order by data asc, ora asc, id asc;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_eeff2f058a357d9f8c8f(text,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_booking_occupancy(p_salon_code text, p_appointment_date date DEFAULT NULL::date) RETURNS TABLE(id text, data date, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, operatore_id text, operatore_nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id,data,ora,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN salonpro_private.portal_occupancy_label(p_salon_code,data::text,id,cliente) ELSE cliente END AS cliente,servizio,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN 0::numeric ELSE prezzo END AS prezzo,durata_minuti,operatore_id,operatore_nome FROM salonpro_private.impl_eeff2f058a357d9f8c8f(p_salon_code,p_appointment_date) $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_8a0ec98fb99bbedffd56(p_salon_code text, p_date date)
 RETURNS TABLE(id text, data text, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, operatore_id text, operatore_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target_workspace as (
    select portal.workspace_id
    from public.client_portals as portal
    where portal.salon_code = lower(trim(p_salon_code))
      and portal.subscription_status in ('active', 'demo')
    limit 1
  ),
  live_appointments as (
    select
      appointment.id::text as id,
      appointment.appointment_date::text as data,
      to_char(appointment.appointment_time, 'HH24:MI') as ora,
      appointment.customer_name as cliente,
      appointment.service_name as servizio,
      appointment.price as prezzo,
      appointment.duration_minutes as durata_minuti,
      null::text as operatore_id,
      null::text as operatore_nome
    from public.appointments as appointment
    join target_workspace on target_workspace.workspace_id = appointment.workspace_id
    where appointment.appointment_date = p_date
  ),
  live_requests as (
    select
      case
        when booking_request.status = 'accepted' then 'accepted-' || booking_request.id::text
        else 'pending-' || booking_request.id::text
      end as id,
      booking_request.appointment_date::text as data,
      to_char(booking_request.appointment_time, 'HH24:MI') as ora,
      case when booking_request.payment_hold_state='awaiting_payment' then '' else trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)) end as cliente,
      booking_request.requested_service_name as servizio,
      booking_request.requested_price as prezzo,
      booking_request.requested_duration_minutes as durata_minuti,
      null::text as operatore_id,
      null::text as operatore_nome
    from public.booking_requests as booking_request
    join target_workspace on target_workspace.workspace_id = booking_request.workspace_id
    where booking_request.appointment_date = p_date
      and booking_request.status in ('pending', 'accepted')
      and (
        booking_request.status <> 'accepted'
        or not exists (
          select 1
          from public.appointments as appointment
          where appointment.workspace_id = booking_request.workspace_id
            and appointment.appointment_date = booking_request.appointment_date
            and appointment.appointment_time = booking_request.appointment_time
            and lower(trim(appointment.customer_name)) =
              lower(case when booking_request.payment_hold_state='awaiting_payment' then '' else trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)) end)
            and lower(trim(appointment.service_name)) =
              lower(trim(booking_request.requested_service_name))
        )
      )
  )
  select * from live_appointments
  union all
  select * from live_requests
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_8a0ec98fb99bbedffd56(text,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_booking_occupancy_live(p_salon_code text, p_date date) RETURNS TABLE(id text, data text, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, operatore_id text, operatore_nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id,data,ora,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN salonpro_private.portal_occupancy_label(p_salon_code,data::text,id,cliente) ELSE cliente END AS cliente,servizio,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN 0::numeric ELSE prezzo END AS prezzo,durata_minuti,operatore_id,operatore_nome FROM salonpro_private.impl_8a0ec98fb99bbedffd56(p_salon_code,p_date) $$;

CREATE OR REPLACE FUNCTION salonpro_private.impl_ebf5523cf07dde5a41b4(p_salon_code text, p_date date)
 RETURNS TABLE(id text, data text, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, phase_snapshot jsonb, operatore_id text, operatore_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with target_workspace as (
    select portal.workspace_id
    from public.client_portals as portal
    where portal.salon_code = lower(trim(p_salon_code))
      and portal.subscription_status in ('active', 'demo')
    limit 1
  ),
  live_appointments as (
    select
      appointment.id::text,
      appointment.appointment_date::text,
      to_char(appointment.appointment_time, 'HH24:MI'),
      appointment.customer_name,
      appointment.service_name,
      appointment.price,
      appointment.duration_minutes,
      appointment.phase_snapshot,
      appointment.operator_id,
      appointment.operator_name
    from public.appointments as appointment
    join target_workspace on target_workspace.workspace_id = appointment.workspace_id
    where appointment.appointment_date = p_date
  ),
  live_requests as (
    select
      case when booking_request.status = 'accepted'
        then 'accepted-' || booking_request.id::text
        else 'pending-' || booking_request.id::text
      end,
      booking_request.appointment_date::text,
      to_char(booking_request.appointment_time, 'HH24:MI'),
      case when booking_request.payment_hold_state='awaiting_payment' then '' else trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)) end,
      booking_request.requested_service_name,
      booking_request.requested_price,
      booking_request.requested_duration_minutes,
      booking_request.phase_snapshot,
      booking_request.requested_operator_id,
      booking_request.requested_operator_name
    from public.booking_requests as booking_request
    join target_workspace on target_workspace.workspace_id = booking_request.workspace_id
    where booking_request.appointment_date = p_date
      and booking_request.status in ('pending', 'accepted')
      and (
        booking_request.status <> 'accepted'
        or not exists (
          select 1 from public.appointments as appointment
          where appointment.workspace_id = booking_request.workspace_id
            and (
              appointment.booking_request_id = booking_request.id
              or (
                appointment.appointment_date = booking_request.appointment_date
                and appointment.appointment_time = booking_request.appointment_time
                and lower(trim(appointment.customer_name)) = lower(case when booking_request.payment_hold_state='awaiting_payment' then '' else trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)) end)
                and lower(trim(appointment.service_name)) = lower(trim(booking_request.requested_service_name))
              )
            )
        )
      )
  )
  select * from live_appointments
  union all
  select * from live_requests
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_ebf5523cf07dde5a41b4(text,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_public_booking_occupancy_phased_v1(p_salon_code text, p_date date) RETURNS TABLE(id text, data text, ora text, cliente text, servizio text, prezzo numeric, durata_minuti integer, phase_snapshot jsonb, operatore_id text, operatore_nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id,data,ora,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN salonpro_private.portal_occupancy_label(p_salon_code,data::text,id,cliente) ELSE cliente END AS cliente,servizio,CASE WHEN salonpro_private.portal_enabled(p_salon_code) AND NOT salonpro_private.portal_owner(p_salon_code) THEN 0::numeric ELSE prezzo END AS prezzo,durata_minuti,phase_snapshot,operatore_id,operatore_nome FROM salonpro_private.impl_ebf5523cf07dde5a41b4(p_salon_code,p_date) $$;

CREATE OR REPLACE FUNCTION public.find_public_customer_by_password(p_salon_code text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_result jsonb;
  v_customer_id uuid;
  v_password_hash text;
begin
  v_result := public.find_public_customer_by_credentials_legacy_impl(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  if v_result is null then
    SELECT jsonb_build_object('customerId',c.id,'workspaceId',c.workspace_id,'salonCode',w.slug,
      'nome','','email','','telefono',right(regexp_replace(p_customer_phone,'\D','','g'),10),'instagram','',
      'score',2,'sameScoreCount',1,'sameEmail',false,'samePhone',true,'passwordRequired',false,'passwordSetupRequired',true)
    INTO v_result FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
    WHERE w.slug=lower(trim(p_salon_code)) AND c.source='salon' AND c.is_active IS TRUE
      AND nullif(trim(coalesce(c.email::text,'')),'') IS NULL
      AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10)
      AND (SELECT count(*) FROM public.customers x WHERE x.workspace_id=c.workspace_id AND x.is_active IS NOT FALSE
        AND right(regexp_replace(x.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10))=1
    LIMIT 1;
    IF v_result IS NULL THEN RETURN NULL; END IF;
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  v_result := v_result || jsonb_build_object('registrationStatus',
    coalesce((select registration_status from public.customers where id=v_customer_id),'approved'));
  select credential.password_hash
  into v_password_hash
  from public.customer_login_credentials as credential
  where credential.customer_id = v_customer_id;

  if v_password_hash is null then
    IF salonpro_private.portal_enabled(p_salon_code) THEN
      IF nullif(trim(coalesce(v_result->>'email','')),'') IS NOT NULL AND nullif(trim(coalesce(p_customer_email,'')),'') IS NULL THEN RETURN NULL; END IF;
      RETURN (v_result-'nota') || jsonb_build_object('nome','','instagram','','email',CASE WHEN coalesce((v_result->>'sameEmail')::boolean,false) THEN coalesce(p_customer_email,'') ELSE '' END,'telefono',CASE WHEN coalesce((v_result->>'samePhone')::boolean,false) THEN coalesce(p_customer_phone,'') ELSE '' END,'passwordRequired',false,'passwordSetupRequired',true);
    END IF;
    return v_result || jsonb_build_object('passwordRequired', false);
  end if;

  IF coalesce(p_customer_password,'')='' AND salonpro_private.portal_customer(p_salon_code)=v_customer_id THEN
    RETURN (v_result-'nota') || jsonb_build_object('passwordRequired',true,
      'nome',CASE WHEN coalesce(v_result->>'registrationStatus','approved')='approved' THEN v_result->>'nome' ELSE '' END);
  END IF;

  if coalesce(p_customer_password, '') = '' then
    IF salonpro_private.portal_enabled(p_salon_code) AND salonpro_private.portal_proof_supplied() THEN RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501'; END IF;
    raise exception 'customer_password_required';
  end if;

  if extensions.crypt(p_customer_password, v_password_hash) <> v_password_hash then
    raise exception 'invalid_customer_password';
  end if;

  return (v_result-'nota') || jsonb_build_object('passwordRequired', true, 'nome',CASE WHEN coalesce(v_result->>'registrationStatus','approved')='approved' THEN v_result->>'nome' ELSE '' END);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.find_public_customer_by_credentials(p_salon_code text, p_customer_email text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_customer_id uuid;
begin
  v_result := public.find_public_customer_by_credentials_legacy_impl(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  if v_result is null then
    return null;
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  v_result := v_result || jsonb_build_object('registrationStatus',
    coalesce((select registration_status from public.customers where id=v_customer_id),'approved'));
  if exists (
    select 1
    from public.customer_login_credentials as credential
    where credential.customer_id = v_customer_id
  ) then
    return null;
  end if;

  return (v_result-'nota') || jsonb_build_object('nome','','instagram','','email',CASE WHEN coalesce((v_result->>'sameEmail')::boolean,false) THEN coalesce(p_customer_email,'') ELSE '' END,'telefono',CASE WHEN coalesce((v_result->>'samePhone')::boolean,false) THEN coalesce(p_customer_phone,'') ELSE '' END,'passwordRequired',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION salonpro_private.impl_f19098899fd7ad48e893(p_salon_code text, p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_instagram text, p_customer_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_result jsonb;
  v_customer_id uuid;
begin
  if length(coalesce(p_customer_password, '')) < 8
     or p_customer_password !~ '[a-z]'
     or p_customer_password !~ '[A-Z]'
     or p_customer_password !~ '[0-9]'
     or p_customer_password !~ '[^A-Za-z0-9]' then
    raise exception 'customer_password_weak';
  end if;

  v_result := public.register_public_customer_legacy_impl(
    p_salon_code,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_instagram
  );
  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;

  if v_customer_id is null then
    raise exception 'customer_registration_failed';
  end if;

  insert into public.customer_login_credentials (customer_id, password_hash)
  values (
    v_customer_id,
    extensions.crypt(p_customer_password, extensions.gen_salt('bf', 12))
  );

  perform public.queue_public_owner_push(
    nullif(v_result->>'workspaceId','')::uuid, 'custom', 'Nuovo cliente registrato',
    trim(p_customer_name) || ' si è registrato dal frontend.',
    jsonb_build_object('kind','frontend_customer_registered',
      'salonCode',lower(trim(p_salon_code)),'customerId',v_customer_id,
      'customerName',trim(p_customer_name),'customerEmail',lower(trim(p_customer_email)),
      'customerPhone',regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'))
  );
  return v_result || jsonb_build_object(
    'registrationStatus',(select registration_status from public.customers where id=v_customer_id),
    'ownerNotificationQueued',true);
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_f19098899fd7ad48e893(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.register_public_customer_with_password(p_salon_code text,p_customer_name text,p_customer_phone text,p_customer_email text,p_customer_instagram text,p_customer_password text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF nullif(trim(coalesce(p_customer_email,'')),'') IS NULL OR p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'customer_email_required'; END IF;
 RETURN salonpro_private.impl_f19098899fd7ad48e893(p_salon_code,p_customer_name,p_customer_phone,p_customer_email,p_customer_instagram,p_customer_password);
END $$;

CREATE OR REPLACE FUNCTION public.preserve_customer_registration_decision_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.registration_status='approved' AND NOT (new.registration_status='pending' AND coalesce(current_setting('salonpro.revalidating_customer_registration',true),'')=old.id::text) then
    new.registration_status := 'approved';
  elsif new.registration_status='approved'
    and coalesce(current_setting('salonpro.approving_customer_registration',true),'')<>old.id::text then
    new.registration_status := 'pending';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION salonpro_private.impl_6d626a039616600fb099(p_salon_code text, p_customer_email text, p_customer_phone text, p_otp_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );
  v_workspace_id uuid;
  v_matching_customers integer := 0;
  v_phone_customers integer := 0;
  v_customer public.customers%rowtype;
  v_otp_id uuid;
  v_otp public.email_otp_verifications%rowtype;
begin
  if v_salon_code = ''
     or v_customer_email is null
     or v_customer_phone is null
     or length(v_customer_phone) < 9 then
    raise exception 'invalid_customer_credentials';
  end if;

  begin
    v_otp_id := nullif(trim(coalesce(p_otp_token, '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'customer_email_completion_otp_invalid';
  end;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);
  if v_workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  select count(*)
  into v_matching_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.source = 'salon'
    and customer.is_active is true
    and nullif(lower(trim(coalesce(customer.email::text, ''))), '') is null
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_matching_customers <> 1 then
    raise exception 'customer_email_completion_not_available';
  end if;

  select count(*)
  into v_phone_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is true
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_phone_customers <> 1 then
    raise exception 'customer_email_completion_not_available';
  end if;

  select customer.*
  into v_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.source = 'salon'
    and customer.is_active is true
    and nullif(lower(trim(coalesce(customer.email::text, ''))), '') is null
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone
  limit 1
  for update;

  if exists (
    select 1
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.id <> v_customer.id
      and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
  ) then
    raise exception 'duplicate_email';
  end if;

  select *
  into v_otp
  from public.email_otp_verifications as otp
  where otp.id = v_otp_id
    and otp.email = v_customer_email
    and otp.purpose = 'client_email_completion'
    and coalesce(otp.salon_code, '') = v_salon_code
    and otp.consumed_at is not null
    and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
    and coalesce(otp.metadata ->> 'customer_phone', '') = v_customer_phone
    and coalesce(otp.metadata ->> 'customer_email_completion_completed_at', '') = ''
  limit 1
  for update;

  if v_otp.id is null then
    raise exception 'customer_email_completion_otp_invalid';
  end if;

  update public.customers
  set email = v_customer_email,
      updated_at = timezone('utc', now())
  where id = v_customer.id
    and nullif(lower(trim(coalesce(email::text, ''))), '') is null;

  if not found then
    raise exception 'customer_email_completion_not_available';
  end if;

  update public.email_otp_verifications
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_email_completion_completed_at',
    timezone('utc', now())::text,
    'customer_id',
    v_customer.id::text
  )
  where id = v_otp.id;

  perform public.sync_client_portal_customers(v_workspace_id);

  return jsonb_build_object(
    'ok', true,
    'customerId', v_customer.id,
    'workspaceId', v_workspace_id,
    'email', v_customer_email::text
  );
end;
$function$;

REVOKE ALL ON FUNCTION salonpro_private.impl_6d626a039616600fb099(text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.complete_public_customer_email(p_salon_code text,p_customer_email text,p_customer_phone text,p_otp_token text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; wid uuid; answer jsonb;
BEGIN
 SELECT c.id,c.workspace_id INTO cid,wid FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND nullif(trim(coalesce(c.email::text,'')),'') IS NULL
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10)
 ORDER BY c.updated_at DESC,c.id LIMIT 1 FOR UPDATE OF c;
 answer:=salonpro_private.impl_6d626a039616600fb099(p_salon_code,p_customer_email,p_customer_phone,p_otp_token);
 IF cid IS NOT NULL AND coalesce((answer->>'ok')::boolean,false) THEN
   PERFORM set_config('salonpro.revalidating_customer_registration',cid::text,true);
   UPDATE public.customers SET registration_status='pending',viewed_by_salon=false,updated_at=now() WHERE id=cid;
   PERFORM set_config('salonpro.revalidating_customer_registration','',true);
   UPDATE public.email_otp_verifications SET metadata=coalesce(metadata,'{}')||jsonb_build_object('customer_portal_requires_owner_approval',true) WHERE id::text=p_otp_token;
   PERFORM public.sync_client_portal_customers(wid);
 END IF;
 RETURN answer;
END $$;


CREATE OR REPLACE FUNCTION public.activate_public_customer_password_resumable_v1(p_salon_code text,p_customer_email text,p_customer_phone text,p_customer_password text,p_otp_token text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE otp public.email_otp_verifications%rowtype; cid uuid; credential text; result jsonb;
BEGIN
 IF length(coalesce(p_customer_password,''))<8 OR p_customer_password !~ '[a-z]' OR p_customer_password !~ '[A-Z]'
 OR p_customer_password !~ '[0-9]' OR p_customer_password !~ '[^A-Za-z0-9]' THEN RAISE EXCEPTION 'customer_password_weak'; END IF;
 SELECT * INTO otp FROM public.email_otp_verifications o WHERE o.id::text=trim(p_otp_token)
 AND o.email=lower(trim(p_customer_email))::citext AND o.salon_code=lower(trim(p_salon_code))
 AND o.purpose IN ('client_password_activation','client_email_completion')
 AND o.consumed_at>=now()-interval '15 minutes' FOR UPDATE;
 IF otp.id IS NULL THEN RAISE EXCEPTION 'customer_password_otp_invalid'; END IF;
 SELECT c.id,k.password_hash INTO cid,credential FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 LEFT JOIN public.customer_login_credentials k ON k.customer_id=c.id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10);
 IF cid IS NULL THEN RAISE EXCEPTION 'invalid_customer_credentials'; END IF;
 IF nullif(otp.metadata->>'customer_password_action_completed_at','') IS NOT NULL THEN
   IF otp.metadata->>'customer_password_action_customer_id'=cid::text AND credential IS NOT NULL
   AND extensions.crypt(p_customer_password,credential)=credential THEN RETURN jsonb_build_object('ok',true,'customerId',cid,'passwordRequired',true); END IF;
   RAISE EXCEPTION 'customer_password_already_enabled';
 END IF;
 IF credential IS NOT NULL THEN RAISE EXCEPTION 'customer_password_already_enabled'; END IF;
 IF otp.purpose='client_email_completion' THEN
   IF otp.metadata->>'customer_id' IS DISTINCT FROM cid::text OR nullif(otp.metadata->>'customer_email_completion_completed_at','') IS NULL THEN RAISE EXCEPTION 'customer_password_otp_invalid'; END IF;
   INSERT INTO public.customer_login_credentials(customer_id,password_hash) VALUES(cid,extensions.crypt(p_customer_password,extensions.gen_salt('bf',12)));
 ELSE
   result:=public.activate_public_customer_password(p_salon_code,p_customer_email,p_customer_phone,p_customer_password,p_otp_token);
   IF NOT coalesce((result->>'ok')::boolean,false) THEN RAISE EXCEPTION 'customer_password_otp_invalid'; END IF;
 END IF;
 UPDATE public.email_otp_verifications SET metadata=coalesce(metadata,'{}')||jsonb_build_object(
 'customer_password_action_completed_at',now(),'customer_password_action_customer_id',cid::text,'customer_password_action','activation') WHERE id=otp.id;
 RETURN jsonb_build_object('ok',true,'customerId',cid,'passwordRequired',true);
END $$;
REVOKE ALL ON FUNCTION public.activate_public_customer_password_resumable_v1(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_public_customer_password_resumable_v1(text,text,text,text,text) TO anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.verify_email_otp(p_email citext, p_purpose text, p_code text, p_salon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_email citext:=nullif(lower(trim(coalesce(p_email::text,''))), '')::citext;
  v_purpose text:=trim(coalesce(p_purpose,''));
  v_code text:=regexp_replace(coalesce(p_code,''),'\D+','','g');
  v_salon_code text:=nullif(lower(trim(coalesce(p_salon_code,''))), '');
  v_row public.email_otp_verifications%rowtype;
  v_hash text;
begin
  if v_email is null or v_purpose not in ('owner_registration','client_registration','client_email_completion','client_password_activation','client_password_reset') then
    return jsonb_build_object('ok',false,'error','invalid_request');
  end if;
  if length(v_code)<>6 then return jsonb_build_object('ok',false,'error','invalid_code'); end if;
  select * into v_row from public.email_otp_verifications otp
  where otp.email=v_email and otp.purpose=v_purpose
    and coalesce(otp.salon_code,'')=coalesce(v_salon_code,'')
    and (otp.consumed_at is null or v_purpose in ('client_registration','client_email_completion','client_password_activation'))
  order by otp.created_at desc limit 1 for update;
  if v_row.id is null then return jsonb_build_object('ok',false,'error','code_not_found'); end if;
  if coalesce(v_row.metadata->>'delivery_status','')='failed' then
    return jsonb_build_object('ok',false,'error','code_not_found');
  end if;
  if (v_row.consumed_at is null and v_row.expires_at<=timezone('utc',now()))
    or (v_row.consumed_at is not null and v_row.consumed_at<timezone('utc',now())-interval '15 minutes') then
    return jsonb_build_object('ok',false,'error','code_expired');
  end if;
  if v_row.attempts>=5 then return jsonb_build_object('ok',false,'error','too_many_attempts'); end if;
  v_hash:=encode(extensions.digest(v_code||':'||v_row.code_salt,'sha256'),'hex');
  if v_hash<>v_row.code_hash then
    update public.email_otp_verifications set attempts=attempts+1 where id=v_row.id;
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  if v_row.consumed_at is null then
    update public.email_otp_verifications set consumed_at=timezone('utc',now()),
      attempts=attempts+case when v_purpose in ('client_registration','client_email_completion','client_password_activation') then 0 else 1 end where id=v_row.id;
  end if;
  return jsonb_build_object('ok',true,'token',v_row.id::text);
end; $function$
;

REVOKE ALL ON FUNCTION public.debug_workspace_customer_reminder_rows(text) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.resolve_customer_service_price_v1(uuid,text,text,text,numeric) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.resolve_customer_service_timing_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.get_public_customer_busy_envelopes_v1(uuid,date,text,text,text) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';

COMMIT;
