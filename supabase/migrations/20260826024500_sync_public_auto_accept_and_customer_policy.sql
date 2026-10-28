-- Keep the salon-wide auto-accept preference authoritative for every public
-- client, including internal-tester workspaces whose subscription is expired.
-- The per-customer `inherit` mode must always follow the live workspace row.

do $$
declare
  v_signature regprocedure :=
    'public.get_public_customer_online_booking_policy_v1(text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  v_next := replace(
    v_definition,
    'and workspace.subscription_status in (''demo'', ''active'')',
    'and (workspace.is_internal_tester is true or workspace.subscription_status in (''demo'', ''active''))'
  );

  if position('workspace.is_internal_tester is true' in v_next) = 0 then
    raise exception 'public_customer_online_policy_internal_tester_patch_missing';
  end if;

  if v_next is distinct from v_definition then
    execute v_next;
  end if;
end;
$$;

-- The public portal snapshot used by both app and web previously omitted the
-- live preference after later snapshot-RPC rewrites. Add it to both the full
-- snapshot and the lightweight catalog without copying a cached owner value.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := $anchor$'subscriptionStatus', v_workspace.subscription_status,$anchor$;
  v_replacement text := $replacement$'subscriptionStatus', v_workspace.subscription_status,
        'autoAcceptBookingRequests', coalesce(v_workspace.auto_accept_booking_requests, false),
        'autoAcceptBookingRequestsUpdatedAt', v_workspace.auto_accept_booking_requests_updated_at,$replacement$;
begin
  foreach v_signature in array array[
    'public.get_client_portal_snapshot(text)'::regprocedure,
    'public.get_client_portal_catalog(text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;

    if position('''autoAcceptBookingRequests''' in v_definition) > 0
      and position('''autoAcceptBookingRequestsUpdatedAt''' in v_definition) > 0
    then
      continue;
    end if;

    v_next := replace(v_definition, v_anchor, v_replacement);

    if v_next = v_definition
      or position('''autoAcceptBookingRequests''' in v_next) = 0
      or position('''autoAcceptBookingRequestsUpdatedAt''' in v_next) = 0
    then
      raise exception 'public_portal_auto_accept_patch_anchor_missing:%',
        v_signature::text;
    end if;

    execute v_next;
  end loop;
end;
$$;

-- A small live endpoint gives clients and diagnostics one canonical contract
-- that is independent from portal cache publication. It intentionally exposes
-- only booking preferences, never private workspace data.
create or replace function public.get_public_workspace_booking_preferences_v1(
  p_salon_code text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'salonCode', workspace.slug,
    'autoAcceptBookingRequests', coalesce(workspace.auto_accept_booking_requests, false),
    'autoAcceptBookingRequestsUpdatedAt', workspace.auto_accept_booking_requests_updated_at,
    'updatedAt', workspace.updated_at
  )
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  order by
    case when workspace.subscription_status = 'active' then 0 else 1 end,
    workspace.updated_at desc nulls last,
    workspace.created_at desc nulls last,
    workspace.id desc
  limit 1;
$$;

revoke all on function public.get_public_workspace_booking_preferences_v1(text)
  from public;
grant execute on function public.get_public_workspace_booking_preferences_v1(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
