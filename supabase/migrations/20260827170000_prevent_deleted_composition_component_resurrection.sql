-- Deleted private composition components are tombstoned by the existing
-- recovery ledger. A stale owner snapshot must never recreate them during a
-- refresh/background flush. Intentional creation remains available only
-- through the authenticated composition-component RPC.

create or replace function public.block_deleted_composition_component_resurrection_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if
    coalesce(new.composition_only, false) = true
    and coalesce(new.composition_source_kind, 'custom') = 'custom'
    and new.composition_source_service_id is null
    and coalesce(
      current_setting(
        'salonpro.explicit_composition_component_create',
        true
      ),
      ''
    ) <> 'on'
    and exists (
      select 1
      from public.deleted_service_recovery_rows as recovery
      where recovery.workspace_id = new.workspace_id
        and coalesce(
          (recovery.service_snapshot ->> 'composition_only')::boolean,
          false
        ) = true
        and coalesce(
          recovery.service_snapshot ->> 'composition_source_kind',
          'custom'
        ) = 'custom'
        and nullif(
          btrim(
            coalesce(
              recovery.service_snapshot ->> 'composition_source_service_id',
              ''
            )
          ),
          ''
        ) is null
        and lower(
          btrim(coalesce(recovery.service_snapshot ->> 'name', ''))
        ) = lower(btrim(coalesce(new.name, '')))
        and lower(
          btrim(
            coalesce(recovery.service_snapshot ->> 'required_role', '')
          )
        ) = lower(btrim(coalesce(new.required_role, '')))
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'deleted_composition_component_tombstoned',
      detail = 'A stale owner snapshot attempted to recreate a deleted private composition component.',
      hint = 'Create the component explicitly through create_composition_only_service_v2.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_deleted_composition_component_resurrection_v1
  on public.services;
create trigger block_deleted_composition_component_resurrection_v1
before insert on public.services
for each row execute function public.block_deleted_composition_component_resurrection_v1();

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

  perform set_config(
    'salonpro.explicit_composition_component_create',
    'on',
    true
  );

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

revoke all on function public.create_composition_only_service_v2(
  text, text, integer, numeric, jsonb, uuid, text
) from public;
grant execute on function public.create_composition_only_service_v2(
  text, text, integer, numeric, jsonb, uuid, text
) to authenticated;

comment on function public.block_deleted_composition_component_resurrection_v1() is
  'Blocks stale owner snapshots from recreating deleted private composition components.';

notify pgrst, 'reload schema';
