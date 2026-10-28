-- Keep the registration profile in the canonical workspace record as well as
-- in the derived client portal. Older bootstrap implementations accepted and
-- validated these fields, but omitted them when writing public.workspaces.
alter function public.bootstrap_owner_account(
  text,
  text,
  text,
  text,
  text,
  citext,
  text,
  text,
  text,
  text,
  text
) rename to bootstrap_owner_account_without_workspace_profile_v1;

revoke all on function public.bootstrap_owner_account_without_workspace_profile_v1(
  text,
  text,
  text,
  text,
  text,
  citext,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

create function public.bootstrap_owner_account(
  p_first_name text,
  p_last_name text,
  p_salon_name text,
  p_business_phone text default null,
  p_owner_phone text default null,
  p_owner_email citext default null,
  p_salon_code text default null,
  p_activity_category text default null,
  p_street_line text default null,
  p_city text default null,
  p_postal_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_workspace_id uuid;
  v_email citext;
begin
  -- Preserve the already hardened identity, validation, membership and portal
  -- bootstrap contract, then complete its missing canonical write atomically.
  v_result := public.bootstrap_owner_account_without_workspace_profile_v1(
    p_first_name,
    p_last_name,
    p_salon_name,
    p_business_phone,
    p_owner_phone,
    p_owner_email,
    p_salon_code,
    p_activity_category,
    p_street_line,
    p_city,
    p_postal_code
  );

  v_workspace_id := nullif(v_result ->> 'workspaceId', '')::uuid;
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', p_owner_email::text, '')))::citext;

  if v_workspace_id is null or v_email is null or v_email = ''::citext then
    raise exception 'workspace_owner_identity_missing';
  end if;

  update public.workspaces
  set
    activity_category = trim(p_activity_category),
    street_line = trim(p_street_line),
    city = upper(trim(p_city)),
    postal_code = trim(p_postal_code),
    updated_at = timezone('utc', now())
  where id = v_workspace_id
    and lower(trim(coalesce(owner_email::text, '')))::citext = v_email;

  if not found then
    raise exception 'workspace_owner_identity_mismatch';
  end if;

  return v_result;
end;
$$;

revoke all on function public.bootstrap_owner_account(
  text,
  text,
  text,
  text,
  text,
  citext,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.bootstrap_owner_account(
  text,
  text,
  text,
  text,
  text,
  citext,
  text,
  text,
  text,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';
