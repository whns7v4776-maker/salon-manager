-- Owner writes use an exact workspace identity and return the row that was
-- actually persisted. This prevents a local optimistic toggle from claiming
-- success when RLS, stale membership or a duplicate workspace blocked the
-- generic table update.

create or replace function public.get_owner_workspace_auto_accept_booking_requests_v1(
  p_workspace_id uuid,
  p_salon_code text
)
returns jsonb
language plpgsql
stable
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
  where workspace.id = p_workspace_id
    and workspace.slug = lower(btrim(coalesce(p_salon_code, '')))
    and (
      lower(btrim(workspace.owner_email::text)) = v_email::text
      or exists (
        select 1
        from public.workspace_members as member
        where member.workspace_id = workspace.id
          and member.user_id = v_user_id
      )
    )
    and (
      workspace.is_internal_tester is true
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

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'salonCode', v_workspace.slug,
    'autoAcceptBookingRequests', coalesce(v_workspace.auto_accept_booking_requests, false),
    'autoAcceptBookingRequestsUpdatedAt', v_workspace.auto_accept_booking_requests_updated_at,
    'updatedAt', v_workspace.updated_at
  );
end;
$$;

revoke all on function public.get_owner_workspace_auto_accept_booking_requests_v1(uuid, text)
  from public;
grant execute on function public.get_owner_workspace_auto_accept_booking_requests_v1(uuid, text)
  to authenticated;

create or replace function public.set_owner_workspace_auto_accept_booking_requests_v1(
  p_workspace_id uuid,
  p_salon_code text,
  p_enabled boolean
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
  v_updated_at timestamptz := clock_timestamp();
begin
  if v_user_id is null or v_email is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'auto_accept_value_required';
  end if;

  select workspace.*
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and workspace.slug = lower(btrim(coalesce(p_salon_code, '')))
    and (
      lower(btrim(workspace.owner_email::text)) = v_email::text
      or exists (
        select 1
        from public.workspace_members as member
        where member.workspace_id = workspace.id
          and member.user_id = v_user_id
      )
    )
    and (
      workspace.is_internal_tester is true
      or (
        workspace.subscription_status = 'active'
        and (
          workspace.subscription_ends_at is null
          or workspace.subscription_ends_at > timezone('utc', now())
        )
      )
    )
  for update;

  if v_workspace.id is null then
    raise exception using errcode = '42501', message = 'workspace_owner_identity_mismatch';
  end if;

  update public.workspaces as workspace
  set auto_accept_booking_requests = p_enabled,
      auto_accept_booking_requests_updated_at = v_updated_at,
      updated_at = v_updated_at
  where workspace.id = v_workspace.id
  returning workspace.* into v_workspace;

  -- Read the exact row again inside the same transaction. The RPC response is
  -- therefore an authoritative post-write read, not an optimistic echo of the
  -- requested value.
  select workspace.*
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and workspace.slug = lower(btrim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace.id is null
    or v_workspace.auto_accept_booking_requests is distinct from p_enabled
    or v_workspace.auto_accept_booking_requests_updated_at is null
  then
    raise exception using errcode = '40001', message = 'auto_accept_write_not_confirmed';
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'salonCode', v_workspace.slug,
    'autoAcceptBookingRequests', v_workspace.auto_accept_booking_requests,
    'autoAcceptBookingRequestsUpdatedAt', v_workspace.auto_accept_booking_requests_updated_at,
    'updatedAt', v_workspace.updated_at
  );
end;
$$;

revoke all on function public.set_owner_workspace_auto_accept_booking_requests_v1(uuid, text, boolean)
  from public;
grant execute on function public.set_owner_workspace_auto_accept_booking_requests_v1(uuid, text, boolean)
  to authenticated;

notify pgrst, 'reload schema';
