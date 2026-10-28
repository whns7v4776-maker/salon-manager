-- Keep the public service catalogue and the private composition component
-- catalogue in separate naming namespaces. A salon may intentionally create a
-- private "Taglio" component even when a public "Taglio" service exists.

create or replace function public.normalize_service_catalog_write_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_duplicate_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  new.name := btrim(coalesce(new.name, ''));
  if new.name = '' then
    raise exception using
      errcode = '22023',
      message = 'service_name_required';
  end if;

  new.required_role := nullif(btrim(coalesce(new.required_role, '')), '');
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.client_badge := nullif(left(btrim(coalesce(new.client_badge, '')), 48), '');
  new.price := round(greatest(coalesce(new.price, 0), 0)::numeric, 2);
  new.duration_minutes := greatest(1, least(coalesce(new.duration_minutes, 60), 480));
  new.client_role_display_order := greatest(coalesce(new.client_role_display_order, 0), 0);
  new.client_display_order := greatest(coalesce(new.client_display_order, 0), 0);
  new.is_online := coalesce(new.is_online, true);

  if new.original_price is not null and new.original_price <= new.price then
    new.original_price := null;
  end if;
  new.discount_enabled := coalesce(new.discount_enabled, false) and new.original_price is not null;

  if
    (new.discount_valid_from is null) <> (new.discount_valid_to is null)
    or (
      new.discount_valid_from is not null
      and new.discount_valid_to < new.discount_valid_from
    )
  then
    new.discount_valid_from := null;
    new.discount_valid_to := null;
  end if;

  if
    (new.discount_start_time is null) <> (new.discount_end_time is null)
    or (
      new.discount_start_time is not null
      and new.discount_end_time <= new.discount_start_time
    )
  then
    new.discount_start_time := null;
    new.discount_end_time := null;
  end if;

  if jsonb_typeof(coalesce(new.phase_config, '{}'::jsonb)) <> 'object' then
    new.phase_config := '{}'::jsonb;
  else
    new.phase_config := coalesce(new.phase_config, '{}'::jsonb);
  end if;

  if jsonb_typeof(coalesce(new.linked_service_config, '{}'::jsonb)) <> 'object' then
    new.linked_service_config := '{}'::jsonb;
  else
    new.linked_service_config := coalesce(new.linked_service_config, '{}'::jsonb);
  end if;

  select service.id
  into v_duplicate_id
  from public.services as service
  where service.workspace_id = new.workspace_id
    and service.id <> new.id
    and (
      (
        coalesce(new.composition_only, false) = false
        and coalesce(service.composition_only, false) = false
      )
      or (
        new.composition_only = true
        and service.composition_only = true
        and coalesce(new.composition_source_kind, 'custom') = 'custom'
        and coalesce(service.composition_source_kind, 'custom') = 'custom'
      )
    )
    and lower(btrim(service.name)) = lower(new.name)
    and lower(btrim(coalesce(service.required_role, ''))) =
      lower(btrim(coalesce(new.required_role, '')))
    and service.superseded_by_composition_id is null
    and new.superseded_by_composition_id is null
  limit 1;

  if v_duplicate_id is not null then
    raise exception using
      errcode = '23505',
      constraint = 'services_workspace_name_role_key',
      message = 'duplicate_service_name_for_role';
  end if;

  return new;
end;
$$;

create or replace function public.create_composition_only_service_v2(
  p_name text,
  p_required_role text,
  p_duration_minutes integer,
  p_price numeric,
  p_phase_config jsonb default null,
  p_source_service_id uuid default null,
  p_source_phase text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_service public.services%rowtype;
  v_source public.services%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_required_role text := btrim(coalesce(p_required_role, ''));
  v_duration integer := greatest(5, least(coalesce(p_duration_minutes, 60), 480));
  v_price numeric(10, 2) := round(greatest(coalesce(p_price, 0), 0)::numeric, 2);
  v_source_phase text := nullif(lower(btrim(coalesce(p_source_phase, ''))), '');
  v_source_kind text := case when p_source_service_id is null then 'custom' else 'derived' end;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using errcode = '42501', message = 'workspace_access_denied';
  end if;

  if p_source_service_id is not null then
    select source.* into v_source
    from public.services as source
    where source.id = p_source_service_id
      and source.workspace_id = v_workspace_id
      and source.superseded_by_composition_id is null;
    if not found then
      raise exception using errcode = '22023', message = 'composition_source_service_invalid';
    end if;
    if v_source_phase not in ('service', 'initial', 'final') then
      raise exception using errcode = '22023', message = 'composition_source_phase_invalid';
    end if;
  elsif v_source_phase is not null then
    raise exception using errcode = '22023', message = 'composition_source_service_required';
  end if;

  if v_name = '' or char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'composition_service_name_invalid';
  end if;
  if v_required_role = '' or char_length(v_required_role) > 80 then
    raise exception using errcode = '22023', message = 'composition_service_role_invalid';
  end if;
  if coalesce(p_duration_minutes, 0) not between 5 and 480
    or p_duration_minutes % 5 <> 0 then
    raise exception using errcode = '22023', message = 'composition_service_duration_invalid';
  end if;
  if coalesce(p_price, -1) < 0 or p_price > 9999 then
    raise exception using errcode = '22023', message = 'composition_service_price_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  if p_source_service_id is not null then
    select service.* into v_service
    from public.services as service
    where service.workspace_id = v_workspace_id
      and service.composition_only = true
      and service.composition_source_kind = 'derived'
      and service.composition_source_service_id = p_source_service_id
      and service.composition_source_phase = v_source_phase
    limit 1;
    if found then
      return jsonb_build_object(
        'id', v_service.id,
        'name', v_service.name,
        'price', v_service.price,
        'durationMinutes', v_service.duration_minutes,
        'requiredRole', v_service.required_role,
        'phaseConfig', v_service.phase_config,
        'compositionOnly', true,
        'sourceKind', v_service.composition_source_kind,
        'sourceServiceId', v_service.composition_source_service_id,
        'sourcePhase', v_service.composition_source_phase
      );
    end if;
  end if;

  if p_source_service_id is null and exists (
    select 1 from public.services as service
    where service.workspace_id = v_workspace_id
      and service.composition_only = true
      and coalesce(service.composition_source_kind, 'custom') = 'custom'
      and service.superseded_by_composition_id is null
      and lower(btrim(service.name)) = lower(v_name)
      and lower(btrim(coalesce(service.required_role, ''))) = lower(v_required_role)
  ) then
    raise exception using errcode = '23505', message = 'duplicate_service_name_for_role';
  end if;

  insert into public.services (
    workspace_id, name, price, duration_minutes, required_role, is_online,
    composition_only, phase_config, composition_source_kind,
    composition_source_service_id, composition_source_phase
  ) values (
    v_workspace_id, v_name, v_price, v_duration, v_required_role, true,
    true, p_phase_config, v_source_kind, p_source_service_id, v_source_phase
  ) returning * into v_service;

  return jsonb_build_object(
    'id', v_service.id,
    'name', v_service.name,
    'price', v_service.price,
    'durationMinutes', v_service.duration_minutes,
    'requiredRole', v_service.required_role,
    'phaseConfig', v_service.phase_config,
    'compositionOnly', true,
    'sourceKind', v_service.composition_source_kind,
    'sourceServiceId', v_service.composition_source_service_id,
    'sourcePhase', v_service.composition_source_phase
  );
end;
$$;

revoke all on function public.create_composition_only_service_v2(text, text, integer, numeric, jsonb, uuid, text)
  from public;
grant execute on function public.create_composition_only_service_v2(text, text, integer, numeric, jsonb, uuid, text)
  to authenticated;

comment on function public.normalize_service_catalog_write_v1() is
  'Normalizes service writes and prevents duplicates within either the public catalogue or private composition namespace.';

notify pgrst, 'reload schema';
