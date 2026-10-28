-- Public compositions may optionally use a different qualified operator for
-- each consecutive item. The customer timeline never changes: the next item
-- starts exactly when the previous one ends. Salon approval remains mandatory.

alter table public.service_compositions
  add column if not exists allow_split_operators boolean not null default false;

comment on column public.service_compositions.allow_split_operators is
  'When true, public booking first tries one operator for every item, then falls back to one qualified operator per consecutive item. Salon approval remains mandatory.';

create or replace function public.get_public_service_compositions_v1(
  p_salon_code text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_workspace as (
    select workspace.id
    from public.workspaces as workspace
    where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
      and workspace.subscription_status in ('demo', 'active')
    limit 1
  ), valid_compositions as (
    select
      composition.id,
      composition.name,
      composition.workspace_id,
      composition.allow_split_operators,
      count(*) as item_count,
      count(distinct lower(trim(coalesce(service.required_role, '')))) as role_count,
      bool_and(
        service.superseded_by_composition_id is null
        and service.is_online is not false
        and not (
          service.phase_config is not null
          and coalesce(service.phase_config ->> 'mode', '') = 'phased'
        )
      ) as all_items_valid
    from public.service_compositions as composition
    join selected_workspace on selected_workspace.id = composition.workspace_id
    join public.service_composition_items as item
      on item.composition_id = composition.id
      and item.workspace_id = composition.workspace_id
      and item.link_type = 'required'
    join public.services as service
      on service.id = item.service_id
      and service.workspace_id = composition.workspace_id
    where composition.visibility = 'public'
      and composition.is_active is true
    group by
      composition.id,
      composition.name,
      composition.workspace_id,
      composition.allow_split_operators
    having count(*) >= 2
      and count(distinct lower(trim(coalesce(service.required_role, '')))) = 1
      and bool_and(
        service.superseded_by_composition_id is null
        and service.is_online is not false
        and not (
          service.phase_config is not null
          and coalesce(service.phase_config ->> 'mode', '') = 'phased'
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', 'composition:' || composition.id::text,
        'name', composition.name,
        'description', 'Composizione di servizi',
        'price', composition.total_price,
        'duration_minutes', composition.total_duration,
        'required_role', composition.required_role,
        'is_online', true,
        'composition_id', composition.id,
        'composition_allow_split_operators', composition.allow_split_operators,
        'composition_items', composition.items
      )
      order by composition.name
    ),
    '[]'::jsonb
  )
  from (
    select
      valid.id,
      valid.name,
      valid.allow_split_operators,
      coalesce(sum(coalesce(item.price_override, service.price)), 0)::numeric(10, 2) as total_price,
      coalesce(sum(coalesce(item.duration_override_minutes, service.duration_minutes, 60)), 0)::integer
        as total_duration,
      max(service.required_role) as required_role,
      jsonb_agg(
        jsonb_build_object(
          'serviceId', service.id,
          'serviceName', service.name,
          'price', coalesce(item.price_override, service.price),
          'priceOverride', item.price_override,
          'durationMinutes', coalesce(item.duration_override_minutes, service.duration_minutes, 60),
          'durationOverrideMinutes', item.duration_override_minutes,
          'requiredRole', service.required_role,
          'position', item.position
        )
        order by item.position
      ) as items
    from valid_compositions as valid
    join public.service_composition_items as item
      on item.composition_id = valid.id
      and item.workspace_id = valid.workspace_id
      and item.link_type = 'required'
    join public.services as service
      on service.id = item.service_id
      and service.workspace_id = valid.workspace_id
    group by valid.id, valid.name, valid.allow_split_operators
  ) as composition;
$$;

revoke all on function public.get_public_service_compositions_v1(text) from public;
grant execute on function public.get_public_service_compositions_v1(text) to anon, authenticated;

create or replace function public.resolve_public_composition_operator_plan_v1(
  p_workspace_id uuid,
  p_composition_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allow_split boolean := false;
  v_item_count integer := 0;
  v_role_count integer := 0;
  v_role text;
  v_items_valid boolean := false;
  v_has_role_operators boolean := false;
  v_explicit boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
  v_operator public.operators%rowtype;
  v_item_operator public.operators%rowtype;
  v_item record;
  v_timing jsonb;
  v_duration integer;
  v_cursor timestamp;
  v_available boolean;
  v_assignments jsonb := '[]'::jsonb;
  v_first_operator_id text := null;
  v_split_used boolean := false;
begin
  if p_workspace_id is null or p_composition_id is null
    or p_appointment_date is null or p_appointment_time is null
  then
    return jsonb_build_object('available', false, 'assignments', '[]'::jsonb);
  end if;

  select
    composition.allow_split_operators,
    count(*),
    count(distinct lower(trim(coalesce(service.required_role, '')))),
    max(service.required_role),
    bool_and(
      service.workspace_id = composition.workspace_id
      and service.superseded_by_composition_id is null
      and service.is_online is not false
      and not (
        service.phase_config is not null
        and coalesce(service.phase_config ->> 'mode', '') = 'phased'
      )
    )
  into
    v_allow_split,
    v_item_count,
    v_role_count,
    v_role,
    v_items_valid
  from public.service_compositions as composition
  join public.service_composition_items as item
    on item.composition_id = composition.id
    and item.workspace_id = composition.workspace_id
    and item.link_type = 'required'
  join public.services as service on service.id = item.service_id
  where composition.id = p_composition_id
    and composition.workspace_id = p_workspace_id
    and composition.visibility = 'public'
    and composition.is_active is true
  group by composition.id, composition.allow_split_operators;

  if coalesce(v_item_count, 0) < 2
    or coalesce(v_role_count, 0) <> 1
    or coalesce(v_items_valid, false) is false
  then
    return jsonb_build_object('available', false, 'assignments', '[]'::jsonb);
  end if;

  select exists (
    select 1
    from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        nullif(lower(trim(coalesce(v_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(v_role))
      )
  ) into v_has_role_operators;

  -- First preference: one qualified operator for the entire composition.
  for v_operator in
    select operator.*
    from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        not v_explicit
        or operator.id::text = trim(coalesce(p_requested_operator_id, ''))
        or lower(trim(operator.name)) = lower(trim(coalesce(p_requested_operator_name, '')))
      )
      and not exists (
        select 1
        from public.service_composition_items as item
        join public.services as service on service.id = item.service_id
        where item.composition_id = p_composition_id
          and item.workspace_id = p_workspace_id
          and item.link_type = 'required'
          and not public.public_operator_can_book_service_v1(
            p_workspace_id,
            operator.id::text,
            operator.name,
            service.name,
            service.required_role
          )
      )
    order by
      case
        when operator.id::text = trim(coalesce(p_requested_operator_id, '')) then 0
        when lower(trim(operator.name)) = lower(trim(coalesce(p_requested_operator_name, ''))) then 1
        else 2
      end,
      operator.created_at,
      operator.name
  loop
    v_cursor := p_appointment_date::timestamp + p_appointment_time;
    v_available := true;
    v_assignments := '[]'::jsonb;

    for v_item in
      select service.*, item.position, item.duration_override_minutes
      from public.service_composition_items as item
      join public.services as service on service.id = item.service_id
      where item.composition_id = p_composition_id
        and item.workspace_id = p_workspace_id
        and item.link_type = 'required'
      order by item.position
    loop
      v_timing := public.resolve_customer_service_timing_v1(
        p_workspace_id, p_customer_email, p_customer_phone, v_item.name
      );
      v_duration := greatest(
        case
          when coalesce((v_timing ->> 'customized')::boolean, false)
            then coalesce((v_timing ->> 'durationMinutes')::integer, v_item.duration_minutes, 60)
          else coalesce(v_item.duration_override_minutes, v_item.duration_minutes, 60)
        end,
        5
      );

      if not public.is_public_booking_slot_available(
        p_workspace_id,
        v_cursor::date,
        v_cursor::time,
        v_duration,
        v_item.name,
        v_operator.id::text,
        v_operator.name
      ) then
        v_available := false;
        exit;
      end if;

      v_assignments := v_assignments || jsonb_build_array(jsonb_build_object(
        'position', v_item.position,
        'serviceId', v_item.id,
        'serviceName', v_item.name,
        'date', v_cursor::date,
        'time', to_char(v_cursor, 'HH24:MI'),
        'durationMinutes', v_duration,
        'operatorId', v_operator.id::text,
        'operatorName', v_operator.name
      ));
      v_cursor := v_cursor + make_interval(mins => v_duration);
    end loop;

    if v_available then
      return jsonb_build_object(
        'available', true,
        'splitOperators', false,
        'assignments', v_assignments
      );
    end if;
  end loop;

  -- An explicitly selected professional must cover every phase.
  if v_explicit or coalesce(v_allow_split, false) is false then
    return jsonb_build_object('available', false, 'assignments', '[]'::jsonb);
  end if;

  v_cursor := p_appointment_date::timestamp + p_appointment_time;
  v_assignments := '[]'::jsonb;

  -- Preserve the existing salon-capacity fallback when the trade has no
  -- configured operators at all.
  if not v_has_role_operators then
    for v_item in
      select service.*, item.position, item.duration_override_minutes
      from public.service_composition_items as item
      join public.services as service on service.id = item.service_id
      where item.composition_id = p_composition_id
        and item.workspace_id = p_workspace_id
        and item.link_type = 'required'
      order by item.position
    loop
      v_timing := public.resolve_customer_service_timing_v1(
        p_workspace_id, p_customer_email, p_customer_phone, v_item.name
      );
      v_duration := greatest(
        case
          when coalesce((v_timing ->> 'customized')::boolean, false)
            then coalesce((v_timing ->> 'durationMinutes')::integer, v_item.duration_minutes, 60)
          else coalesce(v_item.duration_override_minutes, v_item.duration_minutes, 60)
        end,
        5
      );

      if not public.is_public_booking_slot_available(
        p_workspace_id,
        v_cursor::date,
        v_cursor::time,
        v_duration,
        v_item.name,
        null,
        null
      ) then
        return jsonb_build_object('available', false, 'assignments', '[]'::jsonb);
      end if;

      v_assignments := v_assignments || jsonb_build_array(jsonb_build_object(
        'position', v_item.position,
        'serviceId', v_item.id,
        'serviceName', v_item.name,
        'date', v_cursor::date,
        'time', to_char(v_cursor, 'HH24:MI'),
        'durationMinutes', v_duration,
        'operatorId', null,
        'operatorName', null
      ));
      v_cursor := v_cursor + make_interval(mins => v_duration);
    end loop;

    return jsonb_build_object(
      'available', true,
      'splitOperators', false,
      'assignments', v_assignments
    );
  end if;

  -- Fallback enabled by the salon: resolve and validate every phase at its
  -- exact consecutive start time.
  for v_item in
    select service.*, item.position, item.duration_override_minutes, item.price_override
    from public.service_composition_items as item
    join public.services as service on service.id = item.service_id
    where item.composition_id = p_composition_id
      and item.workspace_id = p_workspace_id
      and item.link_type = 'required'
    order by item.position
  loop
    v_timing := public.resolve_customer_service_timing_v1(
      p_workspace_id, p_customer_email, p_customer_phone, v_item.name
    );
    v_duration := greatest(
      case
        when coalesce((v_timing ->> 'customized')::boolean, false)
          then coalesce((v_timing ->> 'durationMinutes')::integer, v_item.duration_minutes, 60)
        else coalesce(v_item.duration_override_minutes, v_item.duration_minutes, 60)
      end,
      5
    );

    select operator.* into v_item_operator
    from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and public.public_operator_can_book_service_v1(
        p_workspace_id,
        operator.id::text,
        operator.name,
        v_item.name,
        v_item.required_role
      )
      and public.is_public_booking_slot_available(
        p_workspace_id,
        v_cursor::date,
        v_cursor::time,
        v_duration,
        v_item.name,
        operator.id::text,
        operator.name
      )
    order by operator.created_at, operator.name
    limit 1;

    if v_item_operator.id is null then
      return jsonb_build_object('available', false, 'assignments', '[]'::jsonb);
    end if;

    if v_first_operator_id is null then
      v_first_operator_id := v_item_operator.id::text;
    elsif v_first_operator_id <> v_item_operator.id::text then
      v_split_used := true;
    end if;

    v_assignments := v_assignments || jsonb_build_array(jsonb_build_object(
      'position', v_item.position,
      'serviceId', v_item.id,
      'serviceName', v_item.name,
      'date', v_cursor::date,
      'time', to_char(v_cursor, 'HH24:MI'),
      'durationMinutes', v_duration,
      'operatorId', v_item_operator.id::text,
      'operatorName', v_item_operator.name
    ));
    v_cursor := v_cursor + make_interval(mins => v_duration);
  end loop;

  return jsonb_build_object(
    'available', true,
    'splitOperators', v_split_used,
    'assignments', v_assignments
  );
end;
$$;

revoke all on function public.resolve_public_composition_operator_plan_v1(
  uuid, uuid, date, time, text, text, text, text
) from public;
grant execute on function public.resolve_public_composition_operator_plan_v1(
  uuid, uuid, date, time, text, text, text, text
) to anon, authenticated;

create or replace function public.get_public_composition_slot_availability_batch_v1(
  p_salon_code text,
  p_composition_id uuid,
  p_appointment_date date,
  p_slot_times jsonb,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_slot_text text;
  v_plan jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null or p_appointment_date is null
    or jsonb_typeof(p_slot_times) <> 'array'
  then
    return v_result;
  end if;

  for v_slot in select value from jsonb_array_elements(p_slot_times)
  loop
    v_slot_text := trim(both '"' from v_slot::text);
    if v_slot_text ~ '^[0-2][0-9]:[0-5][0-9]$' then
      v_plan := public.resolve_public_composition_operator_plan_v1(
        v_workspace_id,
        p_composition_id,
        p_appointment_date,
        v_slot_text::time,
        p_customer_email,
        p_customer_phone,
        p_requested_operator_id,
        p_requested_operator_name
      );
      v_result := v_result || jsonb_build_object(
        v_slot_text,
        coalesce((v_plan ->> 'available')::boolean, false)
      );
    elsif v_slot_text <> '' then
      v_result := v_result || jsonb_build_object(v_slot_text, false);
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_composition_slot_availability_batch_v1(
  text, uuid, date, jsonb, text, text, text, text
) from public;
grant execute on function public.get_public_composition_slot_availability_batch_v1(
  text, uuid, date, jsonb, text, text, text, text
) to anon, authenticated;

create or replace function public.create_public_booking_composition_v1(
  p_salon_code text,
  p_composition_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_name text,
  p_customer_surname text,
  p_customer_email citext,
  p_customer_phone text,
  p_customer_instagram text default null,
  p_notes text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_composition public.service_compositions%rowtype;
  v_group public.appointment_groups%rowtype;
  v_request public.booking_requests%rowtype;
  v_item record;
  v_plan jsonb;
  v_assignment jsonb;
  v_item_count integer;
  v_role_count integer;
  v_items_valid boolean;
  v_position integer := 0;
  v_total_price numeric(10, 2) := 0;
  v_effective_item_price numeric(10, 2) := 0;
  v_price_resolution jsonb;
  v_request_ids jsonb := '[]'::jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  select composition.* into v_composition
  from public.service_compositions as composition
  where composition.id = p_composition_id
    and composition.workspace_id = v_workspace_id
    and composition.visibility = 'public'
    and composition.is_active is true;
  if v_composition.id is null then raise exception 'composition_unavailable'; end if;

  perform pg_advisory_xact_lock(hashtext(
    v_workspace_id::text || ':' || coalesce(p_idempotency_key, '') || ':' ||
    p_appointment_date::text || ':' || p_appointment_time::text
  ));

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select appointment_group.* into v_group
    from public.appointment_groups as appointment_group
    where appointment_group.workspace_id = v_workspace_id
      and appointment_group.idempotency_key = trim(p_idempotency_key)
    limit 1;
    if v_group.id is not null then
      select coalesce(jsonb_agg(request.id order by request.appointment_group_order), '[]'::jsonb)
      into v_request_ids
      from public.booking_requests as request
      where request.workspace_id = v_workspace_id
        and request.appointment_group_id = v_group.id;
      return jsonb_build_object(
        'groupId', v_group.id,
        'requestIds', v_request_ids,
        'idempotent', true
      );
    end if;
  end if;

  select
    count(*),
    count(distinct lower(trim(coalesce(service.required_role, '')))),
    bool_and(
      service.workspace_id = v_workspace_id
      and service.is_online is not false
      and service.superseded_by_composition_id is null
      and not (
        service.phase_config is not null
        and coalesce(service.phase_config ->> 'mode', '') = 'phased'
      )
    )
  into v_item_count, v_role_count, v_items_valid
  from public.service_composition_items as item
  join public.services as service on service.id = item.service_id
  where item.composition_id = v_composition.id
    and item.workspace_id = v_workspace_id
    and item.link_type = 'required';

  if coalesce(v_item_count, 0) < 2
    or coalesce(v_role_count, 0) <> 1
    or coalesce(v_items_valid, false) is false
  then
    raise exception 'composition_items_invalid';
  end if;

  -- Re-resolve the complete plan inside the write transaction. If one phase
  -- cannot be covered, no request and no group is persisted.
  v_plan := public.resolve_public_composition_operator_plan_v1(
    v_workspace_id,
    v_composition.id,
    p_appointment_date,
    p_appointment_time,
    p_customer_email::text,
    p_customer_phone,
    p_requested_operator_id,
    p_requested_operator_name
  );
  if coalesce((v_plan ->> 'available')::boolean, false) is false then
    raise exception 'slot_unavailable';
  end if;

  insert into public.appointment_groups (
    workspace_id, title, source, status, total_price, idempotency_key, metadata
  ) values (
    v_workspace_id,
    v_composition.name,
    'frontend',
    'active',
    0,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    jsonb_build_object(
      'compositionId', v_composition.id,
      'itemCount', v_item_count,
      'allowSplitOperators', v_composition.allow_split_operators,
      'splitOperators', coalesce((v_plan ->> 'splitOperators')::boolean, false),
      'operatorAssignments', v_plan -> 'assignments',
      'requiresSalonApproval', true
    )
  ) returning * into v_group;

  for v_item in
    select service.*, item.position, item.duration_override_minutes, item.price_override
    from public.service_composition_items as item
    join public.services as service on service.id = item.service_id
    where item.composition_id = v_composition.id
      and item.workspace_id = v_workspace_id
      and item.link_type = 'required'
    order by item.position
  loop
    v_assignment := v_plan -> 'assignments' -> v_position;
    if v_assignment is null
      or (v_assignment ->> 'serviceId') is distinct from v_item.id::text
    then
      raise exception 'composition_operator_plan_invalid';
    end if;

    execute
      'select public.resolve_customer_service_price_v1($1, $2, $3, $4, $5)'
      into v_price_resolution
      using
        v_workspace_id,
        p_customer_email::text,
        p_customer_phone,
        v_item.name,
        coalesce(v_item.price_override, v_item.price);

    v_effective_item_price := greatest(
      coalesce(
        (v_price_resolution ->> 'price')::numeric,
        v_item.price_override,
        v_item.price,
        0
      ),
      0
    );

    v_request := public.create_public_booking_request_ultralight_v3(
      p_salon_code,
      v_item.name,
      v_effective_item_price,
      greatest(coalesce((v_assignment ->> 'durationMinutes')::integer, 0), 5),
      (v_assignment ->> 'date')::date,
      (v_assignment ->> 'time')::time,
      p_customer_name,
      p_customer_surname,
      p_customer_email,
      p_customer_phone,
      p_customer_instagram,
      p_notes,
      v_item.required_role,
      nullif(v_assignment ->> 'operatorId', ''),
      nullif(v_assignment ->> 'operatorName', '')
    );

    update public.booking_requests
    set appointment_group_id = v_group.id,
        appointment_group_order = v_position,
        appointment_group_size = v_item_count
    where id = v_request.id;

    v_request_ids := v_request_ids || jsonb_build_array(v_request.id);
    v_total_price := v_total_price + v_effective_item_price;
    v_position := v_position + 1;
  end loop;

  update public.appointment_groups
  set customer_id = v_request.customer_id,
      total_price = v_total_price,
      metadata = metadata || jsonb_build_object(
        'requestIds', v_request_ids,
        'customerEmail', lower(trim(coalesce(p_customer_email::text, ''))),
        'customerPhone', regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
      ),
      updated_at = timezone('utc', now())
  where id = v_group.id;

  return jsonb_build_object(
    'groupId', v_group.id,
    'requestIds', v_request_ids,
    'itemCount', v_item_count,
    'totalPrice', v_total_price,
    'splitOperators', coalesce((v_plan ->> 'splitOperators')::boolean, false),
    'requiresSalonApproval', true,
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_public_booking_composition_v1(
  text, uuid, date, time, text, text, citext, text, text, text, text, text, text
) from public;
grant execute on function public.create_public_booking_composition_v1(
  text, uuid, date, time, text, text, citext, text, text, text, text, text, text
) to anon, authenticated;

-- A composition is an explicit multi-phase salon decision. Even when the
-- workspace auto-accepts ordinary bookings, grouped requests stay pending.
create or replace function public.process_due_auto_accept_booking_requests(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select booking_request.id, booking_request.workspace_id
    from public.booking_requests as booking_request
    join public.workspaces as workspace on workspace.id = booking_request.workspace_id
    where booking_request.origin = 'frontend'
      and booking_request.status = 'pending'
      and booking_request.appointment_group_id is null
      and coalesce(workspace.auto_accept_booking_requests, false) = true
      and booking_request.created_at <= v_now - interval '15 seconds'
    order by booking_request.created_at asc, booking_request.id asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update of booking_request skip locked
  loop
    begin
      perform public.update_owner_booking_request_status_core(
        v_row.workspace_id,
        v_row.id,
        'accepted'::public.request_status
      );
      perform public.queue_owner_badge_refresh_after_auto_accept(v_row.workspace_id, v_row.id);
      v_processed := v_processed + 1;
    exception
      when others then
        if position('booking_request_conflict' in SQLERRM) > 0 then
          null;
        elsif position('booking_request_not_found' in SQLERRM) > 0 then
          null;
        else
          raise notice 'process_due_auto_accept_booking_requests failed for %: %', v_row.id, SQLERRM;
        end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception
  when others then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
