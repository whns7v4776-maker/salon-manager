-- Use one booking model: atomic services plus reusable compositions.
-- The legacy combined service is preserved for history, but superseded rows
-- are excluded from the active catalog and can no longer create one large slot.

alter table public.services
  add column if not exists superseded_by_composition_id uuid
    references public.service_compositions(id) on delete set null;

alter table public.service_composition_items
  add column if not exists duration_override_minutes integer
    check (
      duration_override_minutes is null
      or duration_override_minutes >= 5
    );

alter table public.service_composition_items
  add column if not exists price_override numeric(10, 2)
    check (
      price_override is null
      or price_override between 0 and 9999
    );

comment on column public.service_composition_items.price_override is
  'Optional price used only when this service belongs to this composition. Customer-specific prices retain priority.';

create index if not exists services_superseded_composition_idx
  on public.services (workspace_id, superseded_by_composition_id);

do $$
declare
  v_workspace_id uuid;
  v_legacy_service_id uuid := '77fd01a0-1fac-4dab-b64e-5cb94a7bbdfd'::uuid;
  v_first_service_id uuid;
  v_second_service_id uuid;
  v_composition_id uuid;
begin
  select service.workspace_id
  into v_workspace_id
  from public.services as service
  where service.id = v_legacy_service_id;

  if v_workspace_id is null then
    return;
  end if;

  select service.id
  into v_first_service_id
  from public.services as service
  where service.workspace_id = v_workspace_id
    and lower(trim(service.name)) = 'taglio uomo'
    and service.superseded_by_composition_id is null
  limit 1;

  select service.id
  into v_second_service_id
  from public.services as service
  where service.workspace_id = v_workspace_id
    and lower(trim(service.name)) = 'barba uomo'
    and service.superseded_by_composition_id is null
  limit 1;

  if v_first_service_id is null or v_second_service_id is null then
    return;
  end if;

  insert into public.service_compositions (
    workspace_id,
    name,
    visibility,
    is_active,
    updated_at
  ) values (
    v_workspace_id,
    'Capelli + Barba',
    'public',
    true,
    timezone('utc', now())
  )
  on conflict (workspace_id, name) do update
  set visibility = excluded.visibility,
      is_active = true,
      updated_at = timezone('utc', now())
  returning id into v_composition_id;

  insert into public.service_composition_items (
    workspace_id,
    composition_id,
    service_id,
    position,
    link_type,
    duration_override_minutes
  ) values
    (v_workspace_id, v_composition_id, v_first_service_id, 0, 'required', 30),
    (v_workspace_id, v_composition_id, v_second_service_id, 1, 'required', 30)
  on conflict (composition_id, service_id) do update
  set position = excluded.position,
      link_type = 'required',
      duration_override_minutes = excluded.duration_override_minutes;

  update public.services
  set is_online = false,
      superseded_by_composition_id = v_composition_id
  where id = v_legacy_service_id
    and workspace_id = v_workspace_id;
end;
$$;

-- Public catalog: expose only complete, homogeneous compositions made of
-- atomic services. A composition is presented as one choice to the customer,
-- while every item remains an independent booking phase.
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
    group by composition.id, composition.name, composition.workspace_id
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
      coalesce(sum(service.price), 0)::numeric(10, 2) as total_price,
      coalesce(sum(coalesce(item.duration_override_minutes, service.duration_minutes, 60)), 0)::integer
        as total_duration,
      max(service.required_role) as required_role,
      jsonb_agg(
        jsonb_build_object(
          'serviceId', service.id,
          'serviceName', service.name,
          'price', service.price,
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
    group by valid.id, valid.name
  ) as composition;
$$;

revoke all on function public.get_public_service_compositions_v1(text) from public;
grant execute on function public.get_public_service_compositions_v1(text) to anon, authenticated;

create or replace function public.get_public_booking_group_members_v1(
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
  )
  select jsonb_build_object(
    'requests', coalesce((
      select jsonb_object_agg(
        request.id::text,
        jsonb_build_object(
          'appointmentGroupId', request.appointment_group_id,
          'appointmentGroupOrder', request.appointment_group_order,
          'appointmentGroupSize', request.appointment_group_size
        )
      )
      from public.booking_requests as request
      join selected_workspace on selected_workspace.id = request.workspace_id
      where request.appointment_group_id is not null
    ), '{}'::jsonb),
    'appointments', coalesce((
      select jsonb_object_agg(
        appointment.id::text,
        jsonb_build_object(
          'appointmentGroupId', appointment.appointment_group_id,
          'appointmentGroupOrder', appointment.appointment_group_order,
          'appointmentGroupSize', appointment.appointment_group_size
        )
      )
      from public.appointments as appointment
      join selected_workspace on selected_workspace.id = appointment.workspace_id
      where appointment.appointment_group_id is not null
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.get_public_booking_group_members_v1(text) from public;
grant execute on function public.get_public_booking_group_members_v1(text)
  to anon, authenticated;

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
  v_role text;
  v_item_count integer;
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_slot_text text;
  v_cursor timestamp;
  v_duration integer;
  v_timing jsonb;
  v_available boolean;
  v_has_role_operators boolean;
  v_operator public.operators%rowtype;
  v_explicit boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
  v_item record;
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

  select count(*), max(service.required_role)
  into v_item_count, v_role
  from public.service_compositions as composition
  join public.service_composition_items as item
    on item.composition_id = composition.id
    and item.workspace_id = composition.workspace_id
    and item.link_type = 'required'
  join public.services as service
    on service.id = item.service_id
    and service.workspace_id = composition.workspace_id
  where composition.id = p_composition_id
    and composition.workspace_id = v_workspace_id
    and composition.visibility = 'public'
    and composition.is_active is true
    and service.superseded_by_composition_id is null
    and service.is_online is not false
    and not (
      service.phase_config is not null
      and coalesce(service.phase_config ->> 'mode', '') = 'phased'
    );

  if coalesce(v_item_count, 0) < 2 then
    return v_result;
  end if;

  select exists (
    select 1 from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        nullif(lower(trim(coalesce(v_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(v_role))
      )
  ) into v_has_role_operators;

  for v_slot in select value from jsonb_array_elements(p_slot_times)
  loop
    v_slot_text := trim(both '"' from v_slot::text);
    v_available := false;

    if v_slot_text ~ '^[0-2][0-9]:[0-5][0-9]$' then
      for v_operator in
        select operator.*
        from public.operators as operator
        where operator.workspace_id = v_workspace_id
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
              and item.workspace_id = v_workspace_id
              and item.link_type = 'required'
              and not public.public_operator_can_book_service_v1(
                v_workspace_id,
                operator.id::text,
                operator.name,
                service.name,
                service.required_role
              )
          )
        order by operator.created_at, operator.name
      loop
        v_cursor := p_appointment_date::timestamp + v_slot_text::time;
        v_available := true;

        for v_item in
          select service.*, item.duration_override_minutes
          from public.service_composition_items as item
          join public.services as service on service.id = item.service_id
          where item.composition_id = p_composition_id
            and item.workspace_id = v_workspace_id
            and item.link_type = 'required'
          order by item.position
        loop
          v_timing := public.resolve_customer_service_timing_v1(
            v_workspace_id, p_customer_email, p_customer_phone, v_item.name
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
            v_workspace_id,
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

          v_cursor := v_cursor + make_interval(mins => v_duration);
        end loop;
        exit when v_available;
      end loop;

      if not v_available and not v_explicit and not v_has_role_operators then
        v_cursor := p_appointment_date::timestamp + v_slot_text::time;
        v_available := true;
        for v_item in
          select service.*, item.duration_override_minutes
          from public.service_composition_items as item
          join public.services as service on service.id = item.service_id
          where item.composition_id = p_composition_id
            and item.workspace_id = v_workspace_id
            and item.link_type = 'required'
          order by item.position
        loop
          v_timing := public.resolve_customer_service_timing_v1(
            v_workspace_id, p_customer_email, p_customer_phone, v_item.name
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
            v_workspace_id, v_cursor::date, v_cursor::time, v_duration,
            v_item.name, null, null
          ) then
            v_available := false;
            exit;
          end if;
          v_cursor := v_cursor + make_interval(mins => v_duration);
        end loop;
      end if;
    end if;

    if v_slot_text <> '' then
      v_result := v_result || jsonb_build_object(v_slot_text, v_available);
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
  v_operator public.operators%rowtype;
  v_item record;
  v_timing jsonb;
  v_duration integer;
  v_cursor timestamp;
  v_item_count integer;
  v_role_count integer;
  v_required_role text;
  v_position integer := 0;
  v_total_price numeric(10, 2) := 0;
  v_request_ids jsonb := '[]'::jsonb;
  v_explicit boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
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
    max(service.required_role)
  into v_item_count, v_role_count, v_required_role
  from public.service_composition_items as item
  join public.services as service on service.id = item.service_id
  where item.composition_id = v_composition.id
    and item.workspace_id = v_workspace_id
    and item.link_type = 'required'
    and service.workspace_id = v_workspace_id
    and service.is_online is not false
    and service.superseded_by_composition_id is null
    and not (
      service.phase_config is not null
      and coalesce(service.phase_config ->> 'mode', '') = 'phased'
    );
  if coalesce(v_item_count, 0) < 2 or coalesce(v_role_count, 0) <> 1 then
    raise exception 'composition_items_invalid';
  end if;

  select operator.* into v_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      not v_explicit
      or operator.id::text = trim(coalesce(p_requested_operator_id, ''))
      or lower(trim(operator.name)) = lower(trim(coalesce(p_requested_operator_name, '')))
    )
    and not exists (
      select 1
      from public.service_composition_items as item
      join public.services as service on service.id = item.service_id
      where item.composition_id = v_composition.id
        and item.workspace_id = v_workspace_id
        and item.link_type = 'required'
        and not public.public_operator_can_book_service_v1(
          v_workspace_id, operator.id::text, operator.name, service.name, service.required_role
        )
    )
  order by operator.created_at, operator.name
  limit 1;

  if v_explicit and v_operator.id is null then raise exception 'operator_service_not_enabled'; end if;
  if not v_explicit and v_operator.id is null and exists (
    select 1 from public.operators
    where workspace_id = v_workspace_id
      and (
        nullif(lower(trim(coalesce(v_required_role, ''))), '') is null
        or lower(trim(coalesce(required_role, ''))) = lower(trim(v_required_role))
      )
  ) then
    raise exception 'operator_service_not_enabled';
  end if;

  v_cursor := p_appointment_date::timestamp + p_appointment_time;
  for v_item in
    select service.*, item.position, item.duration_override_minutes
    from public.service_composition_items as item
    join public.services as service on service.id = item.service_id
    where item.composition_id = v_composition.id
      and item.workspace_id = v_workspace_id
      and item.link_type = 'required'
    order by item.position
  loop
    v_timing := public.resolve_customer_service_timing_v1(
      v_workspace_id, p_customer_email::text, p_customer_phone, v_item.name
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
      v_workspace_id,
      v_cursor::date,
      v_cursor::time,
      v_duration,
      v_item.name,
      case when v_operator.id is null then null else v_operator.id::text end,
      case when v_operator.id is null then null else v_operator.name end
    ) then
      raise exception 'slot_unavailable';
    end if;
    v_cursor := v_cursor + make_interval(mins => v_duration);
  end loop;

  insert into public.appointment_groups (
    workspace_id, title, source, status, total_price, idempotency_key, metadata
  ) values (
    v_workspace_id,
    v_composition.name,
    'frontend',
    'active',
    0,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    jsonb_build_object('compositionId', v_composition.id, 'itemCount', v_item_count)
  ) returning * into v_group;

  v_cursor := p_appointment_date::timestamp + p_appointment_time;
  for v_item in
    select service.*, item.position, item.duration_override_minutes
    from public.service_composition_items as item
    join public.services as service on service.id = item.service_id
    where item.composition_id = v_composition.id
      and item.workspace_id = v_workspace_id
      and item.link_type = 'required'
    order by item.position
  loop
    v_timing := public.resolve_customer_service_timing_v1(
      v_workspace_id, p_customer_email::text, p_customer_phone, v_item.name
    );
    v_duration := greatest(
      case
        when coalesce((v_timing ->> 'customized')::boolean, false)
          then coalesce((v_timing ->> 'durationMinutes')::integer, v_item.duration_minutes, 60)
        else coalesce(v_item.duration_override_minutes, v_item.duration_minutes, 60)
      end,
      5
    );

    v_request := public.create_public_booking_request_ultralight_v3(
      p_salon_code,
      v_item.name,
      v_item.price,
      v_duration,
      v_cursor::date,
      v_cursor::time,
      p_customer_name,
      p_customer_surname,
      p_customer_email,
      p_customer_phone,
      p_customer_instagram,
      p_notes,
      v_item.required_role,
      case when v_operator.id is null then null else v_operator.id::text end,
      case when v_operator.id is null then null else v_operator.name end
    );

    update public.booking_requests
    set appointment_group_id = v_group.id,
        appointment_group_order = v_position,
        appointment_group_size = v_item_count
    where id = v_request.id;

    v_request_ids := v_request_ids || jsonb_build_array(v_request.id);
    v_total_price := v_total_price + coalesce(v_item.price, 0);
    v_cursor := v_cursor + make_interval(mins => v_duration);
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

create or replace function public.copy_booking_group_to_appointment_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.booking_request_id is null then return new; end if;
  select
    request.appointment_group_id,
    request.appointment_group_order,
    request.appointment_group_size
  into
    new.appointment_group_id,
    new.appointment_group_order,
    new.appointment_group_size
  from public.booking_requests as request
  where request.id = new.booking_request_id
    and request.workspace_id = new.workspace_id;
  return new;
end;
$$;

drop trigger if exists copy_booking_group_to_appointment_v1 on public.appointments;
create trigger copy_booking_group_to_appointment_v1
before insert or update of booking_request_id on public.appointments
for each row execute function public.copy_booking_group_to_appointment_v1();

create or replace function public.update_owner_booking_request_group_status_v1(
  p_appointment_group_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_status public.request_status;
  v_request record;
  v_result jsonb;
  v_appointment_ids jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (
    select 1 from public.appointment_groups
    where id = p_appointment_group_id and workspace_id = v_workspace_id
  ) then
    raise exception 'appointment_group_not_found';
  end if;

  v_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;
  if v_status is null then raise exception 'invalid_request_status'; end if;

  for v_request in
    select request.id, request.appointment_group_order, request.appointment_group_size
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = p_appointment_group_id
    order by request.appointment_group_order, request.created_at
  loop
    v_result := public.update_owner_booking_request_status_core(
      v_workspace_id, v_request.id, v_status
    );
    if v_status = 'accepted' then
      update public.appointments
      set appointment_group_id = p_appointment_group_id,
          appointment_group_order = v_request.appointment_group_order,
          appointment_group_size = v_request.appointment_group_size
      where workspace_id = v_workspace_id
        and booking_request_id = v_request.id;
    end if;
    if nullif(v_result ->> 'appointmentId', '') is not null then
      v_appointment_ids := v_appointment_ids || jsonb_build_array(v_result ->> 'appointmentId');
    end if;
  end loop;

  update public.appointment_groups
  set status = case when v_status = 'cancelled' then 'cancelled' else 'active' end,
      updated_at = timezone('utc', now())
  where id = p_appointment_group_id and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'groupId', p_appointment_group_id,
    'status', v_status,
    'appointmentIds', v_appointment_ids
  );
end;
$$;

revoke all on function public.update_owner_booking_request_group_status_v1(uuid, text)
  from public;
grant execute on function public.update_owner_booking_request_group_status_v1(uuid, text)
  to authenticated;

create or replace function public.cancel_public_booking_group_v1(
  p_salon_code text,
  p_appointment_group_id uuid,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request record;
  v_results jsonb := '[]'::jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  if not exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = p_appointment_group_id
      and lower(trim(coalesce(request.customer_email::text, ''))) =
        lower(trim(coalesce(p_customer_email, '')))
      and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
        regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
  ) then
    raise exception 'booking_request_not_found';
  end if;

  for v_request in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = p_appointment_group_id
      and request.status::text in ('pending', 'accepted')
    order by request.appointment_group_order, request.created_at
  loop
    v_results := v_results || jsonb_build_array(
      public.cancel_public_booking_request(
        p_salon_code,
        v_request.id,
        p_customer_email::citext,
        p_customer_phone
      )
    );
  end loop;

  update public.appointment_groups
  set status = 'cancelled', updated_at = timezone('utc', now())
  where id = p_appointment_group_id and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'groupId', p_appointment_group_id,
    'cancelled', true,
    'results', v_results
  );
end;
$$;

revoke all on function public.cancel_public_booking_group_v1(text, uuid, text, text)
  from public;
grant execute on function public.cancel_public_booking_group_v1(text, uuid, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
