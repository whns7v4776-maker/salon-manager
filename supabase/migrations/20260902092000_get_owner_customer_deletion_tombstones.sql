begin;

-- An authenticated owner needs the deletion authority again after logout,
-- reinstall, or when opening another device. The raw tombstone table remains
-- private; this RPC exposes only the identities for the exact open workspace.
create or replace function public.get_owner_customer_deletion_tombstones_v1(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_tombstones jsonb;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'owner_session_required';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and (
      lower(btrim(workspace.owner_email::text)) =
        lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      or exists (
        select 1
        from public.workspace_members as member
        where member.workspace_id = workspace.id
          and member.user_id = auth.uid()
      )
    )
    and public.workspace_access_allowed();

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customer_id', tombstone.customer_id,
        'normalized_name', tombstone.normalized_name,
        'created_at', tombstone.created_at
      )
      order by tombstone.created_at, tombstone.normalized_name
    ),
    '[]'::jsonb
  )
  into v_tombstones
  from public.customer_deletion_tombstones as tombstone
  where tombstone.workspace_id = v_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'workspace_id', v_workspace_id,
    'tombstones', v_tombstones
  );
end;
$$;

revoke all on function public.get_owner_customer_deletion_tombstones_v1(uuid)
from public, anon, service_role;
grant execute on function public.get_owner_customer_deletion_tombstones_v1(uuid)
to authenticated;

commit;
