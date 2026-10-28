alter table public.booking_requests
  add column if not exists operator_change_status text,
  add column if not exists operator_change_original_id text,
  add column if not exists operator_change_original_name text,
  add column if not exists operator_change_proposed_id text,
  add column if not exists operator_change_proposed_name text,
  add column if not exists operator_change_requested_at timestamptz,
  add column if not exists operator_change_expires_at timestamptz,
  add column if not exists operator_change_responded_at timestamptz;

alter table public.booking_requests
  drop constraint if exists booking_requests_operator_change_status_check;

alter table public.booking_requests
  add constraint booking_requests_operator_change_status_check
  check (
    operator_change_status is null
    or operator_change_status in ('pending', 'accepted', 'rejected', 'expired')
  );

create index if not exists booking_requests_pending_operator_change_idx
  on public.booking_requests (workspace_id, operator_change_expires_at)
  where status = 'pending'
    and operator_change_status = 'pending';

create or replace function public.propose_owner_booking_operator_change_v1(
  p_request_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_next_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_operator public.operators%rowtype;
  v_request_role text;
  v_operator_role text;
  v_previous_duration integer;
  v_next_duration integer;
  v_settings jsonb := '{}'::jsonb;
  v_slot_interval integer := 30;
  v_start_at timestamp;
  v_end_at timestamp;
  v_expires_at timestamptz;
  v_customer_name text;
  v_original_operator_id text;
  v_original_operator_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if coalesce(
    (
      select workspace.auto_accept_booking_requests
      from public.workspaces as workspace
      where workspace.id = v_workspace_id
    ),
    false
  ) then
    raise exception 'manual_acceptance_required';
  end if;

  if p_request_id is null then
    raise exception 'invalid_arguments';
  end if;

  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id
  for update;

  if v_request.status::text <> 'pending' then
    raise exception 'booking_request_already_processed';
  end if;

  if lower(trim(coalesce(v_request.origin::text, 'frontend'))) <> 'frontend' then
    raise exception 'customer_confirmation_not_required';
  end if;

  select operator.*
  into v_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '')
      or (
        nullif(trim(coalesce(p_operator_name, '')), '') is not null
        and lower(trim(operator.name)) = lower(trim(coalesce(p_operator_name, '')))
      )
    )
  order by
    case
      when operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '') then 0
      else 1
    end,
    operator.updated_at desc
  limit 1
  for share;

  if v_operator.id is null then
    raise exception 'operator_not_found';
  end if;

  v_original_operator_id := coalesce(
    nullif(trim(v_request.operator_change_original_id), ''),
    nullif(trim(v_request.requested_operator_id), '')
  );
  v_original_operator_name := coalesce(
    nullif(trim(v_request.operator_change_original_name), ''),
    nullif(trim(v_request.requested_operator_name), '')
  );

  if (
    v_original_operator_id is not null
    and v_original_operator_id = v_operator.id::text
  ) or (
    v_original_operator_id is null
    and v_original_operator_name is not null
    and lower(v_original_operator_name) = lower(trim(v_operator.name))
  ) then
    raise exception 'operator_change_not_required';
  end if;

  v_request_role := lower(
    regexp_replace(trim(coalesce(v_request.required_role, '')), '\s+', ' ', 'g')
  );
  if v_request_role = '' then
    select lower(regexp_replace(trim(coalesce(service.required_role, '')), '\s+', ' ', 'g'))
    into v_request_role
    from public.services as service
    where service.workspace_id = v_workspace_id
      and lower(trim(service.name)) = lower(trim(v_request.requested_service_name))
    order by service.updated_at desc, service.created_at desc
    limit 1;
  end if;

  v_operator_role := lower(
    regexp_replace(trim(coalesce(v_operator.required_role, '')), '\s+', ' ', 'g')
  );

  if coalesce(v_request_role, '') = ''
    or coalesce(v_operator_role, '') = ''
    or v_request_role <> v_operator_role then
    raise exception 'operator_not_eligible';
  end if;

  if v_operator.availability is not null then
    if jsonb_typeof(coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb)
        ) as weekday_value
        where weekday_value::integer =
          extract(dow from v_request.appointment_date)::integer
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;

    if jsonb_typeof(coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb)
        ) as range_item
        where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null
          and trim(coalesce(range_item ->> 'startDate', '')) <= v_request.appointment_date::text
          and trim(coalesce(range_item ->> 'endDate', '')) >= v_request.appointment_date::text
      ) then
      raise exception 'operator_unavailable_on_date';
    end if;
  end if;

  v_previous_duration := greatest(coalesce(v_request.requested_duration_minutes, 60), 1);
  v_next_duration := coalesce(p_next_duration_minutes, v_previous_duration);

  if v_next_duration < 5 or v_next_duration > v_previous_duration then
    raise exception 'duration_can_only_be_shortened';
  end if;

  if v_next_duration < v_previous_duration then
    v_settings := public.resolve_public_portal_availability_settings(v_workspace_id);

    select nullif(date_interval ->> 'slotIntervalMinutes', '')::integer
    into v_slot_interval
    from jsonb_array_elements(
      coalesce(v_settings -> 'dateSlotIntervals', '[]'::jsonb)
    ) as date_interval
    where date_interval ->> 'date' = v_request.appointment_date::text
    limit 1;

    v_slot_interval := coalesce(
      v_slot_interval,
      nullif(v_settings ->> 'slotIntervalMinutes', '')::integer,
      30
    );

    if v_slot_interval < 5 or v_slot_interval > 300 or v_slot_interval % 5 <> 0 then
      v_slot_interval := 30;
    end if;

    if (v_previous_duration - v_next_duration) % v_slot_interval <> 0 then
      raise exception 'invalid_duration_step';
    end if;
  end if;

  v_start_at := v_request.appointment_date::timestamp + v_request.appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_next_duration);
  if v_end_at <= (now() at time zone 'Europe/Rome') then
    raise exception 'duration_end_in_past';
  end if;

  v_expires_at := least(
    timezone('Europe/Rome', v_start_at - interval '2 hours'),
    timezone('utc', now()) + interval '12 hours'
  );
  if v_expires_at <= timezone('utc', now()) then
    raise exception 'operator_change_too_late';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id is distinct from v_request.id
      and appointment.appointment_date = v_request.appointment_date
      and (v_request.appointment_date::timestamp + appointment.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_start_at
      and (
        (
          nullif(trim(coalesce(appointment.operator_id, '')), '') is null
          and nullif(trim(coalesce(appointment.operator_name, '')), '') is null
        )
        or nullif(trim(coalesce(appointment.operator_id, '')), '') = v_operator.id::text
        or lower(trim(coalesce(appointment.operator_name, ''))) = lower(trim(v_operator.name))
      )
  ) then
    raise exception 'booking_request_conflict';
  end if;

  if exists (
    select 1
    from public.booking_requests as other_request
    where other_request.workspace_id = v_workspace_id
      and other_request.id <> v_request.id
      and other_request.status::text in ('pending', 'accepted')
      and other_request.appointment_date = v_request.appointment_date
      and (v_request.appointment_date::timestamp + other_request.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + other_request.appointment_time
        + make_interval(
            mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1)
          )
      ) > v_start_at
      and (
        (
          nullif(trim(coalesce(other_request.requested_operator_id, '')), '') is null
          and nullif(trim(coalesce(other_request.requested_operator_name, '')), '') is null
        )
        or nullif(trim(coalesce(other_request.requested_operator_id, '')), '') =
          v_operator.id::text
        or lower(trim(coalesce(other_request.requested_operator_name, ''))) =
          lower(trim(v_operator.name))
      )
  ) then
    raise exception 'booking_request_conflict';
  end if;

  update public.booking_requests
  set requested_operator_id = v_operator.id::text,
      requested_operator_name = trim(v_operator.name),
      requested_duration_minutes = v_next_duration,
      operator_change_status = 'pending',
      operator_change_original_id = v_original_operator_id,
      operator_change_original_name = v_original_operator_name,
      operator_change_proposed_id = v_operator.id::text,
      operator_change_proposed_name = trim(v_operator.name),
      operator_change_requested_at = timezone('utc', now()),
      operator_change_expires_at = v_expires_at,
      operator_change_responded_at = null,
      viewed_by_customer = false,
      viewed_by_salon = true,
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  v_customer_name := trim(
    concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, ''))
  );

  perform public.queue_public_customer_push(
    v_workspace_id,
    'custom'::public.push_event_type,
    'Conferma cambio operatore',
    concat(
      'Per ', trim(v_request.requested_service_name), ' del ',
      to_char(v_request.appointment_date, 'DD/MM'), ' alle ',
      to_char(v_request.appointment_time, 'HH24:MI'), ' il salone propone ',
      trim(v_operator.name),
      case
        when v_original_operator_name is not null
          then ' al posto di ' || v_original_operator_name
        else ''
      end,
      '. Apri SalonPro per accettare o rifiutare.'
    ),
    jsonb_build_object(
      'type', 'booking_operator_change_confirmation',
      'eventType', 'booking_operator_change_confirmation',
      '_pushEventType', 'booking_operator_change_confirmation',
      '_pushAudience', 'public',
      '_pushTarget', 'client',
      '_dedupeKey', concat_ws(
        '|',
        v_workspace_id::text,
        'operator_change',
        v_request.id::text,
        extract(epoch from timezone('utc', now()))::bigint::text
      ),
      'bookingRequestId', v_request.id,
      'appointmentDate', v_request.appointment_date,
      'appointmentTime', v_request.appointment_time,
      'customerName', v_customer_name,
      'serviceName', v_request.requested_service_name,
      'originalOperatorName', coalesce(v_original_operator_name, ''),
      'proposedOperatorName', trim(v_operator.name)
    ),
    v_request.customer_email,
    v_request.customer_phone
  );

  return jsonb_build_object(
    'requestId', v_request.id,
    'workspaceId', v_workspace_id,
    'requiresCustomerConfirmation', true,
    'operatorChangeStatus', 'pending',
    'originalOperatorId', v_original_operator_id,
    'originalOperatorName', v_original_operator_name,
    'proposedOperatorId', v_operator.id,
    'proposedOperatorName', trim(v_operator.name),
    'previousDurationMinutes', v_previous_duration,
    'nextDurationMinutes', v_next_duration,
    'requestedAt', timezone('utc', now()),
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.propose_owner_booking_operator_change_v1(
  uuid,
  text,
  text,
  integer
) from public;
grant execute on function public.propose_owner_booking_operator_change_v1(
  uuid,
  text,
  text,
  integer
) to authenticated;

create or replace function public.get_public_booking_operator_changes_v1(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text
)
returns table (
  request_id uuid,
  operator_change_status text,
  service_name text,
  appointment_date date,
  appointment_time time,
  duration_minutes integer,
  original_operator_id text,
  original_operator_name text,
  proposed_operator_id text,
  proposed_operator_name text,
  requested_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
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
    and nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '') is not null
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10)
    and request.operator_change_status is not null
    and (
      request.operator_change_status = 'pending'
      or request.operator_change_responded_at >= timezone('utc', now()) - interval '30 days'
    )
  order by request.operator_change_requested_at desc nulls last;
$$;

revoke all on function public.get_public_booking_operator_changes_v1(text, text, text)
  from public;
grant execute on function public.get_public_booking_operator_changes_v1(text, text, text)
  to anon, authenticated;

create or replace function public.respond_public_booking_operator_change_v1(
  p_salon_code text,
  p_request_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_operator public.operators%rowtype;
  v_response text := lower(trim(coalesce(p_response, '')));
  v_start_at timestamp;
  v_end_at timestamp;
  v_customer_name text;
  v_core_response jsonb;
begin
  if p_request_id is null or v_response not in ('accepted', 'rejected') then
    raise exception 'invalid_arguments';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(workspace.slug)) = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_request_id::text));

  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '') is not null
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10)
  for update;

  if v_request.id is null then
    raise exception 'operator_change_not_found';
  end if;

  if v_request.operator_change_status = v_response then
    return jsonb_build_object(
      'requestId', v_request.id,
      'operatorChangeStatus', v_request.operator_change_status,
      'requestStatus', v_request.status::text,
      'changed', false
    );
  end if;

  if v_request.status::text <> 'pending'
    or v_request.operator_change_status <> 'pending' then
    raise exception 'operator_change_already_processed';
  end if;

  if v_request.operator_change_expires_at is null
    or v_request.operator_change_expires_at <= timezone('utc', now()) then
    update public.booking_requests
    set status = 'cancelled'::public.request_status,
        cancellation_source = null,
        operator_change_status = 'expired',
        operator_change_responded_at = timezone('utc', now()),
        viewed_by_customer = true,
        viewed_by_salon = false,
        updated_at = timezone('utc', now())
    where id = v_request.id;
    perform public.refresh_workspace_agenda_state(v_workspace_id);
    raise exception 'operator_change_expired';
  end if;

  v_customer_name := trim(
    concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, ''))
  );

  perform set_config('salonpro.skip_booking_request_push', 'on', true);

  if v_response = 'accepted' then
    select operator.*
    into v_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        operator.id::text = nullif(trim(v_request.operator_change_proposed_id), '')
        or (
          nullif(trim(v_request.operator_change_proposed_name), '') is not null
          and lower(trim(operator.name)) =
            lower(trim(v_request.operator_change_proposed_name))
        )
      )
    order by
      case
        when operator.id::text = nullif(trim(v_request.operator_change_proposed_id), '') then 0
        else 1
      end,
      operator.updated_at desc
    limit 1
    for share;

    if v_operator.id is null then
      raise exception 'operator_not_found';
    end if;

    v_start_at := v_request.appointment_date::timestamp + v_request.appointment_time;
    v_end_at := v_start_at + make_interval(
      mins => greatest(coalesce(v_request.requested_duration_minutes, 60), 1)
    );

    if exists (
      select 1
      from public.appointments as appointment
      where appointment.workspace_id = v_workspace_id
        and appointment.booking_request_id is distinct from v_request.id
        and appointment.appointment_date = v_request.appointment_date
        and (v_request.appointment_date::timestamp + appointment.appointment_time) < v_end_at
        and (
          v_request.appointment_date::timestamp
          + appointment.appointment_time
          + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
        ) > v_start_at
        and (
          (
            nullif(trim(coalesce(appointment.operator_id, '')), '') is null
            and nullif(trim(coalesce(appointment.operator_name, '')), '') is null
          )
          or nullif(trim(coalesce(appointment.operator_id, '')), '') = v_operator.id::text
          or lower(trim(coalesce(appointment.operator_name, ''))) = lower(trim(v_operator.name))
        )
    ) or exists (
      select 1
      from public.booking_requests as other_request
      where other_request.workspace_id = v_workspace_id
        and other_request.id <> v_request.id
        and other_request.status::text in ('pending', 'accepted')
        and other_request.appointment_date = v_request.appointment_date
        and (v_request.appointment_date::timestamp + other_request.appointment_time) < v_end_at
        and (
          v_request.appointment_date::timestamp
          + other_request.appointment_time
          + make_interval(
              mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1)
            )
        ) > v_start_at
        and (
          (
            nullif(trim(coalesce(other_request.requested_operator_id, '')), '') is null
            and nullif(trim(coalesce(other_request.requested_operator_name, '')), '') is null
          )
          or nullif(trim(coalesce(other_request.requested_operator_id, '')), '') =
            v_operator.id::text
          or lower(trim(coalesce(other_request.requested_operator_name, ''))) =
            lower(trim(v_operator.name))
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    update public.booking_requests
    set requested_operator_id = v_operator.id::text,
        requested_operator_name = trim(v_operator.name),
        operator_change_status = 'accepted',
        operator_change_responded_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = v_request.id;

    v_core_response := public.update_owner_booking_request_status_core(
      v_workspace_id,
      v_request.id,
      'accepted'::public.request_status
    );

    update public.booking_requests
    set operator_change_status = 'accepted',
        operator_change_responded_at = timezone('utc', now()),
        viewed_by_customer = true,
        viewed_by_salon = false,
        updated_at = timezone('utc', now())
    where id = v_request.id;
  else
    update public.booking_requests
    set status = 'cancelled'::public.request_status,
        cancellation_source = null,
        operator_change_status = 'rejected',
        operator_change_responded_at = timezone('utc', now()),
        viewed_by_customer = true,
        viewed_by_salon = false,
        updated_at = timezone('utc', now())
    where id = v_request.id;

    delete from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id = v_request.id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  perform public.queue_public_owner_push(
    v_workspace_id,
    'custom'::public.push_event_type,
    case
      when v_response = 'accepted' then 'Cambio operatore accettato'
      else 'Cambio operatore rifiutato'
    end,
    concat(
      v_customer_name,
      case
        when v_response = 'accepted' then ' ha accettato '
        else ' ha rifiutato '
      end,
      'il cambio operatore per ', trim(v_request.requested_service_name),
      ' del ', to_char(v_request.appointment_date, 'DD/MM'),
      ' alle ', to_char(v_request.appointment_time, 'HH24:MI'), '.'
    ),
    jsonb_build_object(
      'type', 'booking_operator_change_response',
      'eventType', 'booking_operator_change_response',
      '_pushEventType', 'booking_operator_change_response',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_dedupeKey', concat_ws(
        '|',
        v_workspace_id::text,
        'operator_change_response',
        v_request.id::text,
        v_response
      ),
      'bookingRequestId', v_request.id,
      'response', v_response,
      'appointmentDate', v_request.appointment_date,
      'appointmentTime', v_request.appointment_time,
      'customerName', v_customer_name,
      'serviceName', v_request.requested_service_name,
      'operatorName', v_request.operator_change_proposed_name
    )
  );

  if v_response = 'rejected' then
    begin
      perform public.process_public_slot_waitlist(
        v_workspace_id,
        v_request.appointment_date,
        v_request.appointment_time
      );
    exception
      when others then
        null;
    end;
  end if;

  return jsonb_build_object(
    'requestId', v_request.id,
    'operatorChangeStatus', v_response,
    'requestStatus', case when v_response = 'accepted' then 'accepted' else 'cancelled' end,
    'appointmentId', v_core_response ->> 'appointmentId',
    'operatorId', v_request.operator_change_proposed_id,
    'operatorName', v_request.operator_change_proposed_name,
    'changed', true
  );
end;
$$;

revoke all on function public.respond_public_booking_operator_change_v1(
  text,
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.respond_public_booking_operator_change_v1(
  text,
  uuid,
  text,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
