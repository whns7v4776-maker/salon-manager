-- Preserve a stable technical identity for private composition services and
-- record whether they were created from scratch or derived from a catalog
-- service/phase. Public visibility continues to be controlled by
-- composition_only.

alter table public.services
  add column if not exists composition_source_kind text,
  add column if not exists composition_source_service_id uuid
    references public.services(id) on delete set null,
  add column if not exists composition_source_phase text;

alter table public.services
  drop constraint if exists services_composition_source_kind_check;
alter table public.services
  add constraint services_composition_source_kind_check
  check (composition_source_kind is null or composition_source_kind in ('custom', 'derived'));

alter table public.services
  drop constraint if exists services_composition_source_phase_check;
alter table public.services
  add constraint services_composition_source_phase_check
  check (
    composition_source_phase is null
    or composition_source_phase in ('service', 'initial', 'final')
  );

update public.services
set composition_source_kind = 'custom'
where composition_only = true
  and composition_source_kind is null;

alter table public.services
  drop constraint if exists services_composition_source_contract_check;
alter table public.services
  add constraint services_composition_source_contract_check
  check (
    composition_only = false
    or (
      composition_source_kind = 'custom'
      and composition_source_service_id is null
      and composition_source_phase is null
    )
    or (
      composition_source_kind = 'derived'
      and composition_source_service_id is not null
      and composition_source_phase is not null
    )
  );

create index if not exists services_composition_source_idx
  on public.services (workspace_id, composition_source_service_id)
  where composition_only = true and composition_source_service_id is not null;

comment on column public.services.composition_source_kind is
  'For composition-only services: custom when authored independently, derived when linked to a canonical catalog service or phase.';
comment on column public.services.composition_source_service_id is
  'Canonical source service used to inherit customer-specific price and timing when a private composition service is derived.';
comment on column public.services.composition_source_phase is
  'Source unit for a derived composition service: whole service, initial working phase, or final working phase.';

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

  if exists (
    select 1 from public.services as service
    where service.workspace_id = v_workspace_id
      and service.superseded_by_composition_id is null
      and (p_source_service_id is null or service.id <> p_source_service_id)
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

notify pgrst, 'reload schema';
