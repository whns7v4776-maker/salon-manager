-- Optional one-time salon admission for newly registered customers.
-- Existing and owner-created customers stay approved. Pending admission is
-- independent from the setting after registration and from booking acceptance.
alter table public.customers
  add column if not exists registration_status text not null default 'approved';
alter table public.customers
  drop constraint if exists customers_registration_status_check;
alter table public.customers
  add constraint customers_registration_status_check
  check (registration_status in ('approved', 'pending'));
create index if not exists customers_pending_registration_workspace_idx
  on public.customers(workspace_id, created_at desc)
  where registration_status = 'pending';
comment on column public.customers.registration_status is
  'Salon admission for new frontend registrations; unrelated to notification permission or appointment acceptance.';

-- UUID-only rejection evidence survives a new signup with the same name.
-- No contact details or global account are retained/deleted here.
create table if not exists public.customer_registration_rejections (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,customer_id)
);
alter table public.customer_registration_rejections enable row level security;
revoke all on table public.customer_registration_rejections from public, anon, authenticated;
grant all on table public.customer_registration_rejections to service_role;

CREATE OR REPLACE FUNCTION public.filter_deleted_snapshot_customers(p_workspace_id uuid, p_clienti jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_clienti, '[]'::jsonb)) = 'array'
        then coalesce(p_clienti, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) with ordinality as entry(value, ordinality)
  where not exists (
    select 1
    from public.customer_deletion_tombstones as tombstone
    where tombstone.workspace_id = p_workspace_id
      and (
        (
          tombstone.customer_id is not null
          and coalesce(entry.value ->> 'id', '') = tombstone.customer_id::text
        )
        or (
          not exists (
            select 1 from public.customers as canonical_customer
            where canonical_customer.workspace_id=p_workspace_id
              and canonical_customer.id::text=coalesce(entry.value->>'id','')
          )
          and tombstone.normalized_name = lower(
          regexp_replace(
            btrim(
              coalesce(
                entry.value ->> 'nome',
                entry.value ->> 'full_name',
                entry.value ->> 'name',
                ''
              )
            ),
            '\s+',
            ' ',
            'g'
          )
        )
        )
      )
  )
  and not exists (
    select 1 from public.customer_registration_rejections as rejection
    where rejection.workspace_id=p_workspace_id
      and rejection.customer_id::text=coalesce(entry.value->>'id','')
  );
$function$;

create or replace function public.merge_customer_registration_settings_v1(
  p_existing jsonb, p_incoming jsonb, p_result jsonb
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
begin
  -- Only the dedicated owner RPC may commit this preference. A clock ahead,
  -- old cache or unconfirmed optimistic full publish must never change it.
  if coalesce(current_setting('salonpro.updating_customer_registration_approval',true),'') <> 'true' then
    v_result := v_result || jsonb_build_object(
      'customerRegistrationApprovalRequired', coalesce(v_existing->'customerRegistrationApprovalRequired','false'::jsonb),
      'customerRegistrationApprovalUpdatedAt', coalesce(v_existing->'customerRegistrationApprovalUpdatedAt','null'::jsonb)
    );
  end if;
  return v_result;
end $$;
revoke all on function public.merge_customer_registration_settings_v1(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.merge_customer_registration_settings_v1(jsonb,jsonb,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.merge_client_portal_availability_settings(p_existing jsonb, p_incoming jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_existing_guided_ts timestamptz;
  v_incoming_guided_ts timestamptz;
  v_existing_weekly_ts timestamptz;
  v_incoming_weekly_ts timestamptz;
  v_existing_slot_ts timestamptz;
  v_incoming_slot_ts timestamptz;
  v_existing_contact_ts timestamptz;
  v_incoming_contact_ts timestamptz;
  v_existing_booking_window_ts timestamptz;
  v_incoming_booking_window_ts timestamptz;
begin
  begin
    v_existing_guided_ts := nullif(trim(coalesce(v_existing ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_guided_ts := null;
  end;
  begin
    v_incoming_guided_ts := nullif(trim(coalesce(v_incoming ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_guided_ts := null;
  end;
  begin
    v_existing_weekly_ts := nullif(trim(coalesce(v_existing ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_weekly_ts := null;
  end;
  begin
    v_incoming_weekly_ts := nullif(trim(coalesce(v_incoming ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_weekly_ts := null;
  end;
  begin
    v_existing_slot_ts := nullif(trim(coalesce(v_existing ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_slot_ts := null;
  end;
  begin
    v_incoming_slot_ts := nullif(trim(coalesce(v_incoming ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_slot_ts := null;
  end;
  begin
    v_existing_contact_ts := nullif(trim(coalesce(v_existing ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_contact_ts := null;
  end;
  begin
    v_incoming_contact_ts := nullif(trim(coalesce(v_incoming ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_contact_ts := null;
  end;
  begin
    v_existing_booking_window_ts := nullif(trim(coalesce(v_existing ->> 'publicBookingWindowUpdatedAt', '')), '')::timestamptz;
  exception when others then v_existing_booking_window_ts := null;
  end;
  begin
    v_incoming_booking_window_ts := nullif(trim(coalesce(v_incoming ->> 'publicBookingWindowUpdatedAt', '')), '')::timestamptz;
  exception when others then v_incoming_booking_window_ts := null;
  end;

  if v_existing_guided_ts is not null
     and (v_incoming_guided_ts is null or v_existing_guided_ts > v_incoming_guided_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_result, '{guidedSlotsEnabled}', coalesce(v_existing -> 'guidedSlotsEnabled', 'false'::jsonb), true),
          '{guidedSlotsStrategy}', coalesce(v_existing -> 'guidedSlotsStrategy', to_jsonb('balanced'::text)), true
        ),
        '{guidedSlotsVisibility}', coalesce(v_existing -> 'guidedSlotsVisibility', to_jsonb('recommended_first'::text)), true
      ),
      '{guidedSlotsUpdatedAt}', coalesce(v_existing -> 'guidedSlotsUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_weekly_ts is not null
     and (v_incoming_weekly_ts is null or v_existing_weekly_ts > v_incoming_weekly_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(v_result, '{weeklySchedule}', coalesce(v_existing -> 'weeklySchedule', '[]'::jsonb), true),
                '{dateOverrides}', coalesce(v_existing -> 'dateOverrides', '[]'::jsonb), true
              ),
              '{vacationRanges}', coalesce(v_existing -> 'vacationRanges', '[]'::jsonb), true
            ),
            '{lunchBreakEnabled}', coalesce(v_existing -> 'lunchBreakEnabled', 'false'::jsonb), true
          ),
          '{lunchBreakStart}', coalesce(v_existing -> 'lunchBreakStart', to_jsonb('13:00'::text)), true
        ),
        '{lunchBreakEnd}', coalesce(v_existing -> 'lunchBreakEnd', to_jsonb('14:00'::text)), true
      ),
      '{weeklyScheduleUpdatedAt}', coalesce(v_existing -> 'weeklyScheduleUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_slot_ts is not null
     and (v_incoming_slot_ts is null or v_existing_slot_ts > v_incoming_slot_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(v_result, '{slotIntervalMinutes}', coalesce(v_existing -> 'slotIntervalMinutes', to_jsonb(30)), true),
        '{dateSlotIntervals}', coalesce(v_existing -> 'dateSlotIntervals', '[]'::jsonb), true
      ),
      '{slotIntervalUpdatedAt}', coalesce(v_existing -> 'slotIntervalUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_contact_ts is not null
     and (v_incoming_contact_ts is null or v_existing_contact_ts > v_incoming_contact_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_result, '{customServiceContactEnabled}', coalesce(v_existing -> 'customServiceContactEnabled', 'false'::jsonb), true),
            '{customServiceContactTitle}', coalesce(v_existing -> 'customServiceContactTitle', to_jsonb('Un servizio pensato su misura per te'::text)), true
          ),
          '{customServiceContactMessage}', coalesce(v_existing -> 'customServiceContactMessage', to_jsonb(''::text)), true
        ),
        '{customServiceContactWhatsappMessage}', coalesce(v_existing -> 'customServiceContactWhatsappMessage', to_jsonb(''::text)), true
      ),
      '{customServiceContactUpdatedAt}', coalesce(v_existing -> 'customServiceContactUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_booking_window_ts is not null
     and (v_incoming_booking_window_ts is null or v_existing_booking_window_ts > v_incoming_booking_window_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_result,
          '{publicBookingWindowValue}',
          coalesce(v_existing -> 'publicBookingWindowValue', to_jsonb(90)),
          true
        ),
        '{publicBookingWindowUnit}',
        coalesce(v_existing -> 'publicBookingWindowUnit', to_jsonb('days'::text)),
        true
      ),
      '{publicBookingWindowUpdatedAt}',
      coalesce(v_existing -> 'publicBookingWindowUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return public.merge_customer_registration_settings_v1(v_existing, v_incoming, public.merge_client_portal_public_slot_interval_v1(v_existing, v_incoming, public.merge_client_portal_slot_interval_schedule_v1(v_existing, v_incoming, public.merge_client_portal_calendar_exceptions_v1(v_existing, v_incoming, v_result))));
end;
$function$;

create or replace function public.protect_owner_customer_registration_settings_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    new.payload := jsonb_set(coalesce(new.payload,'{}'::jsonb),'{availabilitySettings}',
      public.merge_customer_registration_settings_v1(
        old.payload->'availabilitySettings', new.payload->'availabilitySettings',
        coalesce(new.payload->'availabilitySettings','{}'::jsonb)),true);
  else
    new.payload := jsonb_set(coalesce(new.payload,'{}'::jsonb),'{availabilitySettings}',
      public.merge_customer_registration_settings_v1(
        (select availability_settings from public.client_portals where workspace_id=new.workspace_id),
        new.payload->'availabilitySettings',coalesce(new.payload->'availabilitySettings','{}'::jsonb)),true);
  end if;
  return new;
end $$;
drop trigger if exists protect_owner_customer_registration_settings_v1 on public.owner_app_snapshots;
create trigger protect_owner_customer_registration_settings_v1
  before insert or update of payload on public.owner_app_snapshots for each row
  execute function public.protect_owner_customer_registration_settings_v1();
revoke all on function public.protect_owner_customer_registration_settings_v1() from public, anon, authenticated;

create or replace function public.protect_portal_customer_registration_settings_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.availability_settings := public.merge_customer_registration_settings_v1(
    case when tg_op='UPDATE' then old.availability_settings else '{}'::jsonb end,
    new.availability_settings,coalesce(new.availability_settings,'{}'::jsonb));
  return new;
end $$;
drop trigger if exists protect_portal_customer_registration_settings_v1 on public.client_portals;
create trigger protect_portal_customer_registration_settings_v1
  before insert or update of availability_settings on public.client_portals for each row
  execute function public.protect_portal_customer_registration_settings_v1();
revoke all on function public.protect_portal_customer_registration_settings_v1() from public, anon, authenticated;

create or replace function public.set_customer_registration_approval_v1(p_required boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_workspace_id uuid; v_settings jsonb; v_patch jsonb;
begin
  if auth.uid() is null or coalesce(auth.role(),'') <> 'authenticated' then
    raise exception 'owner_session_required';
  end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  -- Match the private publisher's lock order: snapshot, then portal.
  perform 1 from public.owner_app_snapshots where workspace_id=v_workspace_id for update;
  select coalesce(availability_settings,'{}'::jsonb) into v_settings
    from public.client_portals where workspace_id=v_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  v_patch := jsonb_build_object(
    'customerRegistrationApprovalRequired',coalesce(p_required,false),
    'customerRegistrationApprovalUpdatedAt',clock_timestamp());
  v_settings := v_settings || v_patch;
  perform set_config('salonpro.updating_customer_registration_approval','true',true);
  update public.client_portals set availability_settings=v_settings where workspace_id=v_workspace_id;
  update public.owner_app_snapshots
    set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{availabilitySettings}',
      coalesce(payload->'availabilitySettings','{}'::jsonb) || v_patch,true)
    where workspace_id=v_workspace_id;
  perform set_config('salonpro.updating_customer_registration_approval','',true);
  return jsonb_build_object('workspaceId',v_workspace_id,'availabilitySettings',v_settings);
end $$;
revoke all on function public.set_customer_registration_approval_v1(boolean) from public, anon;
grant execute on function public.set_customer_registration_approval_v1(boolean) to authenticated;

-- Older anonymous booking RPCs used to create a frontend customer on the
-- fly. Such an insert is a new admission too; it cannot default to approved
-- while the salon moderates signup. Real owner writes and proven historical
-- portal backfills preserve automatic admission.
create or replace function public.classify_new_frontend_customer_registration_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A stale owner full upsert may contain the rejected UUID even after a
  -- legitimate new registration cleared the legacy name tombstone. Skip that
  -- obsolete row; a fresh generated customer UUID remains eligible normally.
  if exists(select 1 from public.customer_registration_rejections
    where workspace_id=new.workspace_id and customer_id=new.id) then return null; end if;
  if new.source='frontend' and new.registration_status='approved'
    and (select availability_settings->'customerRegistrationApprovalRequired'='true'::jsonb
      from public.client_portals where workspace_id=new.workspace_id)
    and not coalesce((auth.uid() is not null and coalesce(auth.role(),'')='authenticated'
      and public.current_workspace_id()=new.workspace_id and public.workspace_access_allowed()),false)
    and not exists (
      select 1 from public.client_portals portal
      cross join lateral jsonb_array_elements(coalesce(portal.clienti,'[]'::jsonb)) item
      where portal.workspace_id=new.workspace_id
        and coalesce(item->>'registrationStatus','approved')<>'pending'
        and nullif(trim(coalesce(new.email::text,'')),'') is not null
        and nullif(regexp_replace(coalesce(new.phone,''),'\D+','','g'),'') is not null
        and lower(trim(coalesce(item->>'email','')))=lower(trim(new.email::text))
        and right(regexp_replace(coalesce(item->>'telefono',''),'\D+','','g'),10)=
          right(regexp_replace(coalesce(new.phone,''),'\D+','','g'),10)
    ) then
    new.registration_status := 'pending';
    new.viewed_by_salon := false;
  end if;
  return new;
end $$;
drop trigger if exists aa_classify_customer_registration_v1 on public.customers;
create trigger aa_classify_customer_registration_v1
  before insert on public.customers for each row
  execute function public.classify_new_frontend_customer_registration_v1();
revoke all on function public.classify_new_frontend_customer_registration_v1() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_public_customer_legacy_impl(p_salon_code text, p_customer_name text, p_customer_phone text, p_customer_email text DEFAULT NULL::text, p_customer_instagram text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g');
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_instagram text := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_workspace_id uuid;
  v_workspace record;
  v_existing_customer record;
  v_customer_id uuid;
  v_duplicate_phone boolean := false;
  v_duplicate_email boolean := false;
  v_duplicate_check jsonb;
  v_email_verified boolean := false;
begin
  if v_salon_code = '' then
    raise exception 'salon_not_found';
  end if;

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_phone = '' then
    raise exception 'customer_phone_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);

  if v_workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  v_duplicate_check := public.check_public_customer_registration_duplicate(
    v_salon_code,
    v_customer_email::text,
    v_customer_phone
  );
  v_duplicate_email := coalesce((v_duplicate_check ->> 'emailTaken')::boolean, false);
  v_duplicate_phone := coalesce((v_duplicate_check ->> 'phoneTaken')::boolean, false);

  if v_duplicate_phone and v_duplicate_email then
    raise exception 'duplicate_email_phone';
  elsif v_duplicate_email then
    raise exception 'duplicate_email';
  elsif v_duplicate_phone then
    raise exception 'duplicate_phone';
  end if;

  select
    workspace.id as workspace_id,
    workspace.owner_email,
    workspace.salon_name
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = v_workspace_id
  limit 1;

  select
    customer.id,
    customer.phone,
    customer.email
  into v_existing_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = right(v_customer_phone, 10)
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_existing_customer.id is not null then
    v_duplicate_phone :=
      right(regexp_replace(coalesce(v_existing_customer.phone, ''), '\D+', '', 'g'), 10) =
      right(v_customer_phone, 10);
    v_duplicate_email :=
      lower(trim(coalesce(v_existing_customer.email::text, ''))) = v_customer_email::text;

    if v_duplicate_phone and v_duplicate_email then
      raise exception 'duplicate_email_phone';
    elsif v_duplicate_email then
      raise exception 'duplicate_email';
    elsif v_duplicate_phone then
      raise exception 'duplicate_phone';
    end if;
  end if;

  select exists (
    select 1
    from public.email_otp_verifications as otp
    where otp.email = v_customer_email
      and otp.purpose = 'client_registration'
      and coalesce(otp.salon_code, '') = v_salon_code
      and otp.consumed_at is not null
      and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
  )
  into v_email_verified;

  if not v_email_verified then
    raise exception 'customer_email_not_verified';
  end if;

  begin
    insert into public.customers (
      workspace_id,
      full_name,
      phone,
      email,
      instagram,
      note,
      source,
      viewed_by_salon,
      max_future_appointments,
      max_future_appointments_mode,
      max_daily_appointments,
      registration_status
    )
    values (
      v_workspace_id,
      v_customer_name,
      v_customer_phone,
      v_customer_email,
      v_customer_instagram,
      '',
      'frontend',
      false,
      4,
      'monthly',
      3,
      case when public.resolve_public_portal_availability_settings(v_workspace_id)
        -> 'customerRegistrationApprovalRequired' = 'true'::jsonb
        then 'pending' else 'approved' end
    )
    returning id into v_customer_id;
  exception
    when unique_violation then
      select
        customer.id,
        customer.phone,
        customer.email
      into v_existing_customer
      from public.customers as customer
      where customer.workspace_id = v_workspace_id
        and (
          right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = right(v_customer_phone, 10)
          or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
        )
      order by customer.updated_at desc, customer.created_at desc
      limit 1;

      if v_existing_customer.id is not null then
        v_duplicate_phone :=
          right(regexp_replace(coalesce(v_existing_customer.phone, ''), '\D+', '', 'g'), 10) =
          right(v_customer_phone, 10);
        v_duplicate_email :=
          lower(trim(coalesce(v_existing_customer.email::text, ''))) = v_customer_email::text;

        if v_duplicate_phone and v_duplicate_email then
          raise exception 'duplicate_email_phone';
        elsif v_duplicate_email then
          raise exception 'duplicate_email';
        elsif v_duplicate_phone then
          raise exception 'duplicate_phone';
        end if;
      end if;

      raise;
  end;

  perform public.sync_client_portal_customers(v_workspace_id);

  return jsonb_build_object(
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$function$;

create or replace function public.queue_public_owner_push(
  p_workspace_id uuid, p_event_type public.push_event_type, p_title text, p_body text,
  p_payload jsonb default '{}'::jsonb
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_payload jsonb := coalesce(p_payload,'{}'::jsonb); v_customer_id text;
begin
  if v_payload->>'kind' = 'frontend_customer_registered' then
    v_customer_id := nullif(trim(v_payload->>'customerId'),'');
    if v_customer_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':customer-registration:' || v_customer_id,0));
      if exists(select 1 from public.push_notifications
        where workspace_id=p_workspace_id and status in ('queued','processing','sent')
          and payload->>'kind'='frontend_customer_registered'
          and payload->>'customerId'=v_customer_id) then return 0; end if;
      v_payload := v_payload || jsonb_build_object('_dedupeKey','customer-registration:' || v_customer_id);
    end if;
  end if;
  return public.queue_workspace_push(p_workspace_id,p_event_type,p_title,p_body,v_payload);
end $$;

CREATE OR REPLACE FUNCTION public.register_public_customer_with_password(p_salon_code text, p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_instagram text, p_customer_password text)
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
    return null;
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  v_result := v_result || jsonb_build_object('registrationStatus',
    coalesce((select registration_status from public.customers where id=v_customer_id),'approved'));
  select credential.password_hash
  into v_password_hash
  from public.customer_login_credentials as credential
  where credential.customer_id = v_customer_id;

  if v_password_hash is null then
    return v_result || jsonb_build_object('passwordRequired', false);
  end if;

  if coalesce(p_customer_password, '') = '' then
    raise exception 'customer_password_required';
  end if;

  if extensions.crypt(p_customer_password, v_password_hash) <> v_password_hash then
    raise exception 'invalid_customer_password';
  end if;

  return v_result || jsonb_build_object('passwordRequired', true);
end;
$function$;

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

  return v_result || jsonb_build_object('passwordRequired', false);
end;
$function$;

create or replace function public.get_public_customer_registration_status_v1(
  p_salon_code text, p_customer_email text, p_customer_phone text
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object('found',true,'registrationStatus',customer.registration_status)
    from public.customers customer
    join public.workspaces workspace on workspace.id=customer.workspace_id
    where workspace.slug=lower(trim(coalesce(p_salon_code,'')))
      and nullif(trim(coalesce(p_customer_email,'')),'') is not null
      and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
      and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
      and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
        right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
    order by customer.updated_at desc,customer.id limit 1
  ),jsonb_build_object('found',false,'registrationStatus',null));
$$;
revoke all on function public.get_public_customer_registration_status_v1(text,text,text) from public;
grant execute on function public.get_public_customer_registration_status_v1(text,text,text) to anon, authenticated;

-- Pure overlay preserves all unrelated card data from old recovery snapshots.
create or replace function public.overlay_customer_registration_status_v1(p_workspace_id uuid,p_items jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(item || jsonb_build_object('registrationStatus',
    coalesce(customer.registration_status,'approved')) order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end)
    with ordinality as elements(item,ordinal)
  left join public.customers customer
    on customer.workspace_id=p_workspace_id and customer.id::text=item->>'id';
$$;
revoke all on function public.overlay_customer_registration_status_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.overlay_customer_registration_status_v1(uuid,jsonb) to service_role;

create or replace function public.protect_portal_customer_registration_status_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.clienti := public.overlay_customer_registration_status_v1(new.workspace_id,new.clienti);
  return new;
end $$;
drop trigger if exists protect_portal_customer_registration_status_v1 on public.client_portals;
create trigger protect_portal_customer_registration_status_v1
  before insert or update of clienti on public.client_portals for each row
  execute function public.protect_portal_customer_registration_status_v1();
revoke all on function public.protect_portal_customer_registration_status_v1() from public, anon, authenticated;

create or replace function public.keep_pending_customer_registration_unread_v1()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.registration_status='pending' then new.viewed_by_salon := false; end if;
  return new;
end $$;
drop trigger if exists keep_pending_customer_registration_unread_v1 on public.customers;
create trigger keep_pending_customer_registration_unread_v1
  before insert or update of registration_status, viewed_by_salon on public.customers for each row
  execute function public.keep_pending_customer_registration_unread_v1();
revoke all on function public.keep_pending_customer_registration_unread_v1() from public, anon, authenticated;

-- A recovered/older full publisher may upsert DEFAULT approved into a
-- pending row. Admission can only transition through the owner decision RPC;
-- a stale pending snapshot cannot downgrade a later approval either.
create or replace function public.preserve_customer_registration_decision_v1()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.registration_status='approved' then
    new.registration_status := 'approved';
  elsif new.registration_status='approved'
    and coalesce(current_setting('salonpro.approving_customer_registration',true),'')<>old.id::text then
    new.registration_status := 'pending';
  end if;
  return new;
end $$;
drop trigger if exists ab_preserve_customer_registration_v1 on public.customers;
create trigger ab_preserve_customer_registration_v1
  before update of registration_status on public.customers for each row
  execute function public.preserve_customer_registration_decision_v1();
revoke all on function public.preserve_customer_registration_decision_v1() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_client_portal_customers(p_workspace_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.client_portals as portal
  set clienti = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', customer.id,
          'nome', customer.full_name,
          'telefono', coalesce(customer.phone, ''),
          'email', coalesce(customer.email::text, ''),
          'instagram', coalesce(customer.instagram, ''),
          'birthday', coalesce(
            to_char(customer.birthday, 'YYYY-MM-DD'),
            matched.item ->> 'birthday',
            ''
          ),
          'nota', coalesce(customer.note, ''),
          'fonte',
            case when customer.source = 'frontend' then 'frontend' else 'salone' end,
          'viewedBySalon', customer.viewed_by_salon,
          'registrationStatus', customer.registration_status,
          'annullamentiCount',
            case
              when coalesce(matched.item ->> 'annullamentiCount', '') ~ '^\d+$'
                then (matched.item ->> 'annullamentiCount')::integer
              else 0
            end,
          'inibito', not coalesce(customer.is_active, true),
          'maxFutureAppointments', customer.max_future_appointments,
          'maxFutureAppointmentsMode', customer.max_future_appointments_mode,
          'maxDailyAppointments', customer.max_daily_appointments
        )
        order by customer.updated_at desc, customer.created_at desc
      )
      from public.customers as customer
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
        where
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text
          or (
            regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') <> ''
            and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') <> ''
            and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
              regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g')
          )
          or (
            lower(trim(coalesce(existing_item ->> 'email', ''))) <> ''
            and lower(trim(coalesce(customer.email::text, ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'email', ''))) =
              lower(trim(coalesce(customer.email::text, '')))
          )
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(customer.full_name, ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) =
              lower(trim(coalesce(customer.full_name, '')))
          )
        and not exists (
          select 1 from public.customers as other_customer
          where other_customer.workspace_id=portal.workspace_id
            and other_customer.id<>customer.id
            and other_customer.id::text=coalesce(existing_item->>'id','')
        )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text then 0
            when regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
              regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') then 1
            when lower(trim(coalesce(existing_item ->> 'email', ''))) =
              lower(trim(coalesce(customer.email::text, ''))) then 2
            else 3
          end
        limit 1
      ) as matched on true
      where customer.workspace_id = portal.workspace_id
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$function$;

CREATE OR REPLACE FUNCTION public.handle_client_portal_customer_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
  v_customer_id uuid := coalesce(new.id, old.id);
  v_full_name text := trim(coalesce(new.full_name, old.full_name, ''));
  v_phone text := coalesce(new.phone, old.phone, '');
  v_normalized_phone text := regexp_replace(coalesce(new.phone, old.phone, ''), '\D+', '', 'g');
  v_email_text text := lower(trim(coalesce(new.email::text, old.email::text, '')));
  v_instagram text := coalesce(new.instagram, old.instagram, '');
  v_note text := coalesce(new.note, old.note, '');
  v_source text := coalesce(new.source, old.source, 'salon');
  v_is_active boolean := coalesce(new.is_active, old.is_active, true);
  v_viewed_by_salon boolean := coalesce(new.viewed_by_salon, old.viewed_by_salon, true);
  v_max_future_appointments integer := coalesce(new.max_future_appointments, old.max_future_appointments);
  v_max_future_appointments_mode text := coalesce(new.max_future_appointments_mode, old.max_future_appointments_mode);
  v_max_daily_appointments integer := coalesce(new.max_daily_appointments, old.max_daily_appointments);
  v_preserved_item jsonb;
  v_customer_payload jsonb;
begin
  if coalesce(current_setting('salonpro.skip_client_portal_snapshot_sync', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    update public.client_portals as portal
    set
      clienti = coalesce(
        (
          select jsonb_agg(existing_item)
          from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
          where not ((
            (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
            or (
              v_normalized_phone <> ''
              and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
            )
            or (
              v_email_text <> ''
              and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
            )
            or (
              v_full_name <> ''
              and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
            )
          ) and not exists (
        select 1 from public.customers as other_customer
        where other_customer.workspace_id=v_workspace_id
          and other_customer.id<>v_customer_id
          and other_customer.id::text=coalesce(existing_item->>'id','')
      ))
        ),
        '[]'::jsonb
      ),
      updated_at = timezone('utc', now())
    where portal.workspace_id = v_workspace_id;

    return old;
  end if;

  select existing_item
  into v_preserved_item
  from public.client_portals as portal
  cross join lateral jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
  where portal.workspace_id = v_workspace_id
    and ((
      (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
      or (
        v_normalized_phone <> ''
        and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
      )
      or (
        v_email_text <> ''
        and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
      )
      or (
        v_full_name <> ''
        and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
      )
    ) and not exists (
        select 1 from public.customers as other_customer
        where other_customer.workspace_id=v_workspace_id
          and other_customer.id<>v_customer_id
          and other_customer.id::text=coalesce(existing_item->>'id','')
      ))
  order by
    case
      when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text then 0
      when (
        v_normalized_phone <> ''
        and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
      ) then 1
      when (
        v_email_text <> ''
        and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
      ) then 2
      else 3
    end
  limit 1;

  v_customer_payload := jsonb_build_object(
    'id', v_customer_id,
    'nome', v_full_name,
    'telefono', v_phone,
    'email', coalesce(new.email::text, old.email::text, ''),
    'instagram', v_instagram,
    'birthday', coalesce(v_preserved_item ->> 'birthday', ''),
    'nota', v_note,
    'fonte',
      case
        when v_source = 'frontend' then 'frontend'
        else 'salone'
      end,
    'viewedBySalon', v_viewed_by_salon,
    'registrationStatus', coalesce(new.registration_status,old.registration_status,'approved'),
    'annullamentiCount',
      case
        when coalesce(v_preserved_item ->> 'annullamentiCount', '') ~ '^\d+$'
          then (v_preserved_item ->> 'annullamentiCount')::integer
        else 0
      end,
    'inibito', not v_is_active,
    'maxFutureAppointments',
      coalesce(
        to_jsonb(v_max_future_appointments),
        case
          when coalesce(v_preserved_item ->> 'maxFutureAppointments', '') ~ '^\d+$'
            then to_jsonb((v_preserved_item ->> 'maxFutureAppointments')::integer)
          else 'null'::jsonb
        end
      ),
    'maxFutureAppointmentsMode',
      coalesce(
        to_jsonb(v_max_future_appointments_mode),
        case
          when v_preserved_item ->> 'maxFutureAppointmentsMode' in ('monthly', 'total_future')
            then to_jsonb(v_preserved_item ->> 'maxFutureAppointmentsMode')
          else 'null'::jsonb
        end
      ),
    'maxDailyAppointments',
      coalesce(
        to_jsonb(v_max_daily_appointments),
        case
          when coalesce(v_preserved_item ->> 'maxDailyAppointments', '') ~ '^\d+$'
            then to_jsonb((v_preserved_item ->> 'maxDailyAppointments')::integer)
          else 'null'::jsonb
        end
      )
  );

  update public.client_portals as portal
  set
    clienti = coalesce(
      (
        select jsonb_agg(item order by sort_order)
        from (
          select v_customer_payload as item, 0 as sort_order
          union all
          select existing_item as item, 1 as sort_order
          from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
          where not ((
            (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
            or (
              v_normalized_phone <> ''
              and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
            )
            or (
              v_email_text <> ''
              and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
            )
            or (
              v_full_name <> ''
              and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
            )
          ) and not exists (
        select 1 from public.customers as other_customer
        where other_customer.workspace_id=v_workspace_id
          and other_customer.id<>v_customer_id
          and other_customer.id::text=coalesce(existing_item->>'id','')
      ))
        ) as reordered_items
      ),
      '[]'::jsonb
    ),
    updated_at = timezone('utc', now())
  where portal.workspace_id = v_workspace_id;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_portal_owner_payload(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with snapshot_payload as (
    select case
      when jsonb_typeof(raw_payload.payload) = 'object'
        then raw_payload.payload
      else '{}'::jsonb
    end as payload
    from (
      select (
        select snapshot.payload
        from public.owner_app_snapshots as snapshot
        where snapshot.workspace_id = p_workspace_id
        limit 1
      ) as payload
    ) as raw_payload
  )
  select snapshot_payload.payload || jsonb_build_object(
    'clienti', public.overlay_customer_registration_status_v1(p_workspace_id,coalesce(snapshot_payload.payload->'clienti','[]'::jsonb)),
    'availabilitySettings', public.merge_customer_registration_settings_v1(
      (select availability_settings from public.client_portals where workspace_id=p_workspace_id),
      snapshot_payload.payload->'availabilitySettings',
      coalesce(snapshot_payload.payload->'availabilitySettings','{}'::jsonb)),
    'servizi',
    public.project_public_services_v1(
      p_workspace_id,
      coalesce(snapshot_payload.payload -> 'servizi', '[]'::jsonb)
    )
  )
  from snapshot_payload;
$function$;

create or replace function public.assert_customer_registration_approved_v1(
  p_workspace_id uuid, p_customer_email text, p_customer_phone text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_required boolean;
begin
  -- Match the same salon-scoped identity used by existing public login.
  select customer.* into v_customer from public.customers customer
  where customer.workspace_id=p_workspace_id and customer.registration_status='pending'
    and nullif(trim(coalesce(p_customer_email,'')),'') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
    and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
    and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
      right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
  order by customer.updated_at desc,customer.id limit 1
  for key share;
  if v_customer.registration_status='pending' then
    raise exception 'customer_registration_pending';
  end if;
  -- Pending lookup uses the partial index. Automatic salons avoid another
  -- full customer lookup or loading the large owner recovery JSON.
  select coalesce(availability_settings->'customerRegistrationApprovalRequired'='true'::jsonb,false)
    into v_required from public.client_portals where workspace_id=p_workspace_id;
  if v_required is true then
    select customer.* into v_customer from public.customers customer
    where customer.workspace_id=p_workspace_id and customer.registration_status='approved'
      and nullif(trim(coalesce(p_customer_email,'')),'') is not null
      and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
      and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
      and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
        right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
    order by customer.updated_at desc,customer.id limit 1 for key share;
    if v_customer.id is null then raise exception 'customer_registration_required'; end if;
  end if;
end $$;
revoke all on function public.assert_customer_registration_approved_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.assert_customer_registration_approved_v1(uuid,text,text) to service_role;

create or replace function public.enforce_customer_registration_booking_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.origin::text <> 'frontend' or new.status::text not in ('pending','accepted') then return new; end if;
  -- Read-marker updates and cancellation workflows remain independent. Reopen,
  -- identity replacement or rescheduling still runs the admission check.
  if tg_op='UPDATE' and old.origin::text='frontend' and old.status::text in ('pending','accepted')
    and new.workspace_id is not distinct from old.workspace_id
    and new.customer_id is not distinct from old.customer_id
    and new.customer_email is not distinct from old.customer_email
    and new.customer_phone is not distinct from old.customer_phone
    and new.requested_service_name is not distinct from old.requested_service_name
    and new.appointment_date is not distinct from old.appointment_date
    and new.appointment_time is not distinct from old.appointment_time then return new; end if;
  -- Some historical RPCs resolve customer_id using one contact field or name.
  -- A pending canonical row remains blocked even if the submitted contacts
  -- differ from the stored pair, or the setting was turned off meanwhile.
  if exists(select 1 from public.customers where workspace_id=new.workspace_id
    and id=new.customer_id and registration_status='pending') then
    raise exception 'customer_registration_pending';
  end if;
  perform public.assert_customer_registration_approved_v1(new.workspace_id,new.customer_email::text,new.customer_phone);
  return new;
end $$;
drop trigger if exists aa_customer_registration_booking_v1 on public.booking_requests;
create trigger aa_customer_registration_booking_v1
  before insert or update on public.booking_requests for each row
  execute function public.enforce_customer_registration_booking_v1();
revoke all on function public.enforce_customer_registration_booking_v1() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.booking_payment_customer_context(p_salon_code text, p_email text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid; c uuid; matches integer;
begin
 if length(trim(coalesce(p_email,'')))=0 or length(regexp_replace(coalesce(p_phone,''),'\D','','g'))=0 then return null; end if;
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and (is_internal_tester = true or subscription_status in('demo','active'));
 if w is null then return null; end if;
 select count(*),(array_agg(id))[1] into matches,c from customers where workspace_id=w and is_active is not false
 and lower(trim(email::text))=lower(trim(p_email)) and regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g');
 if matches<>1 then return null; end if;
 perform public.assert_customer_registration_approved_v1(w,p_email,p_phone);
 return jsonb_build_object('workspaceId',w,'customerId',c,'policy',resolve_booking_payment_policy(w,c));
end $function$;

create or replace function public.decide_customer_registration(p_customer_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_customer public.customers%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_history boolean;
  v_fk record;
begin
  if auth.uid() is null or coalesce(auth.role(),'') <> 'authenticated' then raise exception 'owner_session_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then raise exception 'workspace_access_denied'; end if;
  if v_decision not in ('approved','rejected') then raise exception 'customer_registration_decision_invalid'; end if;
  if p_customer_id is null then raise exception 'customer_id_invalid'; end if;
  -- Terminal responses need no projection/customer lock. In particular, an
  -- approval retry must not wait for a booking that holds the customer FK and
  -- is about to refresh the portal. Approved admission cannot be downgraded.
  select * into v_customer from public.customers
    where id=p_customer_id and workspace_id=v_workspace_id;
  if found and v_customer.registration_status='approved' then
    if v_decision='rejected' then raise exception 'customer_registration_not_pending'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  if not found then
    if v_decision='rejected' and exists(select 1 from public.customer_registration_rejections
      where workspace_id=v_workspace_id and customer_id=p_customer_id) then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
    end if;
    raise exception 'customer_not_found';
  end if;
  -- Same order as settings/full snapshot publishing; acquire these before
  -- changing customers because their existing trigger touches the portal.
  perform 1 from public.owner_app_snapshots where workspace_id=v_workspace_id for update;
  perform 1 from public.client_portals where workspace_id=v_workspace_id for update;
  -- A different owner decision may have completed while we waited above.
  select * into v_customer from public.customers
    where id=p_customer_id and workspace_id=v_workspace_id;
  if found and v_customer.registration_status='approved' then
    if v_decision='rejected' then raise exception 'customer_registration_not_pending'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  -- Owner booking/editor writes can hold a customer FK before touching the
  -- portal. Never wait in the opposite direction: report a clean retry rather
  -- than deadlock, and hold the exclusive row lock through rejection's delete.
  begin
    select * into v_customer from public.customers
      where id=p_customer_id and workspace_id=v_workspace_id for update nowait;
  exception when lock_not_available then raise exception 'customer_registration_busy'; end;
  if not found then
    if v_decision='rejected' and exists(select 1 from public.customer_registration_rejections
      where workspace_id=v_workspace_id and customer_id=p_customer_id) then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
    end if;
    raise exception 'customer_not_found';
  end if;
  if v_decision='approved' then
    if v_customer.registration_status='approved' then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
    end if;
    perform set_config('salonpro.approving_customer_registration',p_customer_id::text,true);
    update public.customers set registration_status='approved',viewed_by_salon=true where id=p_customer_id;
    perform set_config('salonpro.approving_customer_registration','',true);
    update public.owner_app_snapshots
      set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{clienti}',
        public.overlay_customer_registration_status_v1(v_workspace_id,coalesce(payload->'clienti','[]'::jsonb)),true)
      where workspace_id=v_workspace_id;
    perform public.queue_public_customer_push(v_workspace_id,'custom','Registrazione approvata',
      'Il salone ha abilitato il tuo account. Ora puoi prenotare.',
      jsonb_build_object('kind','customer_registration_approved','type','customer_registration_approved',
        'customerId',p_customer_id,'salonCode',(select slug from public.workspaces where id=v_workspace_id),
        '_dedupeKey','customer-registration-approved:' || p_customer_id::text),
      v_customer.email,v_customer.phone);
    return jsonb_build_object('ok',true,'replayed',false,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  if v_customer.registration_status<>'pending' then raise exception 'customer_registration_not_pending'; end if;
  -- No historical/business data is deleted. A salon may have added an owner
  -- appointment or benefit while admission was pending; it must approve and
  -- use the regular customer management flow instead of rejecting that row.
  if exists(select 1 from public.appointments where workspace_id=v_workspace_id and customer_id=p_customer_id)
    or exists(select 1 from public.appointment_groups where workspace_id=v_workspace_id and customer_id=p_customer_id)
    or exists(select 1 from public.booking_requests where workspace_id=v_workspace_id and (
      customer_id=p_customer_id or (lower(trim(coalesce(customer_email::text,'')))=lower(trim(coalesce(v_customer.email::text,'')))
        and right(regexp_replace(coalesce(customer_phone,''),'\D+','','g'),10)=right(regexp_replace(coalesce(v_customer.phone,''),'\D+','','g'),10)))) then
    raise exception 'pending_customer_has_history';
  end if;
  for v_fk in
    select namespace.nspname,relation.relname,attribute.attname
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f' and constraint_row.confrelid='public.customers'::regclass
      and namespace.nspname='public'
      and relation.relname not in (
        'customer_login_credentials','customer_payment_sessions',
        'customer_communication_recipients','customer_service_duration_overrides',
        'customer_service_price_overrides','customer_personalization_revisions',
        'customer_online_booking_policies','customer_online_service_overrides',
        'customer_online_composition_overrides','booking_payment_policies',
        'customer_identity_colors','customer_communication_reminder_days',
        'customer_communication_reminder_dismissals','client_gps_reminder_state',
        'customer_benefit_notifications')
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.nspname,v_fk.relname,v_fk.attname)
      into v_history using p_customer_id;
    if v_history then raise exception 'pending_customer_has_history'; end if;
  end loop;
  -- Notifications carry no business balance and must not prevent removing a
  -- just-registered customer; all credentials/sessions cascade from this row.
  delete from public.customer_benefit_notifications where customer_id=p_customer_id and workspace_id=v_workspace_id;
  insert into public.customer_registration_rejections(workspace_id,customer_id)
    values(v_workspace_id,p_customer_id) on conflict do nothing;
  begin
    delete from public.customers where id=p_customer_id and workspace_id=v_workspace_id;
  exception when foreign_key_violation then raise exception 'pending_customer_has_history'; end;
  -- Filter both projections immediately. UUID evidence also survives clearing
  -- the old name tombstone during a later legitimate new registration.
  update public.client_portals set clienti=public.filter_deleted_snapshot_customers(v_workspace_id,clienti)
    where workspace_id=v_workspace_id;
  update public.owner_app_snapshots
    set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{clienti}',
      public.filter_deleted_snapshot_customers(v_workspace_id,coalesce(payload->'clienti','[]'::jsonb)),true)
    where workspace_id=v_workspace_id;
  return jsonb_build_object('ok',true,'replayed',false,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
end $$;
revoke all on function public.decide_customer_registration(uuid,text) from public, anon;
grant execute on function public.decide_customer_registration(uuid,text) to authenticated;
