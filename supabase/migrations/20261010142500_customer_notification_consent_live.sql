-- Publish only consent state. Session heartbeats and customer contact details
-- must not fan out to the agenda, badges, or unrelated owner subscriptions.
create table if not exists public.customer_notification_consent_updates (
  id uuid primary key references public.customers(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  notification_permission text check (
    notification_permission is null or notification_permission in ('granted', 'denied', 'undetermined')
  ),
  notification_permission_checked_at timestamptz
);

create index if not exists customer_notification_consent_updates_workspace_idx
  on public.customer_notification_consent_updates(workspace_id);

alter table public.customer_notification_consent_updates enable row level security;
revoke all on public.customer_notification_consent_updates from anon, authenticated;
grant select on public.customer_notification_consent_updates to authenticated;
grant all on public.customer_notification_consent_updates to service_role;

drop policy if exists customer_notification_consent_updates_owner_read
  on public.customer_notification_consent_updates;
create policy customer_notification_consent_updates_owner_read
  on public.customer_notification_consent_updates for select to authenticated
  using (workspace_id = public.current_workspace_id());

create or replace function public.sync_customer_notification_consent_update_v1()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.customer_notification_consent_updates (
    id, workspace_id, notification_permission, notification_permission_checked_at
  ) values (
    new.id, new.workspace_id, new.notification_permission, new.notification_permission_checked_at
  ) on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    notification_permission = excluded.notification_permission,
    notification_permission_checked_at = excluded.notification_permission_checked_at;
  return new;
end;
$$;
revoke all on function public.sync_customer_notification_consent_update_v1() from public, anon, authenticated;

drop trigger if exists customer_notification_consent_live_insert on public.customers;
create trigger customer_notification_consent_live_insert
  after insert on public.customers for each row
  when (new.notification_permission_checked_at is not null)
  execute function public.sync_customer_notification_consent_update_v1();

drop trigger if exists customer_notification_consent_live_update on public.customers;
create trigger customer_notification_consent_live_update
  after update on public.customers for each row
  when (
    old.notification_permission is distinct from new.notification_permission
    or old.notification_permission_checked_at is distinct from new.notification_permission_checked_at
    or old.workspace_id is distinct from new.workspace_id
  ) execute function public.sync_customer_notification_consent_update_v1();

-- Copy only already recorded consent; never infer it from a login or push token.
insert into public.customer_notification_consent_updates (
  id, workspace_id, notification_permission, notification_permission_checked_at
) select id, workspace_id, notification_permission, notification_permission_checked_at
  from public.customers where notification_permission_checked_at is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  notification_permission = excluded.notification_permission,
  notification_permission_checked_at = excluded.notification_permission_checked_at;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'customer_notification_consent_updates'
    ) then
    alter publication supabase_realtime add table public.customer_notification_consent_updates;
  end if;
end;
$$;
