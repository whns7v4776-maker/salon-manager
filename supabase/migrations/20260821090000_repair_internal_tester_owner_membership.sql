-- An internal tester can keep the same owner email after the Supabase auth
-- identity is recreated. Restore the one-to-one owner membership so every
-- existing owner RPC and RLS policy resolves the canonical workspace again.

do $$
declare
  v_workspace public.workspaces%rowtype;
  v_user_id uuid;
begin
  for v_workspace in
    select workspace.*
    from public.workspaces as workspace
    where workspace.is_internal_tester = true
      and nullif(lower(btrim(workspace.owner_email::text)), '') is not null
  loop
    select auth_user.id
    into v_user_id
    from auth.users as auth_user
    where lower(btrim(auth_user.email)) =
      lower(btrim(v_workspace.owner_email::text))
    order by auth_user.created_at desc, auth_user.id
    limit 1;

    if v_user_id is null then
      continue;
    end if;

    delete from public.workspace_members as member
    where member.workspace_id = v_workspace.id
       or member.user_id = v_user_id
       or lower(btrim(member.email::text)) =
          lower(btrim(v_workspace.owner_email::text));

    insert into public.workspace_members (
      workspace_id,
      user_id,
      email,
      role
    ) values (
      v_workspace.id,
      v_user_id,
      v_workspace.owner_email,
      'owner'
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
