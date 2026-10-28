-- A customer may be allowed to send a second booking on the same day for a
-- relative or friend, but the public frontend must never create overlapping
-- customer envelopes. Operator processing/pose remains free as before.

create or replace function public.public_customer_booking_envelope_available_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_requested_start_at timestamp;
  v_requested_end_at timestamp;
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or p_appointment_time is null
    or greatest(coalesce(p_requested_duration_minutes, 0), 0) = 0
  then
    return false;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return true;
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = p_workspace_id
    and customer.is_active is not false
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  v_requested_start_at := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at := v_requested_start_at
    + make_interval(mins => greatest(p_requested_duration_minutes, 1));

  if exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and request.status::text in ('pending', 'accepted')
      and request.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and request.customer_id = v_customer_id)
        or (v_customer_email is not null and request.customer_email = v_customer_email)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
            v_customer_phone
        )
      )
      and (request.appointment_date::timestamp + request.appointment_time) <
        v_requested_end_at
      and (
        request.appointment_date::timestamp
        + request.appointment_time
        + make_interval(mins => greatest(coalesce(request.requested_duration_minutes, 60), 1))
      ) > v_requested_start_at
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    left join public.customers as customer
      on customer.workspace_id = appointment.workspace_id
      and customer.id = appointment.customer_id
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or (v_customer_email is not null and customer.email = v_customer_email)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
            v_customer_phone
        )
      )
      and (appointment.appointment_date::timestamp + appointment.appointment_time) <
        v_requested_end_at
      and (
        appointment.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_requested_start_at
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.public_customer_booking_envelope_available_v1(
  uuid, date, time, integer, text, text
) from public;
grant execute on function public.public_customer_booking_envelope_available_v1(
  uuid, date, time, integer, text, text
) to anon, authenticated, service_role;

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
        + make_interval(
          mins => greatest(coalesce(existing_request.requested_duration_minutes, 60), 1)
        )
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
      and (appointment.appointment_date::timestamp + appointment.appointment_time) <
        v_new_end_at
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

-- Restore the same hard public rule around terminal pauses. The owner-only
-- transaction override remains available to Agenda operations.
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

-- The phased writers perform a full customer-envelope check before their
-- initial short request is expanded to its complete duration. Remove only the
-- delegated-booking bypass from those two existing implementations.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_guard text := '  if not public.customer_allows_delegated_booking_v1(v_workspace_id, v_customer_id, v_customer_email, v_customer_phone) and (exists (';
  v_close text := E')) then\n    raise exception ''customer_time_conflict'';';
  v_replacement_close text := E') then\n    raise exception ''customer_time_conflict'';';
begin
  for v_signature in
    select signature
    from unnest(array[
      'public.create_public_phased_booking_request_with_assignments_v1_with_final(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure,
      'public.create_public_phased_booking_request_with_assignments_v1(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
    ]) as signatures(signature)
  loop
    select pg_get_functiondef(v_signature) into v_definition;

    if position(v_guard in v_definition) = 0 then
      if position('customer_allows_delegated_booking_v1' in v_definition) > 0 then
        raise exception 'public_customer_overlap_guard_shape_changed:%', v_signature;
      end if;
      continue;
    end if;

    v_next := replace(v_definition, v_guard, '  if exists (');
    if v_next = v_definition then
      raise exception 'public_customer_overlap_guard_open_missing:%', v_signature;
    end if;
    v_definition := v_next;

    v_next := replace(v_definition, v_close, v_replacement_close);
    if v_next = v_definition then
      raise exception 'public_customer_overlap_guard_close_missing:%', v_signature;
    end if;

    execute v_next;
  end loop;
end;
$migration$;

-- Linked-service availability must reject the complete customer envelope
-- before selecting operators, so an overlapping slot is not advertised even
-- when the operator is technically free during processing/pose.
do $migration$
declare
  v_signature regprocedure :=
    'public.resolve_public_dependency_operator_plan_v1(uuid,text,uuid,date,time without time zone,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := $anchor$  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);$anchor$;
  v_replacement text := $replacement$  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);

  if not public.public_customer_booking_envelope_available_v1(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    v_parent_duration + v_dependency_duration,
    p_customer_email,
    p_customer_phone
  ) then
    return jsonb_build_object('available', false);
  end if;$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('public_customer_booking_envelope_available_v1' in v_definition) = 0 then
    v_next := replace(v_definition, v_anchor, v_replacement);
    if v_next = v_definition then
      raise exception 'dependency_customer_envelope_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
