-- Optional customer-facing service dependencies.
-- The customer chooses one configured add-on before proceeding. The two
-- services are persisted atomically as two distinct, consecutive Agenda slots.

comment on column public.services.linked_service_config is
  'Reusable service links. clientChoiceRequired with suggestedServiceIds exposes one mandatory customer add-on choice.';

create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'descrizione', coalesce(service.description, ''),
          'prezzo', service.price,
          'prezzoOriginale', service.original_price,
          'scontoAttivo', service.discount_enabled,
          'scontoValidoDal', service.discount_valid_from,
          'scontoValidoAl', service.discount_valid_to,
          'scontoOraDalle', case when service.discount_start_time is null then null else to_char(service.discount_start_time, 'HH24:MI') end,
          'scontoOraAlle', case when service.discount_end_time is null then null else to_char(service.discount_end_time, 'HH24:MI') end,
          'scontoGiorniSettimana', service.discount_weekdays,
          'durataMinuti', service.duration_minutes,
          'phaseConfig', service.phase_config,
          'linkedServiceConfig', case
            when lower(trim(coalesce(service.linked_service_config ->> 'clientChoiceRequired', 'false'))) = 'true'
              then service.linked_service_config
            else '{}'::jsonb
          end,
          'mestiereRichiesto', coalesce(service.required_role, ''),
          'badgeCliente', coalesce(service.client_badge, ''),
          'ordineMestiereCliente', service.client_role_display_order,
          'ordineCliente', service.client_display_order,
          'disponibileOnline', true
        )
        order by service.client_role_display_order, service.required_role,
          service.client_display_order, service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb))
          with ordinality as existing(existing_item, existing_position)
        where nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
          )
        order by case when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0 else 1 end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
        and service.is_online = true
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

create or replace function public.create_public_booking_dependency_v1(
  p_salon_code text,
  p_parent_service_name text,
  p_dependency_service_id uuid,
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
  v_parent public.services%rowtype;
  v_dependency public.services%rowtype;
  v_group public.appointment_groups%rowtype;
  v_parent_timing jsonb;
  v_dependency_timing jsonb;
  v_parent_result jsonb;
  v_dependency_result jsonb;
  v_parent_request_id uuid;
  v_dependency_request_id uuid;
  v_parent_duration integer;
  v_dependency_duration integer;
  v_dependency_time time;
  v_request_ids jsonb := '[]'::jsonb;
  v_total_price numeric(10, 2) := 0;
  v_customer_id uuid;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  select service.* into v_parent
  from public.services as service
  where service.workspace_id = v_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_parent_service_name, '')))
    and service.is_online is true
    and service.superseded_by_composition_id is null
  order by service.updated_at desc, service.created_at desc
  limit 1;
  if v_parent.id is null then raise exception 'service_unavailable'; end if;

  select service.* into v_dependency
  from public.services as service
  where service.id = p_dependency_service_id
    and service.workspace_id = v_workspace_id
    and service.is_online is true
    and service.superseded_by_composition_id is null
  limit 1;
  if v_dependency.id is null or v_dependency.id = v_parent.id then
    raise exception 'dependency_unavailable';
  end if;

  if lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) <> 'true'
    or not exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_parent.linked_service_config -> 'suggestedServiceIds') = 'array'
            then v_parent.linked_service_config -> 'suggestedServiceIds'
          else '[]'::jsonb
        end
      ) as configured(service_id)
      where configured.service_id = v_dependency.id::text
    )
  then
    raise exception 'dependency_configuration_changed';
  end if;

  if lower(trim(coalesce(v_parent.required_role, ''))) is distinct from
    lower(trim(coalesce(v_dependency.required_role, '')))
  then
    raise exception 'dependency_configuration_changed';
  end if;

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
        'itemCount', jsonb_array_length(v_request_ids),
        'totalPrice', v_group.total_price,
        'idempotent', true
      );
    end if;
  end if;

  v_parent_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone, v_parent.name
  );
  v_dependency_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone, v_dependency.name
  );
  v_parent_duration := greatest(
    coalesce((v_parent_timing ->> 'durationMinutes')::integer, v_parent.duration_minutes, 60),
    5
  );
  v_dependency_duration := greatest(
    coalesce((v_dependency_timing ->> 'durationMinutes')::integer, v_dependency.duration_minutes, 60),
    5
  );

  if (
    extract(hour from p_appointment_time)::integer * 60 +
    extract(minute from p_appointment_time)::integer +
    v_parent_duration + v_dependency_duration
  ) > 1440 then
    raise exception 'slot_unavailable';
  end if;
  v_dependency_time := p_appointment_time + make_interval(mins => v_parent_duration);

  insert into public.appointment_groups (
    workspace_id, title, source, status, total_price, idempotency_key, metadata
  ) values (
    v_workspace_id,
    trim(v_parent.name) || ' + ' || trim(v_dependency.name),
    'frontend',
    'active',
    0,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    jsonb_build_object(
      'dependencyParentServiceId', v_parent.id,
      'dependencyServiceId', v_dependency.id,
      'itemCount', 2,
      'requiresSalonApproval', true
    )
  ) returning * into v_group;

  if coalesce(v_parent_timing -> 'phaseConfig' ->> 'mode', '') = 'phased' then
    v_parent_result := public.create_public_phased_booking_request_v5(
      p_salon_code, v_parent.name, v_parent.price, v_parent_duration,
      p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
      p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
      v_parent.required_role, p_requested_operator_id, p_requested_operator_name,
      coalesce(v_parent_timing -> 'phaseConfig', v_parent.phase_config, '{}'::jsonb)
    );
  else
    v_parent_result := public.create_public_booking_request_ultralight_v4(
      p_salon_code, v_parent.name, v_parent.price, v_parent_duration,
      p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
      p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
      v_parent.required_role, p_requested_operator_id, p_requested_operator_name
    );
  end if;

  v_parent_request_id := nullif(v_parent_result ->> 'id', '')::uuid;
  if v_parent_request_id is null then raise exception 'dependency_parent_not_persisted'; end if;

  if coalesce(v_dependency_timing -> 'phaseConfig' ->> 'mode', '') = 'phased' then
    v_dependency_result := public.create_public_phased_booking_request_v5(
      p_salon_code, v_dependency.name, v_dependency.price, v_dependency_duration,
      p_appointment_date, v_dependency_time, p_customer_name, p_customer_surname,
      p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
      v_dependency.required_role, p_requested_operator_id, p_requested_operator_name,
      coalesce(v_dependency_timing -> 'phaseConfig', v_dependency.phase_config, '{}'::jsonb)
    );
  else
    v_dependency_result := public.create_public_booking_request_ultralight_v4(
      p_salon_code, v_dependency.name, v_dependency.price, v_dependency_duration,
      p_appointment_date, v_dependency_time, p_customer_name, p_customer_surname,
      p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
      v_dependency.required_role, p_requested_operator_id, p_requested_operator_name
    );
  end if;

  v_dependency_request_id := nullif(v_dependency_result ->> 'id', '')::uuid;
  if v_dependency_request_id is null then raise exception 'dependency_addon_not_persisted'; end if;

  update public.booking_requests
  set appointment_group_id = v_group.id,
      appointment_group_order = case when id = v_parent_request_id then 0 else 1 end,
      appointment_group_size = 2
  where workspace_id = v_workspace_id
    and id in (v_parent_request_id, v_dependency_request_id);

  select request.customer_id into v_customer_id
  from public.booking_requests as request
  where request.id = v_parent_request_id;

  v_request_ids := jsonb_build_array(v_parent_request_id, v_dependency_request_id);
  v_total_price := greatest(coalesce((v_parent_result ->> 'requested_price')::numeric, 0), 0) +
    greatest(coalesce((v_dependency_result ->> 'requested_price')::numeric, 0), 0);

  update public.appointment_groups
  set customer_id = v_customer_id,
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
    'itemCount', 2,
    'totalPrice', v_total_price,
    'requiresSalonApproval', true,
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_public_booking_dependency_v1(
  text, text, uuid, date, time, text, text, citext, text, text, text, text, text, text
) from public;
grant execute on function public.create_public_booking_dependency_v1(
  text, text, uuid, date, time, text, text, citext, text, text, text, text, text, text
) to anon, authenticated;

do $$
declare
  v_workspace_id uuid;
begin
  for v_workspace_id in select workspace_id from public.client_portals loop
    perform public.sync_client_portal_services(v_workspace_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
