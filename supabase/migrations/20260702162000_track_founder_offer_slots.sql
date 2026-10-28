alter table public.subscriptions
add column if not exists founder_offer_locked boolean not null default false;

create index if not exists subscriptions_founder_offer_locked_idx
  on public.subscriptions (founder_offer_locked)
  where founder_offer_locked = true;

drop function if exists public.sync_revenuecat_subscription(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  text,
  public.subscription_plan,
  public.subscription_status,
  boolean,
  timestamptz,
  boolean
);

create or replace function public.sync_revenuecat_subscription(
  p_workspace_id uuid,
  p_owner_email citext,
  p_provider text,
  p_store_platform public.store_platform,
  p_product_id text,
  p_transaction_id text,
  p_original_transaction_id text,
  p_store_customer_ref text,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_trial_used boolean default false,
  p_subscription_ends_at timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_founder_offer_locked boolean default false
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces;
  v_role text := coalesce(auth.role(), '');
begin
  select *
    into v_workspace
  from public.workspaces
  where id = p_workspace_id
    and owner_email = p_owner_email
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  if v_role <> 'service_role' and not exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'workspace_not_authorized';
  end if;

  update public.workspaces
  set
    subscription_plan = p_plan,
    subscription_status = p_status,
    subscription_ends_at = p_subscription_ends_at,
    updated_at = timezone('utc', now())
  where id = p_workspace_id
  returning * into v_workspace;

  insert into public.subscriptions (
    workspace_id,
    provider,
    store_platform,
    external_subscription_id,
    original_transaction_id,
    store_customer_ref,
    plan,
    status,
    trial_used,
    starts_at,
    ends_at,
    last_validated_at,
    cancel_at_period_end,
    founder_offer_locked
  )
  values (
    p_workspace_id,
    coalesce(nullif(p_provider, ''), 'revenuecat'),
    p_store_platform,
    nullif(p_product_id, ''),
    nullif(p_original_transaction_id, ''),
    nullif(p_store_customer_ref, ''),
    p_plan,
    p_status,
    coalesce(p_trial_used, false),
    timezone('utc', now()),
    p_subscription_ends_at,
    timezone('utc', now()),
    coalesce(p_cancel_at_period_end, false),
    coalesce(p_founder_offer_locked, false)
  )
  on conflict (workspace_id)
  do update set
    provider = excluded.provider,
    store_platform = excluded.store_platform,
    external_subscription_id = excluded.external_subscription_id,
    original_transaction_id = excluded.original_transaction_id,
    store_customer_ref = excluded.store_customer_ref,
    plan = excluded.plan,
    status = excluded.status,
    trial_used = public.subscriptions.trial_used or excluded.trial_used,
    ends_at = excluded.ends_at,
    last_validated_at = excluded.last_validated_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    founder_offer_locked = public.subscriptions.founder_offer_locked or excluded.founder_offer_locked,
    updated_at = timezone('utc', now());

  return v_workspace;
end;
$$;

grant execute on function public.sync_revenuecat_subscription(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  text,
  public.subscription_plan,
  public.subscription_status,
  boolean,
  timestamptz,
  boolean,
  boolean
) to authenticated, service_role;

create or replace function public.get_salonpro_launch_offer_status()
returns table (
  founder_limit integer,
  founder_used integer,
  founder_remaining integer,
  founder_available boolean,
  offering_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with usage as (
    select count(*)::integer as used
    from public.subscriptions
    where founder_offer_locked = true
  )
  select
    100 as founder_limit,
    used as founder_used,
    greatest(0, 100 - used) as founder_remaining,
    used < 100 as founder_available,
    case when used < 100 then 'founder' else 'default' end as offering_id
  from usage
$$;

grant execute on function public.get_salonpro_launch_offer_status() to anon, authenticated;
