-- Treat an explicit selected-service link as a hard capability grant, even
-- when the service is outside the operator's primary display role. In
-- all-role mode the primary role remains the boundary.
--
-- Also repair stale operator ids in public portal snapshots by matching the
-- canonical operator name inside the same workspace. No appointments or
-- booking requests are rewritten.

create or replace function public.public_operator_can_book_service_v1(
  p_workspace_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_requested_service_name text,
  p_required_role text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_operator public.operators%rowtype;
  v_service_id uuid;
  v_service_role text;
  v_mode text;
  v_requested_role text := nullif(lower(trim(coalesce(p_required_role, ''))), '');
begin
  select operator.*
  into v_operator
  from public.operators as operator
  where operator.workspace_id = p_workspace_id
    and (
      (
        trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and operator.id = case
          when trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then trim(p_operator_id)::uuid
          else null
        end
      )
      or (
        nullif(lower(trim(coalesce(p_operator_name, ''))), '') is not null
        and lower(trim(operator.name)) = lower(trim(p_operator_name))
      )
    )
  order by case when operator.id::text = trim(coalesce(p_operator_id, '')) then 0 else 1 end
  limit 1;

  if v_operator.id is null then
    return false;
  end if;

  select service.id, nullif(lower(trim(coalesce(service.required_role, ''))), '')
  into v_service_id, v_service_role
  from public.services as service
  where service.workspace_id = p_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_requested_service_name, '')))
    and coalesce(service.is_online, true)
  order by
    case
      when v_requested_role is not null
        and lower(trim(coalesce(service.required_role, ''))) = v_requested_role
        then 0
      else 1
    end,
    service.updated_at desc
  limit 1;

  select policy.mode
  into v_mode
  from public.operator_public_booking_policies as policy
  where policy.workspace_id = p_workspace_id
    and policy.operator_id = v_operator.id;

  if coalesce(v_mode, 'all_role') = 'selected' then
    return v_service_id is not null and exists (
      select 1
      from public.operator_public_service_links as link
      where link.workspace_id = p_workspace_id
        and link.operator_id = v_operator.id
        and link.service_id = v_service_id
    );
  end if;

  -- Backwards-compatible all-role policy: the primary operator role must
  -- match the requested/service role. A catalog miss remains open only when
  -- no role was supplied, matching the previous legacy behavior.
  if coalesce(v_requested_role, v_service_role) is null then
    return true;
  end if;

  return lower(trim(coalesce(v_operator.required_role, ''))) =
    coalesce(v_requested_role, v_service_role);
end;
$$;

revoke all on function public.public_operator_can_book_service_v1(uuid, text, text, text, text)
  from public;

-- Repair only the public catalog copy. Canonical operator rows, historical
-- appointments and booking requests stay untouched.
with repaired as (
  select portal.workspace_id,
  (
  select coalesce(
    jsonb_agg(
      case
        when canonical.id is null then item.value
        else jsonb_set(item.value, '{id}', to_jsonb(canonical.id::text), true)
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  ) as operatori
  from jsonb_array_elements(coalesce(portal.operatori, '[]'::jsonb))
    with ordinality as item(value, ordinality)
  left join lateral (
    select operator.id
    from public.operators as operator
    where operator.workspace_id = portal.workspace_id
      and lower(trim(operator.name)) = lower(trim(coalesce(item.value ->> 'nome', item.value ->> 'name', '')))
    order by operator.updated_at desc nulls last, operator.created_at desc
    limit 1
  ) as canonical on true
  ) as operatori
  from public.client_portals as portal
)
update public.client_portals as portal
set operatori = repaired.operatori
from repaired
where repaired.workspace_id = portal.workspace_id
  and portal.operatori is distinct from repaired.operatori;

notify pgrst, 'reload schema';
