-- Internal tester workspaces keep the real public booking flow available even
-- when their billing subscription is intentionally expired. Ordinary expired
-- workspaces remain excluded from the public operator catalog.

create or replace function public.get_public_operator_catalog_v1(
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
      and (
        workspace.is_internal_tester = true
        or workspace.subscription_status in ('demo', 'active')
      )
    order by
      case
        when workspace.is_internal_tester = true then 0
        when workspace.subscription_status = 'active' then 1
        else 2
      end,
      workspace.updated_at desc nulls last,
      workspace.created_at desc
    limit 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', operator.id,
        'nome', operator.name,
        'mestiere', coalesce(operator.required_role, ''),
        'fotoUri', nullif(trim(coalesce(operator.photo_uri, '')), ''),
        'availability', coalesce(operator.availability, '{}'::jsonb),
        'publicServiceMode', coalesce(policy.mode, 'all_role'),
        'publicServiceIds', coalesce(
          (
            select jsonb_agg(link.service_id order by link.service_id)
            from public.operator_public_service_links as link
            where link.workspace_id = operator.workspace_id
              and link.operator_id = operator.id
          ),
          '[]'::jsonb
        ),
        'publicServiceKeys', '[]'::jsonb
      )
      order by operator.created_at, operator.name
    ),
    '[]'::jsonb
  )
  from public.operators as operator
  join selected_workspace on selected_workspace.id = operator.workspace_id
  left join public.operator_public_booking_policies as policy
    on policy.workspace_id = operator.workspace_id
    and policy.operator_id = operator.id;
$$;

revoke all on function public.get_public_operator_catalog_v1(text) from public;
grant execute on function public.get_public_operator_catalog_v1(text) to anon, authenticated;

