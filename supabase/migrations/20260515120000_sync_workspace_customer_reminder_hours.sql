create or replace function public.sync_workspace_customer_reminder_hours(
  p_salon_code text default null,
  p_hours integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_email citext;
  v_salon_code text;
  v_hours integer;
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if public.current_workspace_id() is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select w.*
  into v_workspace
  from public.workspaces as w
  where w.id = public.current_workspace_id()
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_owner_email := v_workspace.owner_email;
  v_salon_code := lower(trim(coalesce(p_salon_code, v_workspace.slug, '')));
  v_hours := greatest(0, least(168, coalesce(p_hours, v_workspace.customer_reminder_hours_before, 24)));

  if v_owner_email is null or v_owner_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  if v_salon_code = '' then
    raise exception 'salon_code_required';
  end if;

  update public.workspaces as w
  set
    customer_reminder_hours_before = v_hours,
    updated_at = timezone('utc', now())
  where w.owner_email = v_owner_email
    and lower(trim(coalesce(w.slug, ''))) = v_salon_code;

  get diagnostics v_updated_count = row_count;

  update public.client_portals as portal
  set
    customer_reminder_hours_before = v_hours,
    updated_at = timezone('utc', now())
  where portal.workspace_id in (
    select w.id
    from public.workspaces as w
    where w.owner_email = v_owner_email
      and lower(trim(coalesce(w.slug, ''))) = v_salon_code
  );

  return v_updated_count;
end;
$$;

grant execute on function public.sync_workspace_customer_reminder_hours(text, integer) to authenticated;
