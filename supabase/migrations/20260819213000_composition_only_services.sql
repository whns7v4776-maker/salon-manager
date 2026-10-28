-- Keep private composition building blocks in the canonical service table while
-- making their public exclusion explicit and server authoritative.

alter table public.services
  add column if not exists composition_only boolean not null default false;

comment on column public.services.composition_only is
  'True for salon-owned atomic services that can only be selected while building a composition.';

create or replace function public.create_composition_only_service_v1(
  p_name text,
  p_required_role text,
  p_duration_minutes integer,
  p_price numeric,
  p_phase_config jsonb default null
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
  v_duration integer := greatest(5, least(coalesce(p_duration_minutes, 60), 480));
  v_price numeric(10, 2) := round(greatest(coalesce(p_price, 0), 0)::numeric, 2);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using errcode = '42501', message = 'workspace_access_denied';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'composition_service_name_invalid';
  end if;
  if v_required_role = '' or char_length(v_required_role) > 80 then
    raise exception using errcode = '22023', message = 'composition_service_role_invalid';
  end if;
  if coalesce(p_duration_minutes, 0) not between 5 and 480
    or p_duration_minutes % 5 <> 0
  then
    raise exception using errcode = '22023', message = 'composition_service_duration_invalid';
  end if;
  if coalesce(p_price, -1) < 0 or p_price > 9999 then
    raise exception using errcode = '22023', message = 'composition_service_price_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  if exists (
    select 1
    from public.services as service
    where service.workspace_id = v_workspace_id
      and service.superseded_by_composition_id is null
      and lower(btrim(service.name)) = lower(v_name)
      and lower(btrim(coalesce(service.required_role, ''))) = lower(v_required_role)
  ) then
    raise exception using errcode = '23505', message = 'duplicate_service_name_for_role';
  end if;

  insert into public.services (
    workspace_id,
    name,
    price,
    duration_minutes,
    required_role,
    is_online,
    composition_only,
    phase_config
  ) values (
    v_workspace_id,
    v_name,
    v_price,
    v_duration,
    v_required_role,
    true,
    true,
    p_phase_config
  )
  returning * into v_service;

  return jsonb_build_object(
    'id', v_service.id,
    'name', v_service.name,
    'price', v_service.price,
    'durationMinutes', v_service.duration_minutes,
    'requiredRole', v_service.required_role,
    'phaseConfig', v_service.phase_config,
    'compositionOnly', true
  );
end;
$$;

revoke all on function public.create_composition_only_service_v1(text, text, integer, numeric, jsonb)
  from public;
grant execute on function public.create_composition_only_service_v1(text, text, integer, numeric, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
