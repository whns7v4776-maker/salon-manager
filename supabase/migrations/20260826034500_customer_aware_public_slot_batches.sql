-- Keep the public slot colours aligned with the final public write guard.
-- Existing batch RPCs remain untouched for older clients; the customer-aware
-- versions add only the customer envelope filter after the existing planner.

create or replace function public.get_public_customer_busy_envelopes_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null
)
returns table (
  busy_start_at timestamp without time zone,
  busy_end_at timestamp without time zone
)
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
  v_customer_name text :=
    nullif(lower(trim(coalesce(p_customer_name, ''))), '');
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or (v_customer_email is null and v_customer_phone is null)
  then
    return;
  end if;

  -- This is deliberately identical to the identity resolution used by
  -- public_customer_booking_envelope_available_v1 and the hard write trigger.
  select customer.id, coalesce(v_customer_name, lower(trim(customer.full_name)))
  into v_customer_id, v_customer_name
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

  return query
  select
    request.appointment_date::timestamp + request.appointment_time,
    request.appointment_date::timestamp
      + request.appointment_time
      + make_interval(
          mins => greatest(coalesce(request.requested_duration_minutes, 60), 1)
        )
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

  union all

  select
    appointment.appointment_date::timestamp + appointment.appointment_time,
    appointment.appointment_date::timestamp
      + appointment.appointment_time
      + make_interval(
          mins => greatest(coalesce(appointment.duration_minutes, 60), 1)
        )
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

  union all

  -- A terminal composition pause is customer time even though it does not
  -- occupy an operator lane or create a separate appointment row. Include the
  -- previous date as well so a pause crossing midnight cannot be advertised.
  select
    final_appointment.appointment_date::timestamp
      + final_appointment.appointment_time
      + make_interval(
          mins => greatest(coalesce(final_appointment.duration_minutes, 60), 1)
        ),
    final_appointment.appointment_date::timestamp
      + final_appointment.appointment_time
      + make_interval(
          mins => greatest(coalesce(final_appointment.duration_minutes, 60), 1)
        )
      + make_interval(
          mins => (appointment_group.metadata ->> 'terminalPauseMinutes')::integer
        )
  from public.appointment_groups as appointment_group
  join public.appointments as final_appointment
    on final_appointment.workspace_id = appointment_group.workspace_id
    and final_appointment.appointment_group_id = appointment_group.id
    and final_appointment.appointment_group_order = final_appointment.appointment_group_size
  where appointment_group.workspace_id = p_workspace_id
    and appointment_group.status = 'active'
    and final_appointment.appointment_date between p_appointment_date - 1 and p_appointment_date
    and coalesce(appointment_group.metadata ->> 'terminalPauseMinutes', '') ~ '^[0-9]+$'
    and (appointment_group.metadata ->> 'terminalPauseMinutes')::integer > 0
    and (
      (v_customer_id is not null and appointment_group.customer_id = v_customer_id)
      or (
        v_customer_name is not null
        and lower(trim(final_appointment.customer_name)) = v_customer_name
      )
      or (
        v_customer_email is not null
        and lower(trim(coalesce(appointment_group.metadata ->> 'customerEmail', ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(
          coalesce(appointment_group.metadata ->> 'customerPhone', ''),
          '\D+',
          '',
          'g'
        ) = v_customer_phone
      )
    );
end;
$$;

revoke all on function public.get_public_customer_busy_envelopes_v1(
  uuid, date, text, text, text
) from public;

create or replace function public.get_public_booking_slot_availability_batch_v3(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_customer_duration_minutes integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_slot jsonb;
  v_slot_time text;
  v_requested_range tsrange;
  v_customer_busy_ranges tsrange[] := array[]::tsrange[];
  v_timing jsonb;
  v_customer_duration integer;
  v_has_customer_identity boolean :=
    nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    or nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null;
begin
  v_result := public.get_public_booking_slot_availability_batch_v2(
    p_workspace_id,
    p_appointment_date,
    p_slot_requests,
    p_requested_service_name,
    p_required_role,
    p_requested_operator_id,
    p_requested_operator_name
  );

  if jsonb_typeof(p_slot_requests) <> 'array' then
    return v_result;
  end if;

  if not v_has_customer_identity then
    return v_result;
  end if;

  -- Use the same server timing authority as the final public writer. The
  -- client duration is only a compatibility fallback, never the primary proof.
  v_timing := public.resolve_customer_service_timing_v1(
    p_workspace_id,
    p_customer_email,
    p_customer_phone,
    p_requested_service_name
  );
  v_customer_duration := greatest(
    coalesce((v_timing ->> 'durationMinutes')::integer, p_customer_duration_minutes, 60),
    5
  );

  select coalesce(
    array_agg(tsrange(envelope.busy_start_at, envelope.busy_end_at, '[)')),
    array[]::tsrange[]
  )
  into v_customer_busy_ranges
  from public.get_public_customer_busy_envelopes_v1(
    p_workspace_id,
    p_appointment_date,
    p_customer_email,
    p_customer_phone,
    p_customer_name
  ) as envelope;

  if coalesce(array_length(v_customer_busy_ranges, 1), 0) = 0 then
    return v_result;
  end if;

  for v_slot in select value from jsonb_array_elements(coalesce(p_slot_requests, '[]'::jsonb))
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    if v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and coalesce((v_result ->> v_slot_time)::boolean, false)
    then
      v_requested_range := tsrange(
        p_appointment_date::timestamp + v_slot_time::time,
        p_appointment_date::timestamp
          + v_slot_time::time
          + make_interval(mins => v_customer_duration),
        '[)'
      );

      if exists (
        select 1
        from unnest(v_customer_busy_ranges) as busy_range
        where busy_range && v_requested_range
      ) then
        v_result := v_result || jsonb_build_object(v_slot_time, false);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_booking_slot_availability_batch_v3(
  uuid, date, jsonb, text, text, text, text, text, text, text, integer
) from public;
grant execute on function public.get_public_booking_slot_availability_batch_v3(
  uuid, date, jsonb, text, text, text, text, text, text, text, integer
) to anon, authenticated;

create or replace function public.get_public_phased_booking_slot_availability_batch_v4(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_allow_split_operators boolean default true,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_customer_duration_minutes integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_slot jsonb;
  v_slot_time text;
  v_requested_range tsrange;
  v_customer_busy_ranges tsrange[] := array[]::tsrange[];
  v_timing jsonb;
  v_customer_duration integer;
  v_has_customer_identity boolean :=
    nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    or nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null;
begin
  v_result := public.get_public_phased_booking_slot_availability_batch_v3(
    p_workspace_id,
    p_appointment_date,
    p_slot_requests,
    p_requested_service_name,
    p_required_role,
    p_requested_operator_id,
    p_requested_operator_name,
    p_allow_split_operators
  );

  if jsonb_typeof(p_slot_requests) <> 'array' then
    return v_result;
  end if;

  if not v_has_customer_identity then
    return v_result;
  end if;

  v_timing := public.resolve_customer_service_timing_v1(
    p_workspace_id,
    p_customer_email,
    p_customer_phone,
    p_requested_service_name
  );
  v_customer_duration := greatest(
    coalesce((v_timing ->> 'durationMinutes')::integer, p_customer_duration_minutes, 60),
    5
  );

  select coalesce(
    array_agg(tsrange(envelope.busy_start_at, envelope.busy_end_at, '[)')),
    array[]::tsrange[]
  )
  into v_customer_busy_ranges
  from public.get_public_customer_busy_envelopes_v1(
    p_workspace_id,
    p_appointment_date,
    p_customer_email,
    p_customer_phone,
    p_customer_name
  ) as envelope;

  if coalesce(array_length(v_customer_busy_ranges, 1), 0) = 0 then
    return v_result;
  end if;

  for v_slot in select value from jsonb_array_elements(coalesce(p_slot_requests, '[]'::jsonb))
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    if v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and coalesce((v_result ->> v_slot_time)::boolean, false)
    then
      -- The phased operator intervals intentionally omit processing/pose;
      -- customer occupancy uses the full personalized service duration.
      v_requested_range := tsrange(
        p_appointment_date::timestamp + v_slot_time::time,
        p_appointment_date::timestamp
          + v_slot_time::time
          + make_interval(mins => v_customer_duration),
        '[)'
      );

      if exists (
        select 1
        from unnest(v_customer_busy_ranges) as busy_range
        where busy_range && v_requested_range
      ) then
        v_result := v_result || jsonb_build_object(v_slot_time, false);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_phased_booking_slot_availability_batch_v4(
  uuid, date, jsonb, text, text, text, text, boolean, text, text, text, integer
) from public;
grant execute on function public.get_public_phased_booking_slot_availability_batch_v4(
  uuid, date, jsonb, text, text, text, text, boolean, text, text, text, integer
) to anon, authenticated;

notify pgrst, 'reload schema';
