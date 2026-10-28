-- Keep the operational write guard aligned with workspace_access_allowed():
-- explicitly authorized internal testers remain writable even when their
-- synthetic subscription has expired.

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
          and (
            workspace.subscription_ends_at is null
            or workspace.subscription_ends_at > timezone('utc', now())
          )
        )
      )
  ) then
    raise exception 'workspace_access_denied';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_active_workspace_operational_write() from public;

notify pgrst, 'reload schema';
