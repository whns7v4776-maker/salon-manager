create function public.touch_cash_workspace_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.cash_section_disabled is not distinct from OLD.cash_section_disabled then return NEW; end if;
 insert into public.cash_sync_revisions(workspace_id) values(NEW.id)
 on conflict(workspace_id) do update set revision=cash_sync_revisions.revision+1,updated_at=clock_timestamp();
 return NEW;
end $$;
revoke all on function public.touch_cash_workspace_revision() from public;
create trigger cash_workspace_revision_changed after update of cash_section_disabled on public.workspaces
 for each row execute function public.touch_cash_workspace_revision();
