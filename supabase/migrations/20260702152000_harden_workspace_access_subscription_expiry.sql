create or replace function public.workspace_access_allowed()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
      and w.subscription_status = 'active'
      and (
        w.subscription_ends_at is null
        or w.subscription_ends_at > timezone('utc', now())
      )
  )
$$;
