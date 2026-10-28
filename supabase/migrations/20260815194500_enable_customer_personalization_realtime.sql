-- Keep owner web and native customer customizations aligned without widening
-- any existing realtime handler. The revision row also turns DELETE operations
-- into a filterable INSERT/UPDATE signal. RLS continues to scope every event to
-- the authenticated workspace.

create table if not exists public.customer_personalization_revisions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid primary key references public.customers(id) on delete cascade,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_personalization_revisions_workspace_idx
  on public.customer_personalization_revisions (workspace_id, updated_at desc);

alter table public.customer_personalization_revisions enable row level security;
grant select on public.customer_personalization_revisions to authenticated;
revoke insert, update, delete on public.customer_personalization_revisions
  from anon, authenticated;

drop policy if exists "workspace data select" on public.customer_personalization_revisions;
create policy "workspace data select"
on public.customer_personalization_revisions for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.touch_customer_personalization_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
begin
  if tg_op = 'DELETE' then
    v_workspace_id := old.workspace_id;
    v_customer_id := old.customer_id;
  else
    v_workspace_id := new.workspace_id;
    v_customer_id := new.customer_id;
  end if;

  -- A customer deletion cascades through the customization tables. Do not
  -- recreate a revision row while its parent customer is being removed.
  if v_workspace_id is not null
     and v_customer_id is not null
     and exists (
       select 1
       from public.customers
       where id = v_customer_id
         and workspace_id = v_workspace_id
     )
  then
    insert into public.customer_personalization_revisions (
      workspace_id,
      customer_id,
      updated_at
    ) values (
      v_workspace_id,
      v_customer_id,
      timezone('utc', now())
    )
    on conflict (customer_id) do update set
      workspace_id = excluded.workspace_id,
      updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.touch_customer_personalization_revision()
  from public, anon, authenticated;

drop trigger if exists customer_duration_override_touch_personalization_revision
  on public.customer_service_duration_overrides;
create trigger customer_duration_override_touch_personalization_revision
after insert or update or delete on public.customer_service_duration_overrides
for each row execute function public.touch_customer_personalization_revision();

drop trigger if exists customer_price_override_touch_personalization_revision
  on public.customer_service_price_overrides;
create trigger customer_price_override_touch_personalization_revision
after insert or update or delete on public.customer_service_price_overrides
for each row execute function public.touch_customer_personalization_revision();

-- The policy row is always upserted once by the atomic online-preferences RPC,
-- so one signal covers both service and composition exception replacements.
drop trigger if exists customer_online_policy_touch_personalization_revision
  on public.customer_online_booking_policies;
create trigger customer_online_policy_touch_personalization_revision
after insert or update or delete on public.customer_online_booking_policies
for each row execute function public.touch_customer_personalization_revision();

do $$
declare
  v_table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach v_table_name in array array[
    'customer_service_duration_overrides',
    'customer_service_price_overrides',
    'customer_online_booking_policies',
    'customer_personalization_revisions'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
