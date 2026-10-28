-- Repair a stale owner membership from the authenticated identity itself.
-- The caller can claim only the workspace whose owner email exactly matches
-- the verified email carried by the current Supabase session.

create or replace function public.repair_current_owner_workspace_membership_v1(
  p_salon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email citext := nullif(lower(btrim(auth.jwt() ->> 'email')), '')::citext;
  v_workspace public.workspaces%rowtype;
begin
  if v_user_id is null or v_email is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;

  select workspace.*
  into v_workspace
  from public.workspaces as workspace
  where workspace.slug = lower(btrim(coalesce(p_salon_code, '')))
    and lower(btrim(workspace.owner_email::text)) = v_email::text
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
  limit 1;

  if v_workspace.id is null then
    raise exception using errcode = '42501', message = 'workspace_owner_identity_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace.id::text, 0));

  delete from public.workspace_members as member
  where member.workspace_id = v_workspace.id
     or member.user_id = v_user_id
     or lower(btrim(member.email::text)) = v_email::text;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    email,
    role
  ) values (
    v_workspace.id,
    v_user_id,
    v_email,
    'owner'
  );

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'salonCode', v_workspace.slug,
    'repaired', true
  );
end;
$$;

revoke all on function public.repair_current_owner_workspace_membership_v1(text)
  from public;
grant execute on function public.repair_current_owner_workspace_membership_v1(text)
  to authenticated;

notify pgrst, 'reload schema';
