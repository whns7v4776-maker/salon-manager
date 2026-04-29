do $$
declare
  v_workspace_id uuid;
  v_conflict_workspace_id uuid;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where owner_email = 'marziomus@gmail.com'::citext
  limit 1;

  if v_workspace_id is null then
    raise exception 'restore_marziomus_workspace_slug: workspace_not_found';
  end if;

  select id
  into v_conflict_workspace_id
  from public.workspaces
  where slug = 'barberia-lcom'
    and id <> v_workspace_id
  limit 1;

  if v_conflict_workspace_id is not null then
    raise exception 'restore_marziomus_workspace_slug: slug_conflict %', v_conflict_workspace_id;
  end if;

  update public.workspaces
  set
    slug = 'barberia-lcom',
    salon_name = 'Barberia Lcom',
    owner_email = 'marziomus@gmail.com'::citext,
    updated_at = timezone('utc', now())
  where id = v_workspace_id;

  update public.client_portals
  set
    salon_code = 'barberia-lcom',
    salon_name = 'Barberia Lcom',
    owner_email = 'marziomus@gmail.com'::citext,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id;
end $$;
