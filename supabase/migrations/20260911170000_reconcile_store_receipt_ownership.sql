-- Receipt lineage survives account deletion; no email, profile or salon data is retained.
alter table public.subscriptions add column store_environment text
  check (store_environment in ('SANDBOX','PRODUCTION'));
create table public.store_receipt_ownership (
  store_platform public.store_platform not null,
  environment text not null check(environment in ('SANDBOX','PRODUCTION')),
  original_transaction_id text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  last_verified_at timestamptz not null,
  trial_used boolean not null default false,
  primary key(store_platform,environment,original_transaction_id)
);
alter table public.store_receipt_ownership enable row level security;
revoke all on public.store_receipt_ownership from public,anon,authenticated;
drop index public.subscriptions_original_transaction_idx;
create unique index subscriptions_original_transaction_idx
  on public.subscriptions(store_platform,coalesce(store_environment,'UNKNOWN'),original_transaction_id)
  where original_transaction_id is not null;

create function public.reconcile_verified_store_snapshot(
  p_workspace_id uuid, p_snapshot jsonb, p_event_id text, p_verified_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  w public.workspaces%rowtype;
  dest public.subscriptions%rowtype;
  previous public.subscriptions%rowtype;
  receipt public.store_receipt_ownership%rowtype;
  env text := p_snapshot->>'environment';
  platform public.store_platform := (p_snapshot->>'platform')::public.store_platform;
  original_id text := nullif(trim(p_snapshot->>'originalTransactionId'),'');
  ends timestamptz := (p_snapshot->>'endsAt')::timestamptz;
  active boolean := coalesce((p_snapshot->>'active')::boolean,false) and ends > now();
  trial boolean := coalesce((p_snapshot->>'trialUsed')::boolean,false);
  legacy_env text := p_snapshot->>'verifiedLegacyEnvironment';
  founder_paid timestamptz := (p_snapshot->>'founderPaidAt')::timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'workspace_not_authorized'; end if;
  if env not in ('SANDBOX','PRODUCTION') or env is null or platform not in ('ios','android')
    or p_verified_at is null or nullif(p_event_id,'') is null then raise exception 'invalid_verified_store_snapshot'; end if;
  -- Billing events are low volume. Serialize reconciliation to make receipt moves atomic.
  perform pg_advisory_xact_lock(7202609111700);
  select * into w from public.workspaces where id=p_workspace_id for update;
  if not found then return jsonb_build_object('ignored','workspace_deleted'); end if;
  select * into dest from public.subscriptions where workspace_id=p_workspace_id for update;
  if dest.last_store_event_at > p_verified_at then return jsonb_build_object('ignored','stale_snapshot'); end if;
  if (dest.store_environment='PRODUCTION' or (dest.store_environment is null and (dest.founder_paid_at is not null or not coalesce(legacy_env='SANDBOX' and original_id=dest.original_transaction_id,false)))) and dest.status='active' and dest.ends_at>now() and env='SANDBOX' then
    return jsonb_build_object('ignored','production_access_preserved');
  end if;
  if original_id is not null then
    select * into previous from public.subscriptions where store_platform=platform
      and original_transaction_id=original_id and store_environment is null for update;
    if found then
      if legacy_env not in ('SANDBOX','PRODUCTION') or legacy_env is null then raise exception 'legacy_receipt_verification_required'; end if;
      update public.subscriptions set store_environment=legacy_env where id=previous.id;
    end if;
    select * into receipt from public.store_receipt_ownership
      where store_platform=platform and environment=env and original_transaction_id=original_id for update;
    if receipt.last_verified_at > p_verified_at then return jsonb_build_object('ignored','stale_receipt_snapshot'); end if;
    select * into previous from public.subscriptions where store_platform=platform and store_environment=env
      and original_transaction_id=original_id and workspace_id<>p_workspace_id for update;
    if found then
      if not active then return jsonb_build_object('ignored','receipt_owned_by_other_workspace'); end if;
      trial := trial or previous.trial_used;
      -- Revoke only the exact transferred receipt, never another plan on the old account.
      update public.subscriptions set original_transaction_id=null,status='expired',ends_at=least(coalesce(ends_at,now()),now()),
        founder_paid_at=null,last_store_event_at=p_verified_at,last_store_event_id=p_event_id where id=previous.id;
      update public.workspaces set subscription_status='expired',subscription_ends_at=now() where id=previous.workspace_id;
      if env='PRODUCTION' then founder_paid:=coalesce(founder_paid,previous.founder_paid_at); end if;
    end if;
    trial := trial or coalesce(receipt.trial_used,false);
  end if;
  -- Keep the existing event reconciliation and access contract as the single write path.
  perform public.sync_revenuecat_subscription_event(
    p_workspace_id,w.owner_email,'revenuecat',platform,p_snapshot->>'productId',null,original_id,
    'workspace:'||p_workspace_id,'pro',case when active then 'active'::public.subscription_status else 'expired'::public.subscription_status end,
    p_event_id,p_verified_at,trial,ends,coalesce((p_snapshot->>'cancelAtPeriodEnd')::boolean,false),
    coalesce((p_snapshot->>'founderOfferLocked')::boolean,false),founder_paid
  );
  update public.subscriptions set store_environment=env where workspace_id=p_workspace_id;
  if original_id is not null then
    insert into public.store_receipt_ownership values(platform,env,original_id,p_workspace_id,p_verified_at,trial)
    on conflict(store_platform,environment,original_transaction_id) do update
      set workspace_id=excluded.workspace_id,last_verified_at=excluded.last_verified_at,
          trial_used=public.store_receipt_ownership.trial_used or excluded.trial_used;
  end if;
  return jsonb_build_object('active',active,'workspaceId',p_workspace_id);
end $$;
revoke all on function public.reconcile_verified_store_snapshot(uuid,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reconcile_verified_store_snapshot(uuid,jsonb,text,timestamptz) to service_role;
notify pgrst,'reload schema';
