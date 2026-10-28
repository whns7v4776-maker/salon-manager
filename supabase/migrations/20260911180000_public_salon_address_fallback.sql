-- Use canonical salon address when the public snapshot has not been populated yet.
CREATE OR REPLACE FUNCTION public.get_client_portal_catalog(p_salon_code text)
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
          greatest(
            0,
            least(
              168,
              coalesce(
                nullif(trim(coalesce(v_workspace_payload ->> 'customerReminderHoursBefore', '')), '')::integer,
                v_workspace.customer_reminder_hours_before,
                24
              )
            )
          ),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti', '[]'::jsonb,
    'appuntamenti', '[]'::jsonb,
    'servizi', coalesce(v_owner_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_owner_payload -> 'operatori', '[]'::jsonb),
    'richiestePrenotazione', '[]'::jsonb,
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_portal_snapshot(p_salon_code text)
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
          where booking_request.workspace_id = v_workspace.id
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
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$function$;
notify pgrst, 'reload schema';
