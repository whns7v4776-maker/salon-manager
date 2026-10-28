-- Salon-only reusable linked-service templates and phased services that may end
-- after processing time without requiring a final appointment segment.

alter table public.services
  add column if not exists linked_service_config jsonb not null default '{}'::jsonb;

alter table public.services
  drop constraint if exists services_linked_service_config_object_check;

alter table public.services
  add constraint services_linked_service_config_object_check
  check (jsonb_typeof(linked_service_config) = 'object');

comment on column public.services.linked_service_config is
  'Salon-only reusable composition rules. requiredServiceIds are inserted automatically; suggestedServiceIds are optional.';

create or replace function public.create_owner_phased_appointment_v1(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_required_role text default null,
  p_phase_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_has_final boolean := coalesce((p_phase_snapshot ->> 'finalPhaseEnabled')::boolean, true);
  v_result jsonb;
  v_appointment_id uuid;
  v_booking_request_id uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased'
    or coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') !~ '^[0-9]+$'
    or (
      v_has_final and (
        coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') !~ '^[0-9]+$'
        or nullif(trim(coalesce(p_phase_snapshot ->> 'finalServiceName', '')), '') is null
      )
    )
  then
    raise exception 'invalid_phase_snapshot';
  end if;

  v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
  v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
  v_final := case
    when v_has_final then greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1)
    else 0
  end;
  v_total := v_initial + v_processing + v_final;
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  join public.workspace_members as member on member.workspace_id = workspace.id
  where member.user_id = auth.uid()
    and (
      nullif(lower(trim(coalesce(p_salon_code, ''))), '') is null
      or workspace.slug = lower(trim(p_salon_code))
    )
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
    p_service_name, p_operator_id, p_operator_name
  ) or (
    v_has_final and not public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, v_final_time, v_final,
      p_service_name, p_operator_id, p_operator_name
    )
  ) then
    raise exception 'target_slot_occupied';
  end if;

  v_result := public.create_owner_appointment_ultralight_v2(
    p_customer_name, p_customer_phone, p_customer_email, p_customer_instagram,
    p_customer_note, p_customer_source, p_create_customer_record,
    p_create_booking_request, p_service_name, p_price, v_initial,
    p_appointment_date, p_appointment_time, p_salon_code, p_operator_id,
    p_operator_name, p_required_role
  );

  v_appointment_id := nullif(v_result ->> 'appointmentId', '')::uuid;
  v_booking_request_id := nullif(v_result ->> 'bookingRequestId', '')::uuid;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot
  where id = v_appointment_id;

  if v_booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = v_total,
        phase_snapshot = p_phase_snapshot,
        updated_at = timezone('utc', now())
    where id = v_booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_result || jsonb_build_object(
    'durationMinutes', v_total,
    'phaseSnapshot', p_phase_snapshot
  );
end;
$$;

grant execute on function public.create_owner_phased_appointment_v1(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text, jsonb
) to authenticated;

-- Preserve the proven final-phase implementations and route legacy calls
-- through small compatibility wrappers.
alter function public.create_public_phased_booking_request_with_assignments_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, text, text, jsonb
) rename to create_public_phased_booking_request_with_assignments_v1_with_final;

create function public.create_public_phased_booking_request_with_assignments_v1(
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
  v_total integer;
  v_customer_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_full_name text := trim(concat_ws(' ', coalesce(p_customer_name, ''), coalesce(p_customer_surname, '')));
  v_assignments jsonb;
  v_has_final boolean := coalesce((p_phase_snapshot ->> 'finalPhaseEnabled')::boolean, true);
begin
  if v_has_final then
    return public.create_public_phased_booking_request_with_assignments_v1_with_final(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, p_initial_operator_id,
      p_initial_operator_name, p_final_operator_id, p_final_operator_name,
      p_phase_snapshot
    );
  end if;

  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased'
    or coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') !~ '^[0-9]+$'
  then
    raise exception 'invalid_phase_snapshot';
  end if;
  v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
  v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
  v_total := v_initial + v_processing;
  if v_initial > 480 or v_processing > 480 or v_total > 960 then
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

grant execute on function public.create_public_phased_booking_request_with_assignments_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, text, text, jsonb
) to anon, authenticated;

alter function public.create_public_phased_booking_request_v4(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) rename to create_public_phased_booking_request_v4_with_final;

create function public.create_public_phased_booking_request_v4(
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
  v_initial integer;
  v_initial_operator public.operators%rowtype;
  v_candidate public.operators%rowtype;
  v_has_role_operators boolean;
  v_explicit boolean :=
    nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null;
  v_has_final boolean := coalesce((p_phase_snapshot ->> 'finalPhaseEnabled')::boolean, true);
begin
  if v_has_final then
    return public.create_public_phased_booking_request_v4_with_final(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, p_operator_id,
      p_operator_name, p_phase_snapshot
    );
  end if;

  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'invalid_phase_snapshot';
  end if;
  v_initial := greatest(coalesce((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 1);

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  if v_explicit then
    if not public.public_operator_can_book_service_v1(
      v_workspace_id, p_operator_id, p_operator_name,
      p_requested_service_name, p_required_role
    ) then
      raise exception 'operator_service_not_enabled';
    end if;

    select operator.* into v_initial_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        (
          trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and operator.id = case
            when trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then trim(p_operator_id)::uuid
            else null
          end
        )
        or lower(trim(operator.name)) = lower(trim(coalesce(p_operator_name, '')))
      )
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
    order by case when operator.id::text = trim(coalesce(p_operator_id, '')) then 0 else 1 end
    limit 1;
    if v_initial_operator.id is null then raise exception 'operator_service_not_enabled'; end if;
    if not public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
      p_requested_service_name, v_initial_operator.id::text, v_initial_operator.name
    ) then
      raise exception 'slot_unavailable';
    end if;
  else
    select exists (
      select 1 from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
    ) into v_has_role_operators;

    if v_has_role_operators then
      for v_candidate in
        select operator.* from public.operators as operator
        where operator.workspace_id = v_workspace_id
          and (
            nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
            or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
          )
          and public.public_operator_can_book_service_v1(
            v_workspace_id, operator.id::text, operator.name,
            p_requested_service_name, p_required_role
          )
        order by operator.created_at, operator.name
      loop
        if public.is_public_booking_slot_available(
          v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
          p_requested_service_name, v_candidate.id::text, v_candidate.name
        ) then
          v_initial_operator := v_candidate;
          exit;
        end if;
      end loop;
      if v_initial_operator.id is null then raise exception 'slot_unavailable'; end if;
    end if;
  end if;

  return public.create_public_phased_booking_request_with_assignments_v1(
    p_salon_code, p_requested_service_name, p_requested_price,
    p_requested_duration_minutes, p_appointment_date, p_appointment_time,
    p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
    p_customer_instagram, p_notes, p_required_role,
    v_initial_operator.id::text, v_initial_operator.name,
    null, null, p_phase_snapshot
  );
end;
$$;

grant execute on function public.create_public_phased_booking_request_v4(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
