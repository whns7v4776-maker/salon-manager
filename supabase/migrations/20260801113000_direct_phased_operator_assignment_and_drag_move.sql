alter table public.booking_requests
  add column if not exists phase_operator_assignments jsonb,
  add column if not exists phase_overlap_overrides jsonb;

alter table public.appointments
  add column if not exists phase_operator_assignments jsonb,
  add column if not exists phase_overlap_overrides jsonb;

comment on column public.booking_requests.phase_operator_assignments is
  'Operatori assegnati alle fasi initial/final di un servizio con posa.';
comment on column public.appointments.phase_operator_assignments is
  'Snapshot operatori delle fasi initial/final; la pausa resta libera.';
comment on column public.appointments.phase_overlap_overrides is
  'Conferma esplicita del salone per eventuali sovrapposizioni delle singole fasi.';

create or replace function public.copy_booking_phase_snapshot_to_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.booking_request_id is not null then
    select
      coalesce(new.phase_snapshot, booking_request.phase_snapshot),
      coalesce(new.phase_operator_assignments, booking_request.phase_operator_assignments),
      coalesce(new.phase_overlap_overrides, booking_request.phase_overlap_overrides)
    into
      new.phase_snapshot,
      new.phase_operator_assignments,
      new.phase_overlap_overrides
    from public.booking_requests as booking_request
    where booking_request.id = new.booking_request_id;
  end if;
  return new;
end;
$$;

create or replace function public.phased_operator_interval_conflicts_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_operator_id text default null,
  p_operator_name text default null,
  p_exclude_appointment_id uuid default null,
  p_exclude_request_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      p_appointment_date::timestamp + p_start_time as starts_at,
      p_appointment_date::timestamp + p_start_time
        + make_interval(mins => greatest(coalesce(p_duration_minutes, 1), 1)) as ends_at,
      nullif(trim(coalesce(p_operator_id, '')), '') as operator_id,
      lower(nullif(trim(coalesce(p_operator_name, '')), '')) as operator_name
  ), appointment_intervals as (
    select
      appointment.id,
      appointment.booking_request_id,
      appointment.appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => phase.start_offset) as starts_at,
      appointment.appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => phase.start_offset + phase.duration_minutes) as ends_at,
      nullif(trim(coalesce(
        appointment.phase_operator_assignments -> phase.phase_name ->> 'id',
        appointment.operator_id
      )), '') as operator_id,
      lower(nullif(trim(coalesce(
        appointment.phase_operator_assignments -> phase.phase_name ->> 'name',
        appointment.operator_name
      )), '')) as operator_name
    from public.appointments as appointment
    cross join lateral (
      select
        'initial'::text as phase_name,
        0 as start_offset,
        case
          when coalesce(appointment.phase_snapshot ->> 'mode', '') = 'phased'
            then greatest(coalesce((appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
          else greatest(coalesce(appointment.duration_minutes, 60), 1)
        end as duration_minutes
      union all
      select
        'final'::text,
        greatest(coalesce((appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 0)
          + greatest(coalesce((appointment.phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 0),
        greatest(coalesce((appointment.phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 0)
      where coalesce(appointment.phase_snapshot ->> 'mode', '') = 'phased'
    ) as phase
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
      and (p_exclude_request_id is null or appointment.booking_request_id is distinct from p_exclude_request_id)
  ), request_intervals as (
    select
      booking_request.id,
      booking_request.appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => phase.start_offset) as starts_at,
      booking_request.appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => phase.start_offset + phase.duration_minutes) as ends_at,
      nullif(trim(coalesce(
        booking_request.phase_operator_assignments -> phase.phase_name ->> 'id',
        booking_request.requested_operator_id
      )), '') as operator_id,
      lower(nullif(trim(coalesce(
        booking_request.phase_operator_assignments -> phase.phase_name ->> 'name',
        booking_request.requested_operator_name
      )), '')) as operator_name
    from public.booking_requests as booking_request
    cross join lateral (
      select
        'initial'::text as phase_name,
        0 as start_offset,
        case
          when coalesce(booking_request.phase_snapshot ->> 'mode', '') = 'phased'
            then greatest(coalesce((booking_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
          else greatest(coalesce(booking_request.requested_duration_minutes, 60), 1)
        end as duration_minutes
      union all
      select
        'final'::text,
        greatest(coalesce((booking_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 0)
          + greatest(coalesce((booking_request.phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 0),
        greatest(coalesce((booking_request.phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 0)
      where coalesce(booking_request.phase_snapshot ->> 'mode', '') = 'phased'
    ) as phase
    where booking_request.workspace_id = p_workspace_id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and (p_exclude_request_id is null or booking_request.id <> p_exclude_request_id)
      and not exists (
        select 1 from public.appointments as linked
        where linked.booking_request_id = booking_request.id
      )
  ), busy as (
    select starts_at, ends_at, operator_id, operator_name from appointment_intervals
    union all
    select starts_at, ends_at, operator_id, operator_name from request_intervals
  )
  select exists (
    select 1
    from busy
    cross join target
    where busy.starts_at < target.ends_at
      and busy.ends_at > target.starts_at
      and (
        (target.operator_id is not null and busy.operator_id = target.operator_id)
        or (
          target.operator_name is not null
          and busy.operator_name = target.operator_name
          and (target.operator_id is null or busy.operator_id is null)
        )
        or (
          target.operator_id is null
          and target.operator_name is null
          and busy.operator_id is null
          and busy.operator_name is null
        )
      )
  );
$$;

revoke all on function public.phased_operator_interval_conflicts_v1(
  uuid, date, time, integer, text, text, uuid, uuid
) from public;

create or replace function public.create_public_phased_booking_request_with_assignments_v1(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_initial_operator_id text default null,
  p_initial_operator_name text default null,
  p_final_operator_id text default null,
  p_final_operator_name text default null,
  p_phase_snapshot jsonb default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_customer_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_full_name text := trim(concat_ws(' ', coalesce(p_customer_name, ''), coalesce(p_customer_surname, '')));
  v_assignments jsonb;
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased'
    or coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') !~ '^[0-9]+$'
    or nullif(trim(coalesce(p_phase_snapshot ->> 'finalServiceName', '')), '') is null
  then
    raise exception 'invalid_phase_snapshot';
  end if;

  v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
  v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
  v_final := greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1);
  v_total := v_initial + v_processing + v_final;
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  if v_initial > 480 or v_processing > 480 or v_final > 480 or v_total > 960 then
    raise exception 'invalid_phase_snapshot';
  end if;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
    p_requested_service_name, p_initial_operator_id, p_initial_operator_name
  ) or not public.is_public_booking_slot_available(
    v_workspace_id, p_appointment_date, v_final_time, v_final,
    p_requested_service_name, p_final_operator_id, p_final_operator_name
  ) then
    raise exception 'slot_unavailable';
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if exists (
    select 1 from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
      )
      and (p_appointment_date::timestamp + appointment.appointment_time) <
        (p_appointment_date::timestamp + p_appointment_time + make_interval(mins => v_total))
      and (
        p_appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > (p_appointment_date::timestamp + p_appointment_time)
  ) or exists (
    select 1 from public.booking_requests as booking_request
    where booking_request.workspace_id = v_workspace_id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and booking_request.customer_id = v_customer_id)
        or booking_request.customer_email = v_customer_email
        or coalesce(booking_request.customer_phone, '') = v_customer_phone
        or lower(trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname))) =
          lower(v_customer_full_name)
      )
      and (p_appointment_date::timestamp + booking_request.appointment_time) <
        (p_appointment_date::timestamp + p_appointment_time + make_interval(mins => v_total))
      and (
        p_appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => greatest(coalesce(booking_request.requested_duration_minutes, 60), 1))
      ) > (p_appointment_date::timestamp + p_appointment_time)
  ) then
    raise exception 'customer_time_conflict';
  end if;

  v_request := public.create_public_booking_request_ultralight_v2(
    p_salon_code, p_requested_service_name, p_requested_price, v_initial,
    p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
    p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
    p_required_role, p_initial_operator_id, p_initial_operator_name
  );

  v_assignments := jsonb_build_object(
    'version', 1,
    'initial', jsonb_build_object(
      'id', nullif(trim(coalesce(p_initial_operator_id, '')), ''),
      'name', nullif(trim(coalesce(p_initial_operator_name, '')), '')
    ),
    'final', jsonb_build_object(
      'id', nullif(trim(coalesce(p_final_operator_id, '')), ''),
      'name', nullif(trim(coalesce(p_final_operator_name, '')), '')
    )
  );

  update public.booking_requests
  set requested_duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot,
      phase_operator_assignments = v_assignments,
      requested_operator_id = nullif(trim(coalesce(p_initial_operator_id, '')), ''),
      requested_operator_name = nullif(trim(coalesce(p_initial_operator_name, '')), ''),
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot,
      phase_operator_assignments = v_assignments,
      operator_id = nullif(trim(coalesce(p_initial_operator_id, '')), ''),
      operator_name = nullif(trim(coalesce(p_initial_operator_name, '')), '')
  where booking_request_id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_request;
end;
$$;

revoke all on function public.create_public_phased_booking_request_with_assignments_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, text, text, jsonb
) from public;
grant execute on function public.create_public_phased_booking_request_with_assignments_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.create_public_phased_booking_request_v2(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_phase_snapshot jsonb default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_initial_operator public.operators%rowtype;
  v_final_operator public.operators%rowtype;
  v_candidate public.operators%rowtype;
  v_explicit boolean :=
    nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null;
  v_assignments jsonb;
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'invalid_phase_snapshot';
  end if;

  v_initial := greatest(coalesce((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 1);
  v_processing := greatest(coalesce((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 1);
  v_final := greatest(coalesce((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 1);
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  if v_explicit then
    select operator.* into v_initial_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '')
        or lower(trim(operator.name)) = lower(trim(coalesce(p_operator_name, '')))
      )
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
    order by case when operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '') then 0 else 1 end
    limit 1;
    v_final_operator := v_initial_operator;
  else
    for v_candidate in
      select operator.*
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
      order by operator.created_at, operator.name
    loop
      if public.is_public_booking_slot_available(
        v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
        p_requested_service_name, v_candidate.id::text, v_candidate.name
      ) and public.is_public_booking_slot_available(
        v_workspace_id, p_appointment_date, v_final_time, v_final,
        p_requested_service_name, v_candidate.id::text, v_candidate.name
      ) then
        v_initial_operator := v_candidate;
        v_final_operator := v_candidate;
        exit;
      end if;
    end loop;

    if v_initial_operator.id is null then
      select operator.* into v_initial_operator
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
        and public.is_public_booking_slot_available(
          v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
          p_requested_service_name, operator.id::text, operator.name
        )
      order by operator.created_at, operator.name
      limit 1;

      select operator.* into v_final_operator
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
        and public.is_public_booking_slot_available(
          v_workspace_id, p_appointment_date, v_final_time, v_final,
          p_requested_service_name, operator.id::text, operator.name
        )
      order by case when operator.id = v_initial_operator.id then 1 else 0 end,
        operator.created_at, operator.name
      limit 1;
    end if;
  end if;

  if exists (select 1 from public.operators where workspace_id = v_workspace_id)
    and (v_initial_operator.id is null or v_final_operator.id is null)
  then
    raise exception 'slot_unavailable';
  end if;

  v_request := public.create_public_phased_booking_request_with_assignments_v1(
    p_salon_code, p_requested_service_name, p_requested_price,
    p_requested_duration_minutes, p_appointment_date, p_appointment_time,
    p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
    p_customer_instagram, p_notes, p_required_role,
    coalesce(v_initial_operator.id::text, p_operator_id),
    coalesce(v_initial_operator.name, p_operator_name),
    coalesce(v_final_operator.id::text, p_operator_id),
    coalesce(v_final_operator.name, p_operator_name),
    p_phase_snapshot
  );

  if v_initial_operator.id is not null and v_final_operator.id is not null then
    v_assignments := jsonb_build_object(
      'version', 1,
      'initial', jsonb_build_object('id', v_initial_operator.id::text, 'name', v_initial_operator.name),
      'final', jsonb_build_object('id', v_final_operator.id::text, 'name', v_final_operator.name)
    );
    update public.booking_requests
    set phase_operator_assignments = v_assignments,
        requested_operator_id = v_initial_operator.id::text,
        requested_operator_name = v_initial_operator.name,
        updated_at = timezone('utc', now())
    where id = v_request.id
    returning * into v_request;
    update public.appointments
    set phase_operator_assignments = v_assignments,
        operator_id = v_initial_operator.id::text,
        operator_name = v_initial_operator.name
    where booking_request_id = v_request.id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_request;
end;
$$;

grant execute on function public.create_public_phased_booking_request_v2(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.accept_owner_phased_booking_request_direct_v1(
  p_request_id uuid,
  p_initial_operator_id text,
  p_initial_operator_name text,
  p_final_operator_id text,
  p_final_operator_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial_operator public.operators%rowtype;
  v_final_operator public.operators%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_assignments jsonb;
  v_result jsonb;
  v_appointment_id uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select booking_request.* into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_request_id
  for update;

  if v_request.id is null then raise exception 'booking_request_not_found'; end if;
  if v_request.status::text <> 'pending' then raise exception 'booking_request_already_processed'; end if;
  if coalesce(v_request.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'booking_request_not_phased';
  end if;

  v_initial := greatest(coalesce((v_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1);
  v_processing := greatest(coalesce((v_request.phase_snapshot ->> 'processingDurationMinutes')::integer, 1), 1);
  v_final := greatest(coalesce((v_request.phase_snapshot ->> 'finalDurationMinutes')::integer, 1), 1);
  v_total := v_initial + v_processing + v_final;
  v_final_time := (
    v_request.appointment_time + make_interval(mins => v_initial + v_processing)
  )::time;

  select operator.* into v_initial_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      operator.id::text = nullif(trim(coalesce(p_initial_operator_id, '')), '')
      or lower(trim(operator.name)) = lower(trim(coalesce(p_initial_operator_name, '')))
    )
  order by case
    when operator.id::text = nullif(trim(coalesce(p_initial_operator_id, '')), '') then 0 else 1
  end
  limit 1;

  select operator.* into v_final_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      operator.id::text = nullif(trim(coalesce(p_final_operator_id, '')), '')
      or lower(trim(operator.name)) = lower(trim(coalesce(p_final_operator_name, '')))
    )
  order by case
    when operator.id::text = nullif(trim(coalesce(p_final_operator_id, '')), '') then 0 else 1
  end
  limit 1;

  if v_initial_operator.id is null or v_final_operator.id is null then
    raise exception 'operator_not_found';
  end if;
  if lower(trim(coalesce(v_initial_operator.required_role, ''))) is distinct from
      lower(trim(coalesce(v_final_operator.required_role, ''))) then
    raise exception 'operator_not_eligible';
  end if;
  if v_final_operator.availability is not null then
    if jsonb_typeof(coalesce(v_final_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_final_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(v_final_operator.availability -> 'enabledWeekdays', '[]'::jsonb)
        ) as weekday_value
        where weekday_value::integer =
          extract(dow from v_request.appointment_date)::integer
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;

    if jsonb_typeof(coalesce(v_final_operator.availability -> 'dateRanges', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_final_operator.availability -> 'dateRanges', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_final_operator.availability -> 'dateRanges', '[]'::jsonb)
        ) as range_item
        where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null
          and trim(coalesce(range_item ->> 'startDate', '')) <= v_request.appointment_date::text
          and trim(coalesce(range_item ->> 'endDate', '')) >= v_request.appointment_date::text
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  if public.phased_operator_interval_conflicts_v1(
    v_workspace_id, v_request.appointment_date, v_request.appointment_time, v_initial,
    v_initial_operator.id::text, v_initial_operator.name, null, v_request.id
  ) or public.phased_operator_interval_conflicts_v1(
    v_workspace_id, v_request.appointment_date, v_final_time, v_final,
    v_final_operator.id::text, v_final_operator.name, null, v_request.id
  ) then
    raise exception 'booking_request_conflict';
  end if;

  v_assignments := jsonb_build_object(
    'version', 1,
    'initial', jsonb_build_object(
      'id', v_initial_operator.id::text,
      'name', v_initial_operator.name
    ),
    'final', jsonb_build_object(
      'id', v_final_operator.id::text,
      'name', v_final_operator.name
    )
  );

  update public.booking_requests
  set requested_duration_minutes = v_initial,
      requested_operator_id = v_initial_operator.id::text,
      requested_operator_name = v_initial_operator.name,
      phase_operator_assignments = v_assignments,
      operator_change_status = null,
      operator_change_original_id = null,
      operator_change_original_name = null,
      operator_change_proposed_id = null,
      operator_change_proposed_name = null,
      operator_change_requested_at = null,
      operator_change_expires_at = null,
      operator_change_responded_at = null,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  v_result := public.accept_owner_booking_request_with_operator_v2(
    v_request.id,
    v_initial_operator.id::text,
    v_initial_operator.name,
    null
  );

  v_appointment_id := nullif(v_result ->> 'appointmentId', '')::uuid;
  update public.booking_requests
  set requested_duration_minutes = v_total,
      phase_operator_assignments = v_assignments,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = v_request.phase_snapshot,
      phase_operator_assignments = v_assignments,
      operator_id = v_initial_operator.id::text,
      operator_name = v_initial_operator.name,
      updated_at = timezone('utc', now())
  where booking_request_id = v_request.id
    or (v_appointment_id is not null and id = v_appointment_id);

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_result || jsonb_build_object(
    'phaseOperatorAssignments', v_assignments,
    'initialOperatorId', v_initial_operator.id,
    'initialOperatorName', v_initial_operator.name,
    'finalOperatorId', v_final_operator.id,
    'finalOperatorName', v_final_operator.name
  );
end;
$$;

revoke all on function public.accept_owner_phased_booking_request_direct_v1(
  uuid, text, text, text, text
) from public;
grant execute on function public.accept_owner_phased_booking_request_direct_v1(
  uuid, text, text, text, text
) to authenticated;

create or replace function public.move_owner_appointment_direct_v1(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_assignments jsonb;
  v_overrides jsonb := '{}'::jsonb;
  v_initial_id text;
  v_initial_name text;
  v_final_id text;
  v_final_name text;
  v_initial_conflict boolean;
  v_final_conflict boolean;
  v_initial_start_occupied boolean;
  v_final_start_occupied boolean;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if p_scope not in ('whole', 'initial', 'final') then raise exception 'invalid_scope'; end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then raise exception 'appointment_not_found'; end if;
  if p_scope <> 'whole' and coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;

  v_initial := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
    else greatest(coalesce(v_appointment.duration_minutes, 60), 1) end;
  v_processing := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'processingDurationMinutes')::integer, 1), 1)
    else 0 end;
  v_final := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'finalDurationMinutes')::integer, 1), 1)
    else 0 end;

  if p_scope <> 'whole' then
    p_next_appointment_date := v_appointment.appointment_date;
    p_next_appointment_time := v_appointment.appointment_time;
  end if;
  v_final_time := (p_next_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  v_initial_id := coalesce(
    nullif(trim(p_next_initial_operator_id), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'id'), ''),
    nullif(trim(v_appointment.operator_id), '')
  );
  v_initial_name := coalesce(
    nullif(trim(p_next_initial_operator_name), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'name'), ''),
    nullif(trim(v_appointment.operator_name), '')
  );
  v_final_id := coalesce(
    nullif(trim(p_next_final_operator_id), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'id'), ''),
    v_initial_id
  );
  v_final_name := coalesce(
    nullif(trim(p_next_final_operator_name), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'name'), ''),
    v_initial_name
  );

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || p_next_appointment_date::text)
  );

  v_initial_conflict := public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, p_next_appointment_time, v_initial,
    v_initial_id, v_initial_name, v_appointment.id, v_appointment.booking_request_id
  );
  v_final_conflict := v_final > 0 and public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, v_final_time, v_final,
    v_final_id, v_final_name, v_appointment.id, v_appointment.booking_request_id
  );

  v_initial_start_occupied := public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, p_next_appointment_time, 1,
    v_initial_id, v_initial_name, v_appointment.id, v_appointment.booking_request_id
  );
  v_final_start_occupied := v_final > 0 and public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, v_final_time, 1,
    v_final_id, v_final_name, v_appointment.id, v_appointment.booking_request_id
  );

  if (p_scope <> 'final' and v_initial_start_occupied)
    or (p_scope <> 'initial' and v_final_start_occupied) then
    raise exception 'target_start_slot_occupied';
  end if;

  if (
    (p_scope <> 'final' and v_initial_conflict)
    or (p_scope <> 'initial' and v_final_conflict)
  ) and not p_allow_overlap then
    raise exception 'target_slot_occupied';
  end if;

  if coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then
    v_assignments := jsonb_build_object(
      'version', 1,
      'initial', jsonb_build_object('id', v_initial_id, 'name', v_initial_name),
      'final', jsonb_build_object('id', v_final_id, 'name', v_final_name)
    );
    v_overrides := jsonb_build_object(
      'version', 1,
      'initial', case
        when p_scope <> 'final' then v_initial_conflict and p_allow_overlap
        else coalesce((v_appointment.phase_overlap_overrides ->> 'initial')::boolean, false)
      end,
      'final', case
        when p_scope <> 'initial' then v_final_conflict and p_allow_overlap
        else coalesce((v_appointment.phase_overlap_overrides ->> 'final')::boolean, false)
      end
    );
  end if;

  update public.appointments
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      operator_id = v_initial_id,
      operator_name = v_initial_name,
      phase_operator_assignments = case
        when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_assignments
        else phase_operator_assignments
      end,
      phase_overlap_overrides = case
        when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_overrides
        else phase_overlap_overrides
      end,
      updated_at = timezone('utc', now())
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set appointment_date = p_next_appointment_date,
        appointment_time = p_next_appointment_time,
        requested_operator_id = v_initial_id,
        requested_operator_name = v_initial_name,
        phase_operator_assignments = case
          when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_assignments
          else phase_operator_assignments
        end,
        phase_overlap_overrides = case
          when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_overrides
          else phase_overlap_overrides
        end,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_appointment.workspace_id);
  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'appointment_date', p_next_appointment_date,
    'appointment_time', p_next_appointment_time,
    'phase_operator_assignments', v_assignments,
    'phase_overlap_overrides', v_overrides,
    'overlap',
      (p_scope <> 'final' and v_initial_conflict)
      or (p_scope <> 'initial' and v_final_conflict)
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) from public;
grant execute on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
