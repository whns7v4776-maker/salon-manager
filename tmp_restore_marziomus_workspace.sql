do $$
declare
  v_workspace_id uuid;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where lower(trim(owner_email::text)) = 'marziomus@gmail.com'
  order by updated_at desc
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
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
