-- Internal tester workspaces must remain usable independently from store
-- subscription events. This is an explicit access override, not a paid or
-- active subscription, so it does not consume founder-offer slots.
alter table public.workspaces
add column if not exists is_internal_tester boolean not null default false;

comment on column public.workspaces.is_internal_tester is
  'Explicit internal tester access override. Does not represent a paid subscription.';

update public.workspaces
set
  is_internal_tester = true,
  updated_at = timezone('utc', now())
where id = 'd84f3211-d20f-45a3-9d7f-f551400690fd'::uuid;

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
      and (
        w.is_internal_tester = true
        or (
          w.subscription_status = 'active'
          and (
            w.subscription_ends_at is null
            or w.subscription_ends_at > timezone('utc', now())
          )
        )
      )
  )
$$;
