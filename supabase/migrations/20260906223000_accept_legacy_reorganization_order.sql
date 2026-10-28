-- Accept legacy zero-based composition order without changing scheduling.
create or replace function public.apply_owner_linked_reorganization_v6(
  p_anchor_appointment_id uuid,
  p_items jsonb,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
  v_anchor public.appointments%rowtype;
  v_group public.appointment_groups%rowtype;
  v_item jsonb;
  v_item_count integer := 0;
  v_has_pause_edits boolean := false;
  v_has_order_edits boolean := false;
  v_order_count integer := 0;
  v_order_distinct_count integer := 0;
  v_order_min integer := 0;
  v_order_max integer := 0;
  v_item_pauses jsonb := '[]'::jsonb;
  v_customer_commitment_minutes integer := 0;
  v_terminal_pause integer := 0;
  v_customer_commitment_end timestamp;
  v_total_price numeric(10, 2) := 0;
  v_group_title text := '';
  v_request_ids jsonb := '[]'::jsonb;
  v_operator_assignments jsonb := '[]'::jsonb;
  v_split_operators boolean := false;
  v_customer_email citext;
  v_customer_phone text;
  v_pause_changed boolean := false;
  v_order_changed boolean := false;
  v_pause record;
  v_buffer_start timestamp;
  v_buffer_end timestamp;
  v_pause_customer_conflict boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_anchor_appointment_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_reorganization_plan';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 then
    raise exception 'invalid_reorganization_plan';
  end if;


  -- Legacy compositions use 0..N-1. Shift only a complete, unique sequence;
  -- preserve array order and every other field. Invalid plans stay invalid.
  if (
    select bool_and(coalesce(item ->> 'appointmentGroupOrder', '') ~ '^[0-9]{1,9}$')
    from jsonb_array_elements(p_items) as plan(item)
  ) then
    if (
      select min((item ->> 'appointmentGroupOrder')::integer) = 0
        and max((item ->> 'appointmentGroupOrder')::integer) = v_item_count - 1
        and count(distinct (item ->> 'appointmentGroupOrder')::integer) = v_item_count
      from jsonb_array_elements(p_items) as plan(item)
    ) then
      select jsonb_agg(
        jsonb_set(item, '{appointmentGroupOrder}',
          to_jsonb((item ->> 'appointmentGroupOrder')::integer + 1))
        order by position
      ) into p_items
      from jsonb_array_elements(p_items) with ordinality as plan(item, position);
    end if;
  end if;

  -- New values are strict. Clamping here would make the UI appear to have
  -- saved a different pause/order from the one the owner confirmed.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if v_item ? 'pauseAfterMinutes' then
      v_has_pause_edits := true;
      if coalesce(v_item ->> 'pauseAfterMinutes', '') !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_reorganization_pause';
      end if;
      if (v_item ->> 'pauseAfterMinutes')::integer < 0
        or (v_item ->> 'pauseAfterMinutes')::integer > 180
      then
        raise exception 'invalid_reorganization_pause';
      end if;
      if mod((v_item ->> 'pauseAfterMinutes')::integer, 5) <> 0 then
        raise exception 'invalid_reorganization_pause_step';
      end if;
    end if;

    if v_item ? 'appointmentGroupOrder' then
      v_has_order_edits := true;
      if coalesce(v_item ->> 'appointmentGroupOrder', '') !~ '^[0-9]{1,9}$' then
        raise exception 'invalid_reorganization_order';
      end if;
      if (v_item ->> 'appointmentGroupOrder')::integer < 1 then
        raise exception 'invalid_reorganization_order';
      end if;
    end if;
  end loop;

  if v_has_order_edits then
    if exists (
      select 1
      from jsonb_array_elements(p_items) as plan(item)
      where not (plan.item ? 'appointmentGroupOrder')
    ) then
      raise exception 'incomplete_reorganization_order';
    end if;

    select
      count(*)::integer,
      count(distinct (plan.item ->> 'appointmentGroupOrder')::integer)::integer,
      min((plan.item ->> 'appointmentGroupOrder')::integer)::integer,
      max((plan.item ->> 'appointmentGroupOrder')::integer)::integer
    into
      v_order_count,
      v_order_distinct_count,
      v_order_min,
      v_order_max
    from jsonb_array_elements(p_items) as plan(item);

    if v_order_count <> v_item_count
      or v_order_distinct_count <> v_item_count
      or v_order_min <> 1
      or v_order_max <> v_item_count
    then
      raise exception 'invalid_reorganization_order';
    end if;
  end if;

  -- v5 locks the group first, checks exact server membership and delegates to
  -- v4/v3/v2/v1 for duration, price, phase, timing, operator and overlap work.
  v_result := public.apply_owner_linked_reorganization_v5(
    p_anchor_appointment_id,
    p_items,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );

  select appointment.*
  into v_anchor
  from public.appointments as appointment
  where appointment.id = p_anchor_appointment_id;

  if v_anchor.id is null then
    raise exception 'group_plan_changed';
  end if;

  -- Standalone phased appointments still use v6 for their phase organizer,
  -- but component pauses have nowhere authoritative to live without a group.
  if v_anchor.appointment_group_id is null then
    if exists (
      select 1
      from jsonb_array_elements(p_items) as plan(item)
      where plan.item ? 'pauseAfterMinutes'
        and (plan.item ->> 'pauseAfterMinutes')::integer > 0
    ) then
      raise exception 'linked_reorganization_pause_requires_group';
    end if;
    if v_has_order_edits
      and (
        v_item_count <> 1
        or (p_items -> 0 ->> 'appointmentGroupOrder')::integer <> 1
      )
    then
      raise exception 'linked_reorganization_order_requires_group';
    end if;
    return v_result;
  end if;

  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_anchor.workspace_id
    and appointment_group.id = v_anchor.appointment_group_id
  for update;

  if v_group.id is null then
    raise exception 'group_plan_changed';
  end if;

  select
    coalesce(
      nullif(lower(trim(coalesce(v_group.metadata ->> 'customerEmail', ''))), ''),
      nullif(lower(trim(coalesce(request.customer_email::text, ''))), '')
    )::citext,
    coalesce(
      nullif(regexp_replace(coalesce(v_group.metadata ->> 'customerPhone', ''), '\D+', '', 'g'), ''),
      nullif(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), '')
    )
  into v_customer_email, v_customer_phone
  from public.appointments as appointment
  left join public.booking_requests as request
    on request.workspace_id = appointment.workspace_id
   and request.id = appointment.booking_request_id
  where appointment.workspace_id = v_anchor.workspace_id
    and appointment.id = v_anchor.id;

  if v_has_order_edits then
    select exists (
      select 1
      from jsonb_array_elements(p_items) as plan(item)
      join public.appointments as appointment
        on appointment.workspace_id = v_anchor.workspace_id
       and appointment.appointment_group_id = v_group.id
       and appointment.id = (plan.item ->> 'appointmentId')::uuid
      where appointment.appointment_group_order is distinct from
        (plan.item ->> 'appointmentGroupOrder')::integer
    )
    into v_order_changed;
  end if;

  if v_has_pause_edits then
    select exists (
      select 1
      from jsonb_array_elements(p_items) as plan(item)
      join public.appointments as appointment
        on appointment.workspace_id = v_anchor.workspace_id
       and appointment.appointment_group_id = v_group.id
       and appointment.id = (plan.item ->> 'appointmentId')::uuid
      where plan.item ? 'pauseAfterMinutes'
        and (plan.item ->> 'pauseAfterMinutes')::integer is distinct from
          coalesce((
            select case
              when coalesce(pause_item.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]+$'
                and (pause_item.value ->> 'pauseAfterMinutes')::integer between 0 and 180
                and mod((pause_item.value ->> 'pauseAfterMinutes')::integer, 5) = 0
              then (pause_item.value ->> 'pauseAfterMinutes')::integer
              else 0
            end
            from jsonb_array_elements(
              case
                when jsonb_typeof(v_group.metadata -> 'itemPauses') = 'array'
                  then v_group.metadata -> 'itemPauses'
                else '[]'::jsonb
              end
            ) as pause_item(value)
            where coalesce(pause_item.value ->> 'position', '') ~ '^[0-9]+$'
              and (pause_item.value ->> 'position')::integer =
                appointment.appointment_group_order
            limit 1
          ), 0)
    )
    into v_pause_changed;
  end if;

  -- Capture each old position before changing it. An omitted pause therefore
  -- follows its component during reorder instead of being attached to whichever
  -- component happens to inherit the old numeric position.
  with planned as (
    select
      appointment.*,
      plan.item,
      case
        when plan.item ? 'appointmentGroupOrder'
          then (plan.item ->> 'appointmentGroupOrder')::integer
        else appointment.appointment_group_order
      end as next_order,
      case
        when plan.item ? 'pauseAfterMinutes'
          then (plan.item ->> 'pauseAfterMinutes')::integer
        else coalesce((
          select case
            when coalesce(pause_item.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]+$'
              and (pause_item.value ->> 'pauseAfterMinutes')::integer between 0 and 180
              and mod((pause_item.value ->> 'pauseAfterMinutes')::integer, 5) = 0
            then (pause_item.value ->> 'pauseAfterMinutes')::integer
            else 0
          end
          from jsonb_array_elements(
            case
              when jsonb_typeof(v_group.metadata -> 'itemPauses') = 'array'
                then v_group.metadata -> 'itemPauses'
              else '[]'::jsonb
            end
          ) as pause_item(value)
          where coalesce(pause_item.value ->> 'position', '') ~ '^[0-9]+$'
            and (pause_item.value ->> 'position')::integer =
              appointment.appointment_group_order
          limit 1
        ), 0)
      end as pause_after_minutes,
      coalesce(
        to_jsonb(appointment.booking_request_id),
        case
          when jsonb_typeof(v_group.metadata -> 'requestIds') = 'array'
            then case
              when appointment.appointment_group_order between 1 and
                jsonb_array_length(v_group.metadata -> 'requestIds')
                then v_group.metadata -> 'requestIds'
                  -> (appointment.appointment_group_order - 1)
              else null
            end
          else null
        end
      ) as request_id_json
    from public.appointments as appointment
    join lateral (
      select plan_item.value as item
      from jsonb_array_elements(p_items) as plan_item(value)
      where (plan_item.value ->> 'appointmentId')::uuid = appointment.id
      limit 1
    ) as plan on true
    where appointment.workspace_id = v_anchor.workspace_id
      and appointment.appointment_group_id = v_group.id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', planned.next_order,
          'pauseAfterMinutes', planned.pause_after_minutes
        )
        order by planned.next_order
      ),
      '[]'::jsonb
    ),
    coalesce(sum(
      greatest(coalesce(planned.duration_minutes, 60), 1)
      + planned.pause_after_minutes
    ), 0)::integer,
    coalesce(max(planned.pause_after_minutes) filter (
      where planned.next_order = v_item_count
    ), 0)::integer,
    max(
      planned.appointment_date::timestamp
      + planned.appointment_time
      + make_interval(
        mins => greatest(coalesce(planned.duration_minutes, 60), 1)
          + planned.pause_after_minutes
      )
    ) filter (where planned.next_order = v_item_count),
    coalesce(sum(greatest(coalesce(planned.price, 0), 0)), 0)::numeric(10, 2),
    coalesce(
      string_agg(
        coalesce(nullif(trim(planned.service_name), ''), 'Servizio'),
        ' + ' order by planned.next_order
      ),
      ''
    ),
    coalesce(
      jsonb_agg(planned.request_id_json order by planned.next_order)
        filter (
          where planned.request_id_json is not null
            and planned.request_id_json <> 'null'::jsonb
        ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', planned.next_order,
          'serviceId', planned.service_id,
          'serviceName', planned.service_name,
          'date', planned.appointment_date,
          'time', to_char(planned.appointment_time, 'HH24:MI'),
          'durationMinutes', planned.duration_minutes,
          'operatorId', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{initial,id}'), ''),
            nullif(trim(coalesce(planned.operator_id, '')), '')
          ),
          'operatorName', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{initial,name}'), ''),
            nullif(trim(coalesce(planned.operator_name, '')), '')
          ),
          'initialOperatorId', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{initial,id}'), ''),
            nullif(trim(coalesce(planned.operator_id, '')), '')
          ),
          'initialOperatorName', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{initial,name}'), ''),
            nullif(trim(coalesce(planned.operator_name, '')), '')
          ),
          'finalOperatorId', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{final,id}'), ''),
            nullif(trim(planned.phase_operator_assignments #>> '{initial,id}'), ''),
            nullif(trim(coalesce(planned.operator_id, '')), '')
          ),
          'finalOperatorName', coalesce(
            nullif(trim(planned.phase_operator_assignments #>> '{final,name}'), ''),
            nullif(trim(planned.phase_operator_assignments #>> '{initial,name}'), ''),
            nullif(trim(coalesce(planned.operator_name, '')), '')
          )
        )
        order by planned.next_order
      ),
      '[]'::jsonb
    ),
    count(distinct nullif(lower(coalesce(
      nullif(trim(planned.phase_operator_assignments #>> '{initial,id}'), ''),
      nullif(trim(coalesce(planned.operator_id, '')), ''),
      nullif(trim(planned.phase_operator_assignments #>> '{initial,name}'), ''),
      nullif(trim(coalesce(planned.operator_name, '')), ''),
      ''
    )), '')) > 1
  into
    v_item_pauses,
    v_customer_commitment_minutes,
    v_terminal_pause,
    v_customer_commitment_end,
    v_total_price,
    v_group_title,
    v_request_ids,
    v_operator_assignments,
    v_split_operators
  from planned;

  if jsonb_array_length(v_item_pauses) <> v_item_count
    or v_customer_commitment_end is null
  then
    raise exception 'group_plan_changed';
  end if;

  if v_has_order_edits then
    with plan as (
      select
        (plan_item.value ->> 'appointmentId')::uuid as appointment_id,
        (plan_item.value ->> 'appointmentGroupOrder')::integer as next_order
      from jsonb_array_elements(p_items) as plan_item(value)
    )
    update public.appointments as appointment
    set appointment_group_order = plan.next_order,
        appointment_group_size = v_item_count,
        updated_at = timezone('utc', now())
    from plan
    where appointment.workspace_id = v_anchor.workspace_id
      and appointment.appointment_group_id = v_group.id
      and appointment.id = plan.appointment_id;
  else
    update public.appointments as appointment
    set appointment_group_size = v_item_count,
        updated_at = timezone('utc', now())
    where appointment.workspace_id = v_anchor.workspace_id
      and appointment.appointment_group_id = v_group.id
      and appointment.appointment_group_size is distinct from v_item_count;
  end if;

  -- Keep the accepted/pending request projection on the exact same order. The
  -- canonical snapshot refresh below then publishes one server-authoritative
  -- order instead of letting a stale request resurrect the previous layout.
  update public.booking_requests as request
  set appointment_group_order = appointment.appointment_group_order,
      appointment_group_size = v_item_count,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
  from public.appointments as appointment
  where appointment.workspace_id = v_anchor.workspace_id
    and appointment.appointment_group_id = v_group.id
    and request.workspace_id = appointment.workspace_id
    and request.id = appointment.booking_request_id
    and (
      request.appointment_group_order is distinct from appointment.appointment_group_order
      or request.appointment_group_size is distinct from v_item_count
    );

  -- A composition pause is customer time, not operator time. Validate every
  -- resulting pause interval (including the terminal one) against the other
  -- components, appointments, live requests and terminal pauses. The existing
  -- owner override remains the only way to accept a deliberate overlap.
  for v_pause in
    select
      appointment.id,
      appointment.appointment_date,
      appointment.appointment_time,
      appointment.duration_minutes,
      (pause_item.value ->> 'pauseAfterMinutes')::integer as pause_after_minutes
    from public.appointments as appointment
    join jsonb_array_elements(v_item_pauses) as pause_item(value)
      on (pause_item.value ->> 'position')::integer =
        appointment.appointment_group_order
    where appointment.workspace_id = v_anchor.workspace_id
      and appointment.appointment_group_id = v_group.id
      and (pause_item.value ->> 'pauseAfterMinutes')::integer > 0
    order by appointment.appointment_group_order
  loop
    v_buffer_start :=
      v_pause.appointment_date::timestamp
      + v_pause.appointment_time
      + make_interval(
        mins => greatest(coalesce(v_pause.duration_minutes, 60), 1)
      );
    v_buffer_end := v_buffer_start
      + make_interval(mins => v_pause.pause_after_minutes);

    perform pg_advisory_xact_lock(
      hashtext(v_anchor.workspace_id::text || ':' || v_pause.appointment_date::text)
    );

    v_pause_customer_conflict := v_pause_customer_conflict or exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_anchor.workspace_id
        and other.id <> v_pause.id
        and (
          other.appointment_group_id = v_group.id
          or (
            other.appointment_group_id is distinct from v_group.id
            and (
              (v_group.customer_id is not null and other.customer_id = v_group.customer_id)
              or lower(trim(other.customer_name)) = lower(trim(v_anchor.customer_name))
            )
          )
        )
        and (other.appointment_date::timestamp + other.appointment_time) < v_buffer_end
        and (
          other.appointment_date::timestamp
          + other.appointment_time
          + make_interval(mins => greatest(coalesce(other.duration_minutes, 60), 1))
        ) > v_buffer_start
    );

    v_pause_customer_conflict := v_pause_customer_conflict or exists (
      select 1
      from public.booking_requests as request
      where request.workspace_id = v_anchor.workspace_id
        and request.appointment_group_id is distinct from v_group.id
        and request.status::text in ('pending', 'accepted')
        and (
          (v_group.customer_id is not null and request.customer_id = v_group.customer_id)
          or lower(trim(request.customer_name)) = lower(trim(v_anchor.customer_name))
          or (
            v_customer_email is not null
            and request.customer_email = v_customer_email
          )
          or (
            v_customer_phone is not null
            and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
              v_customer_phone
          )
        )
        and (request.appointment_date::timestamp + request.appointment_time) < v_buffer_end
        and (
          request.appointment_date::timestamp
          + request.appointment_time
          + make_interval(
            mins => greatest(coalesce(request.requested_duration_minutes, 60), 1)
          )
        ) > v_buffer_start
    );

    v_pause_customer_conflict := v_pause_customer_conflict
      or public.customer_terminal_pause_conflicts_v1(
        v_anchor.workspace_id,
        v_group.customer_id,
        v_anchor.customer_name,
        v_customer_email,
        v_customer_phone,
        v_buffer_start,
        v_buffer_end,
        v_group.id
      );
  end loop;

  if v_pause_customer_conflict and not p_allow_customer_overlap then
    raise exception 'customer_time_overlap';
  end if;

  update public.appointment_groups as appointment_group
  set title = v_group_title,
      total_price = v_total_price,
      metadata = coalesce(appointment_group.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'itemCount', v_item_count,
          'itemPauses', v_item_pauses,
          'terminalPauseMinutes', v_terminal_pause,
          'customerCommitmentMinutes', v_customer_commitment_minutes,
          'customerCommitmentEndLocal', case
            when v_terminal_pause > 0
              then to_char(v_customer_commitment_end, 'YYYY-MM-DD"T"HH24:MI:SS')
            else null
          end
        )
        || case
          when coalesce(appointment_group.metadata, '{}'::jsonb) ? 'requestIds'
            then jsonb_build_object('requestIds', v_request_ids)
          else '{}'::jsonb
        end
        || case
          when coalesce(appointment_group.metadata, '{}'::jsonb) ? 'operatorAssignments'
            then jsonb_build_object(
              'operatorAssignments', v_operator_assignments,
              'splitOperators', v_split_operators
            )
          else '{}'::jsonb
        end,
      updated_at = timezone('utc', now())
  where appointment_group.workspace_id = v_anchor.workspace_id
    and appointment_group.id = v_group.id;

  -- v1 refreshed after timing/operator persistence; refresh once more after
  -- order/request metadata so app and web receive the same final transaction.
  perform public.refresh_workspace_agenda_state(v_anchor.workspace_id);

  return v_result || jsonb_build_object(
    'appointmentGroupId', v_group.id,
    'groupTitle', v_group_title,
    'totalPrice', v_total_price,
    'requestIds', v_request_ids,
    'customerOverlap', coalesce((v_result ->> 'customerOverlap')::boolean, false)
      or v_pause_customer_conflict,
    'itemPauses', v_item_pauses,
    'terminalPauseMinutes', v_terminal_pause,
    'customerCommitmentMinutes', v_customer_commitment_minutes,
    'pauseChanged', v_pause_changed,
    'orderChanged', v_order_changed,
    'appointments', (
      select coalesce(
        jsonb_agg(
          to_jsonb(appointment)
          order by appointment.appointment_group_order, appointment.id
        ),
        '[]'::jsonb
      )
      from public.appointments as appointment
      where appointment.workspace_id = v_anchor.workspace_id
        and appointment.appointment_group_id = v_group.id
    )
  );
end;
$$;
