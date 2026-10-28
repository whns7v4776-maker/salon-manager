-- Owner access is valid only while a real subscription/trial has a future end.
-- Internal testers remain the only explicit non-expiring bypass.
-- This migration does not delete accounts and does not rewrite existing plans.

begin;

alter table public.subscriptions
  add column if not exists last_store_event_id text,
  add column if not exists last_store_event_at timestamptz;

create unique index if not exists subscriptions_last_store_event_id_idx
  on public.subscriptions (last_store_event_id)
  where last_store_event_id is not null;

create or replace function public.workspace_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces as workspace
    left join public.workspace_members as member
      on member.workspace_id = workspace.id
     and member.user_id = auth.uid()
    where (
        member.user_id is not null
        or lower(btrim(workspace.owner_email::text)) =
           lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        workspace.is_internal_tester = true
        or (
          workspace.subscription_status = 'active'
          and workspace.subscription_ends_at is not null
          and workspace.subscription_ends_at > timezone('utc', now())
        )
      )
  )
$$;

create or replace function public.enforce_active_workspace_operational_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_workspace_id :=
    case
      when tg_op = 'DELETE' then old.workspace_id
      else new.workspace_id
    end;

  if v_workspace_id is null or not exists (
    select 1
    from public.workspaces as workspace
    where workspace.id = v_workspace_id
      and (
        workspace.is_internal_tester = true
        or (
          workspace.subscription_status = 'active'
          and workspace.subscription_ends_at is not null
          and workspace.subscription_ends_at > timezone('utc', now())
        )
      )
  ) then
    raise exception 'workspace_access_denied';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_revenuecat_subscription_event(
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
  p_event_id text,
  p_event_at timestamptz,
  p_trial_used boolean default false,
  p_subscription_ends_at timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_founder_offer_locked boolean default false,
  p_founder_paid_at timestamptz default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
  v_previous_event_id text;
  v_previous_event_at timestamptz;
  v_event_id text := nullif(btrim(coalesce(p_event_id, '')), '');
  v_event_at timestamptz := coalesce(p_event_at, timezone('utc', now()));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'workspace_not_authorized';
  end if;

  select *
    into v_workspace
  from public.workspaces
  where id = p_workspace_id
    and owner_email = p_owner_email
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  select subscription.last_store_event_id, subscription.last_store_event_at
    into v_previous_event_id, v_previous_event_at
  from public.subscriptions as subscription
  where subscription.workspace_id = p_workspace_id
  for update;

  if v_event_id is not null and v_previous_event_id = v_event_id then
    return v_workspace;
  end if;

  if v_previous_event_at is not null and v_event_at < v_previous_event_at then
    return v_workspace;
  end if;

  update public.workspaces
  set
    subscription_plan = p_plan,
    subscription_status = p_status,
    trial_ends_at = case
      when coalesce(p_trial_used, false) and p_subscription_ends_at is not null
        then p_subscription_ends_at
      else trial_ends_at
    end,
    subscription_ends_at = coalesce(p_subscription_ends_at, subscription_ends_at),
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
    founder_offer_locked,
    founder_paid_at,
    last_store_event_id,
    last_store_event_at
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
    coalesce(p_founder_offer_locked, false),
    p_founder_paid_at,
    v_event_id,
    v_event_at
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
    ends_at = coalesce(excluded.ends_at, public.subscriptions.ends_at),
    last_validated_at = excluded.last_validated_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    founder_offer_locked =
      public.subscriptions.founder_offer_locked or excluded.founder_offer_locked,
    founder_paid_at =
      coalesce(public.subscriptions.founder_paid_at, excluded.founder_paid_at),
    last_store_event_id =
      coalesce(excluded.last_store_event_id, public.subscriptions.last_store_event_id),
    last_store_event_at =
      greatest(excluded.last_store_event_at, public.subscriptions.last_store_event_at),
    updated_at = timezone('utc', now());

  return v_workspace;
end;
$$;

revoke all on function public.sync_revenuecat_subscription_event(
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
  text,
  timestamptz,
  boolean,
  timestamptz,
  boolean,
  boolean,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.sync_revenuecat_subscription_event(
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
  text,
  timestamptz,
  boolean,
  timestamptz,
  boolean,
  boolean,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;
