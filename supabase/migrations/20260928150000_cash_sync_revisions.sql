-- Publish a workspace-only invalidation signal, never payment or fiscal secrets.
create table public.cash_sync_revisions (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.cash_sync_revisions enable row level security;
revoke all on public.cash_sync_revisions from anon, authenticated;
grant select on public.cash_sync_revisions to authenticated;
grant all on public.cash_sync_revisions to service_role;
create policy cash_sync_owner_read on public.cash_sync_revisions for select to authenticated
 using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
create function public.touch_cash_sync_revision() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if TG_OP='UPDATE' and (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at') then return NEW; end if;
 if TG_OP='DELETE' then target=OLD.workspace_id; else target=NEW.workspace_id; end if;
 insert into public.cash_sync_revisions(workspace_id) values(target)
 on conflict(workspace_id) do update set revision=cash_sync_revisions.revision+1,updated_at=clock_timestamp();
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
revoke all on function public.touch_cash_sync_revision() from public;
do $$ declare t text; begin
 foreach t in array array['cash_movements','connected_cards','cash_stripe_accounts','cash_stripe_payments','cash_fiscal_settings','cash_fiscal_sandbox'] loop
 execute format('create trigger cash_sync_revision_changed after insert or update or delete on public.%I for each row execute function public.touch_cash_sync_revision()',t);
 end loop;
end $$;
alter publication supabase_realtime add table public.cash_sync_revisions;
