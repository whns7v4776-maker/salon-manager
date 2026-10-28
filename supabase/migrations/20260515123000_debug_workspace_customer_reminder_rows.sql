create or replace function public.debug_workspace_customer_reminder_rows(
  p_salon_code text
)
returns table (
  workspace_id uuid,
  owner_email citext,
  slug text,
  workspace_customer_reminder_hours_before integer,
  workspace_updated_at timestamptz,
  client_portal_customer_reminder_hours_before integer,
  client_portal_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    w.id as workspace_id,
    w.owner_email,
    w.slug,
    w.customer_reminder_hours_before as workspace_customer_reminder_hours_before,
    w.updated_at as workspace_updated_at,
    cp.customer_reminder_hours_before as client_portal_customer_reminder_hours_before,
    cp.updated_at as client_portal_updated_at
  from public.workspaces as w
  left join public.client_portals as cp
    on cp.workspace_id = w.id
  where lower(trim(coalesce(w.slug, ''))) = lower(trim(coalesce(p_salon_code, '')))
  order by w.updated_at desc nulls last, w.created_at desc nulls last, w.id desc;
$$;

grant execute on function public.debug_workspace_customer_reminder_rows(text) to authenticated;
