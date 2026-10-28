create or replace function public.same_public_booking_operator_identity(
  p_left_operator_id text,
  p_left_operator_name text,
  p_right_operator_id text,
  p_right_operator_name text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when nullif(trim(coalesce(p_left_operator_id, '')), '') is not null
       and nullif(trim(coalesce(p_right_operator_id, '')), '') is not null
        then trim(coalesce(p_left_operator_id, '')) = trim(coalesce(p_right_operator_id, ''))
      when nullif(lower(trim(coalesce(p_left_operator_name, ''))), '') is not null
       and nullif(lower(trim(coalesce(p_right_operator_name, ''))), '') is not null
        then lower(trim(coalesce(p_left_operator_name, ''))) =
             lower(trim(coalesce(p_right_operator_name, '')))
      else
        coalesce(nullif(trim(coalesce(p_left_operator_id, '')), ''), '') =
          coalesce(nullif(trim(coalesce(p_right_operator_id, '')), ''), '')
        and
        coalesce(nullif(lower(trim(coalesce(p_left_operator_name, ''))), ''), '') =
          coalesce(nullif(lower(trim(coalesce(p_right_operator_name, ''))), ''), '')
    end;
$$;

create or replace function public.is_public_booking_slot_available(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_requested_service_name text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_owner_payload jsonb := '{}'::jsonb;
  v_services jsonb := '[]'::jsonb;
  v_operators jsonb := '[]'::jsonb;
  v_requested_start_at timestamp;
  v_requested_end_at timestamp;
  v_requested_service_name text := trim(coalesce(p_requested_service_name, ''));
  v_requested_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_requested_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
  v_requested_role text := '';
  v_requested_machinery_ids text[] := array[]::text[];
  v_requested_uses_operator boolean := false;
  v_eligible_operator_keys text[] := array[]::text[];
  v_eligible_operator_count integer := 0;
  v_busy_operator_keys text[] := array[]::text[];
  v_busy_operator_count integer := 0;
  v_overlapping_record record;
  v_existing_role text;
  v_existing_machinery_ids text[];
  v_existing_operator_id text;
  v_existing_operator_name text;
  v_existing_operator_key text;
begin
  v_owner_payload := public.get_public_portal_owner_payload(p_workspace_id);
  v_services := coalesce(v_owner_payload -> 'servizi', '[]'::jsonb);
  v_operators := coalesce(v_owner_payload -> 'operatori', '[]'::jsonb);

  select
    coalesce(
      lower(
        regexp_replace(
          regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'),
          '[^a-z0-9 ]',
          '',
          'g'
        )
      ),
      ''
    ),
    coalesce(
      array(
        select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb)))
      ),
      array[]::text[]
    )
  into v_requested_role, v_requested_machinery_ids
  from jsonb_array_elements(v_services) as service_item
  where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) = lower(v_requested_service_name)
  limit 1;

  v_requested_uses_operator := v_requested_role <> '';

  v_requested_start_at := p_appointment_date::timestamp + p_appointment_time;
  v_requested_end_at :=
    p_appointment_date::timestamp + p_appointment_time
    + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1));

  if not public.is_public_booking_time_allowed_by_availability(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1)
  ) then
    return false;
  end if;

  if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then
    select coalesce(array_agg(operator_key), array[]::text[])
    into v_eligible_operator_keys
    from (
      select distinct
        case
          when nullif(trim(coalesce(operator_item ->> 'id', '')), '') is not null
            then 'id:' || nullif(trim(coalesce(operator_item ->> 'id', '')), '')
          else 'name:' || lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')))
        end as operator_key
      from jsonb_array_elements(v_operators) as operator_item
      where coalesce(
        lower(
          regexp_replace(
            regexp_replace(trim(coalesce(operator_item ->> 'mestiere', operator_item ->> 'required_role', '')), '\s+', ' ', 'g'),
            '[^a-z0-9 ]',
            '',
            'g'
          )
        ),
        ''
      ) = v_requested_role
        and (
          operator_item -> 'availability' is null
          or (
            (
              jsonb_typeof(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) <> 'array'
              or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)
                ) as weekday_value
                where weekday_value::integer = extract(dow from p_appointment_date)::integer
              )
            )
            and (
              jsonb_typeof(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) <> 'array'
              or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements(
                  coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)
                ) as range_item
                where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null
                  and trim(coalesce(range_item ->> 'startDate', '')) <= p_appointment_date::text
                  and trim(coalesce(range_item ->> 'endDate', '')) >= p_appointment_date::text
              )
            )
          )
        )
    ) as eligible_operators;

    v_eligible_operator_count := coalesce(array_length(v_eligible_operator_keys, 1), 0);

    if v_eligible_operator_count = 0 then
      v_requested_uses_operator := false;
      v_requested_role := '';
    end if;
  end if;

  for v_overlapping_record in
    select
      appointment.service_name as existing_service_name,
      appointment.operator_id as existing_operator_id,
      appointment.operator_name as existing_operator_name
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (p_appointment_date::timestamp + appointment.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + appointment.appointment_time)
        + make_interval(mins => coalesce(appointment.duration_minutes, 60))
      ) > v_requested_start_at
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = p_workspace_id
          and terminal_request.status in ('cancelled', 'rejected')
          and terminal_request.appointment_date = appointment.appointment_date
          and terminal_request.appointment_time = appointment.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(appointment.service_name, '')))
          and lower(
            trim(
              concat_ws(
                ' ',
                coalesce(terminal_request.customer_name, ''),
                coalesce(terminal_request.customer_surname, '')
              )
            )
          ) = lower(trim(coalesce(appointment.customer_name, '')))
          and not exists (
            select 1
            from public.booking_requests as newer_active_request
            where newer_active_request.workspace_id = terminal_request.workspace_id
              and newer_active_request.status in ('pending', 'accepted')
              and newer_active_request.appointment_date = terminal_request.appointment_date
              and newer_active_request.appointment_time = terminal_request.appointment_time
              and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                lower(trim(coalesce(terminal_request.requested_service_name, '')))
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
              and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                coalesce(terminal_request.updated_at, terminal_request.created_at)
          )
      )

    union all

    select
      booking_request.requested_service_name as existing_service_name,
      booking_request.requested_operator_id as existing_operator_id,
      booking_request.requested_operator_name as existing_operator_name
    from public.booking_requests as booking_request
    where booking_request.workspace_id = p_workspace_id
      and booking_request.appointment_date = p_appointment_date
      and booking_request.status in ('pending', 'accepted')
      and (p_appointment_date::timestamp + booking_request.appointment_time) < v_requested_end_at
      and (
        (p_appointment_date::timestamp + booking_request.appointment_time)
        + make_interval(mins => coalesce(booking_request.requested_duration_minutes, 60))
      ) > v_requested_start_at
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = p_workspace_id
          and terminal_request.status in ('cancelled', 'rejected')
          and terminal_request.appointment_date = booking_request.appointment_date
          and terminal_request.appointment_time = booking_request.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(booking_request.requested_service_name, '')))
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
              and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                coalesce(terminal_request.updated_at, terminal_request.created_at)
          )
      )
  loop
    select
      coalesce(
        lower(
          regexp_replace(
            regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'),
            '[^a-z0-9 ]',
            '',
            'g'
          )
        ),
        ''
      ),
      coalesce(
        array(
          select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb)))
        ),
        array[]::text[]
      )
    into v_existing_role, v_existing_machinery_ids
    from jsonb_array_elements(v_services) as service_item
    where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) =
      lower(trim(coalesce(v_overlapping_record.existing_service_name, '')))
    limit 1;

    v_existing_operator_id := nullif(trim(coalesce(v_overlapping_record.existing_operator_id, '')), '');
    v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), '');
    v_existing_operator_key := null;

    if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0
       and exists (
         select 1
         from unnest(v_requested_machinery_ids) as requested_machinery_id
         join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id
           on existing_machinery_id = requested_machinery_id
       ) then
      return false;
    end if;

    if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then
      if coalesce(v_existing_role, '') <> v_requested_role then
        continue;
      end if;

      if v_existing_operator_id is not null then
        v_existing_operator_key := 'id:' || v_existing_operator_id;
      elsif v_existing_operator_name is not null then
        v_existing_operator_key := 'name:' || v_existing_operator_name;
      end if;

      if v_existing_operator_key is null or not (v_existing_operator_key = any(v_eligible_operator_keys)) then
        continue;
      end if;

      if not (v_existing_operator_key = any(v_busy_operator_keys)) then
        v_busy_operator_keys := array_append(v_busy_operator_keys, v_existing_operator_key);
      end if;

      v_busy_operator_count := coalesce(array_length(v_busy_operator_keys, 1), 0);

      if v_busy_operator_count >= v_eligible_operator_count then
        return false;
      end if;

      continue;
    end if;

    if v_requested_operator_id is null and v_requested_operator_name is null then
      if not v_requested_uses_operator and coalesce(v_existing_role, '') <> '' then
        continue;
      end if;

      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          return false;
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        return false;
      end if;

      continue;
    end if;

    if v_existing_operator_id is null and v_existing_operator_name is null then
      if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then
        continue;
      end if;

      if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then
        if v_requested_role = v_existing_role then
          return false;
        end if;
        continue;
      end if;

      if (v_requested_role <> '' and coalesce(v_existing_role, '') = '')
         or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then
        continue;
      end if;

      if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then
        return false;
      end if;

      continue;
    end if;

    if v_existing_operator_id = v_requested_operator_id then
      return false;
    end if;

    if v_requested_operator_name is not null and v_existing_operator_name = v_requested_operator_name then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer, text, text, text) to anon;
grant execute on function public.is_public_booking_slot_available(uuid, date, time, integer, text, text, text) to authenticated;

notify pgrst, 'reload schema';
