create or replace function public.touch_cash_sync_revision() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if TG_OP='UPDATE' and (to_jsonb(NEW)-'updated_at')=(to_jsonb(OLD)-'updated_at') then return NEW; end if;
 if TG_OP='DELETE' then target=OLD.workspace_id; else target=NEW.workspace_id; end if;
 -- During workspace cascade deletion there is no remaining subscriber scope.
 if not exists(select 1 from public.workspaces where id=target) then
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
 end if;
 insert into public.cash_sync_revisions(workspace_id) values(target)
 on conflict(workspace_id) do update set revision=cash_sync_revisions.revision+1,updated_at=clock_timestamp();
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
