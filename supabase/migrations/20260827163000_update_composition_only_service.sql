-- Update one private composition component without changing its stable id.
-- Saved compositions keep referring to the same row, so the new defaults are
-- visible everywhere unless a composition intentionally stores an override.

create or replace function public.update_composition_only_service_v1(
  p_service_id uuid,
  p_name text,
  p_required_role text,
  p_duration_minutes integer,
  p_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_service public.services%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_required_role text := btrim(coalesce(p_required_role, ''));
  v_duration integer := coalesce(p_duration_minutes, 0);
  v_price numeric(10, 2) := round(coalesce(p_price, -1)::numeric, 2);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using errcode = '42501', message = 'workspace_access_denied';
  end if;

  if p_service_id is null then
    raise exception using errcode = '22023', message = 'composition_service_id_required';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'composition_service_name_invalid';
  end if;
  if v_required_role = '' or char_length(v_required_role) > 80 then
    raise exception using errcode = '22023', message = 'composition_service_role_invalid';
  end if;
  if v_duration not between 5 and 480 or v_duration % 5 <> 0 then
    raise exception using errcode = '22023', message = 'composition_service_duration_invalid';
  end if;
  if v_price < 0 or v_price > 9999 then
    raise exception using errcode = '22023', message = 'composition_service_price_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  select service.*
  into v_service
  from public.services as service
  where service.id = p_service_id
    and service.workspace_id = v_workspace_id
    and service.composition_only = true
    and coalesce(service.composition_source_kind, 'custom') = 'custom'
    and service.composition_source_service_id is null
    and service.superseded_by_composition_id is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'composition_service_not_editable';
  end if;

  if exists (
    select 1
    from public.services as duplicate
    where duplicate.workspace_id = v_workspace_id
      and duplicate.id <> p_service_id
      and duplicate.composition_only = true
      and coalesce(duplicate.composition_source_kind, 'custom') = 'custom'
      and duplicate.composition_source_service_id is null
      and duplicate.superseded_by_composition_id is null
      and lower(btrim(duplicate.name)) = lower(v_name)
      and lower(btrim(coalesce(duplicate.required_role, ''))) =
        lower(v_required_role)
  ) then
    raise exception using errcode = '23505', message = 'duplicate_service_name_for_role';
  end if;

  update public.services
  set
    name = v_name,
    required_role = v_required_role,
    duration_minutes = v_duration,
    price = v_price,
    original_price = null,
    discount_enabled = false,
    is_online = true,
    composition_only = true,
    composition_source_kind = 'custom',
    composition_source_service_id = null,
    composition_source_phase = null,
    phase_config = '{}'::jsonb,
    linked_service_config = '{}'::jsonb,
    updated_at = timezone('utc', now())
  where id = p_service_id
    and workspace_id = v_workspace_id
  returning * into v_service;

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
    'sourcePhase', v_service.composition_source_phase,
    'updated', true
  );
end;
$$;

revoke all on function public.update_composition_only_service_v1(
  uuid,
  text,
  text,
  integer,
  numeric
) from public;

grant execute on function public.update_composition_only_service_v1(
  uuid,
  text,
  text,
  integer,
  numeric
) to authenticated;

comment on function public.update_composition_only_service_v1(
  uuid,
  text,
  text,
  integer,
  numeric
) is 'Updates one custom private composition component in the current workspace while preserving its stable id.';

notify pgrst, 'reload schema';
