-- Treat the per-customer second-booking switch as permission to book on
-- behalf of a relative or friend. The customer identity must no longer make a
-- real salon slot look busy, while operator, capacity, machinery and schedule
-- guards remain authoritative.

create or replace function public.customer_allows_delegated_booking_v1(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := p_customer_id;
  v_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
begin
  if v_customer_id is null and (v_email is not null or v_phone is not null) then
    select customer.id
    into v_customer_id
    from public.customers as customer
    where customer.workspace_id = p_workspace_id
      and customer.is_active is not false
      and (
        (v_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_email::text)
        or (
          v_phone is not null
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_phone
        )
      )
    order by customer.updated_at desc, customer.created_at desc
    limit 1;
  end if;

  return coalesce((
    select policy.allow_same_day_same_service
    from public.customer_online_booking_policies as policy
    where policy.workspace_id = p_workspace_id
      and policy.customer_id = v_customer_id
    limit 1
  ), true);
end;
$$;

revoke all on function public.customer_allows_delegated_booking_v1(
  uuid, uuid, citext, text
) from public;
grant execute on function public.customer_allows_delegated_booking_v1(
  uuid, uuid, citext, text
) to anon, authenticated, service_role;

-- Keep the legacy helper signature used by the atomic writer, but align its
-- meaning with the customer-facing switch. The service name is intentionally
-- irrelevant: delegated bookings may cross services, roles and branches.
create or replace function public.customer_allows_same_day_same_service_v1(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_service_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.customer_allows_delegated_booking_v1(
    p_workspace_id,
    p_customer_id,
    null,
    null
  );
$$;

revoke all on function public.customer_allows_same_day_same_service_v1(
  uuid, uuid, text
) from public;
grant execute on function public.customer_allows_same_day_same_service_v1(
  uuid, uuid, text
) to anon, authenticated, service_role;

-- Internal tester workspaces must expose the saved customer policy exactly as
-- active workspaces do; otherwise the app briefly falls back to the default.
create or replace function public.get_public_customer_online_booking_policy_v2(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.get_public_customer_online_booking_policy_v2(
  text, text, text
) from public;
grant execute on function public.get_public_customer_online_booking_policy_v2(
  text, text, text
) to anon, authenticated;

create or replace function public.prevent_public_customer_time_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_start_at timestamp;
  v_new_end_at timestamp;
  v_new_email citext;
  v_new_phone text;
begin
  if current_setting('salonpro.allow_owner_customer_overlap', true) = 'on' then
    return new;
  end if;

  if new.origin::text <> 'frontend' or new.status::text not in ('pending', 'accepted') then
    return new;
  end if;

  if public.customer_allows_delegated_booking_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_email,
    new.customer_phone
  ) then
    return new;
  end if;

  v_new_email := nullif(lower(trim(coalesce(new.customer_email::text, ''))), '')::citext;
  v_new_phone := nullif(regexp_replace(coalesce(new.customer_phone, ''), '\D+', '', 'g'), '');
  v_new_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_new_end_at := v_new_start_at
    + make_interval(mins => greatest(coalesce(new.requested_duration_minutes, 60), 1));

  perform pg_advisory_xact_lock(
    hashtext(new.workspace_id::text || ':' || new.appointment_date::text)
  );

  if exists (
    select 1
    from public.booking_requests as existing_request
    where existing_request.workspace_id = new.workspace_id
      and existing_request.id is distinct from new.id
      and existing_request.status::text in ('pending', 'accepted')
      and existing_request.appointment_date = new.appointment_date
      and (
        (new.customer_id is not null and existing_request.customer_id = new.customer_id)
        or (v_new_email is not null and existing_request.customer_email = v_new_email)
        or (
          v_new_phone is not null
          and regexp_replace(coalesce(existing_request.customer_phone, ''), '\D+', '', 'g') =
            v_new_phone
        )
      )
      and (existing_request.appointment_date::timestamp + existing_request.appointment_time) <
        v_new_end_at
      and (
        existing_request.appointment_date::timestamp
        + existing_request.appointment_time
        + make_interval(mins => greatest(coalesce(existing_request.requested_duration_minutes, 60), 1))
      ) > v_new_start_at
  ) then
    raise exception 'customer_time_conflict';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    left join public.customers as customer
      on customer.workspace_id = appointment.workspace_id
      and customer.id = appointment.customer_id
    where appointment.workspace_id = new.workspace_id
      and appointment.booking_request_id is distinct from new.id
      and appointment.appointment_date = new.appointment_date
      and (
        (new.customer_id is not null and appointment.customer_id = new.customer_id)
        or (v_new_email is not null and customer.email = v_new_email)
        or (
          v_new_phone is not null
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_new_phone
        )
      )
      and (appointment.appointment_date::timestamp + appointment.appointment_time) < v_new_end_at
      and (
        appointment.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_new_start_at
  ) then
    raise exception 'customer_time_conflict';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_booking_request_terminal_pause_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamp;
  v_end_at timestamp;
begin
  if current_setting('salonpro.allow_owner_customer_overlap', true) = 'on' then
    return new;
  end if;
  if new.status::text not in ('pending', 'accepted') then
    return new;
  end if;
  if new.origin::text = 'frontend' and public.customer_allows_delegated_booking_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_email,
    new.customer_phone
  ) then
    return new;
  end if;

  v_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_end_at := v_start_at
    + make_interval(mins => greatest(coalesce(new.requested_duration_minutes, 60), 1));

  if public.customer_terminal_pause_conflicts_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_name,
    new.customer_email,
    new.customer_phone,
    v_start_at,
    v_end_at,
    new.appointment_group_id
  ) then
    raise exception 'customer_terminal_pause_overlap';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_appointment_terminal_pause_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamp;
  v_end_at timestamp;
begin
  if current_setting('salonpro.allow_owner_customer_overlap', true) = 'on' then
    return new;
  end if;

  if new.booking_request_id is not null
    and exists (
      select 1
      from public.booking_requests as request
      where request.workspace_id = new.workspace_id
        and request.id = new.booking_request_id
        and request.origin::text = 'frontend'
    )
    and public.customer_allows_delegated_booking_v1(
      new.workspace_id,
      new.customer_id,
      null,
      null
    )
  then
    return new;
  end if;

  v_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_end_at := v_start_at
    + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1));

  if public.customer_terminal_pause_conflicts_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_name,
    null,
    null,
    v_start_at,
    v_end_at,
    new.appointment_group_id
  ) then
    raise exception 'customer_terminal_pause_overlap';
  end if;

  return new;
end;
$$;

-- The phased writers predate the overlap trigger and contain an additional
-- inline identity-envelope check. Patch exactly that single check in both the
-- final-phase implementation and the optional-final wrapper.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_marker text := 'raise exception ''customer_time_conflict'';';
  v_open text := '  if exists (';
  v_close text := E') then\n    raise exception ''customer_time_conflict'';';
  v_guard text := '  if not public.customer_allows_delegated_booking_v1('
    || 'v_workspace_id, v_customer_id, v_customer_email, v_customer_phone'
    || ') and (exists (';
  v_marker_position integer;
  v_reverse_position integer;
  v_if_position integer;
  v_close_relative integer;
  v_close_position integer;
begin
  for v_signature in
    select signature
    from unnest(array[
      'public.create_public_phased_booking_request_with_assignments_v1_with_final(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure,
      'public.create_public_phased_booking_request_with_assignments_v1(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
    ]) as signatures(signature)
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position('customer_allows_delegated_booking_v1' in v_definition) > 0 then
      continue;
    end if;

    v_marker_position := position(v_marker in v_definition);
    if v_marker_position = 0 then
      raise exception 'delegated_booking_customer_conflict_marker_missing:%', v_signature;
    end if;

    v_reverse_position := position(
      reverse(v_open) in reverse(left(v_definition, v_marker_position - 1))
    );
    if v_reverse_position = 0 then
      raise exception 'delegated_booking_customer_conflict_open_missing:%', v_signature;
    end if;
    v_if_position := v_marker_position - 1 - v_reverse_position - length(v_open) + 2;

    v_next := overlay(v_definition placing v_guard from v_if_position for length(v_open));
    v_close_relative := position(v_close in substring(v_next from v_if_position));
    if v_close_relative = 0 then
      raise exception 'delegated_booking_customer_conflict_close_missing:%', v_signature;
    end if;
    v_close_position := v_if_position + v_close_relative - 1;
    v_next := overlay(
      v_next
      placing E')) then\n    raise exception ''customer_time_conflict'';'
      from v_close_position
      for length(v_close)
    );

    execute v_next;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
