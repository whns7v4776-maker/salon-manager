create or replace function public.bootstrap_owner_account(
  p_first_name text,
  p_last_name text,
  p_salon_name text,
  p_business_phone text default null,
  p_owner_phone text default null,
  p_owner_email citext default null,
  p_salon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email citext;
  v_workspace_id uuid;
  v_owner_profile_id uuid;
  v_salon_name text;
  v_salon_code text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select lower(trim(coalesce(auth.jwt() ->> 'email', p_owner_email::text, '')))::citext
  into v_email;

  if v_email is null or v_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  v_salon_name := trim(coalesce(p_salon_name, ''));
  if v_salon_name = '' then
    raise exception 'salon_name_required';
  end if;

  v_salon_code := lower(trim(coalesce(p_salon_code, '')));
  if v_salon_code = '' then
    raise exception 'salon_code_required';
  end if;

  select op.id
  into v_owner_profile_id
  from public.owner_profiles as op
  where op.user_id = v_user_id
     or op.email = v_email
  order by
    case
      when op.user_id = v_user_id then 0
      when op.email = v_email then 1
      else 2
    end,
    op.updated_at desc,
    op.created_at desc
  limit 1;

  if v_owner_profile_id is null then
    insert into public.owner_profiles (
      user_id,
      email,
      phone,
      first_name,
      last_name,
      business_phone,
      auth_provider,
      email_verified
    )
    values (
      v_user_id,
      v_email,
      nullif(trim(coalesce(p_owner_phone, '')), ''),
      trim(coalesce(p_first_name, '')),
      trim(coalesce(p_last_name, '')),
      nullif(trim(coalesce(p_business_phone, '')), ''),
      'email',
      true
    )
    returning id into v_owner_profile_id;
  else
    update public.owner_profiles
    set
      user_id = v_user_id,
      email = v_email,
      phone = coalesce(nullif(trim(coalesce(p_owner_phone, '')), ''), phone),
      first_name = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
      last_name = coalesce(nullif(trim(coalesce(p_last_name, '')), ''), last_name),
      business_phone = coalesce(nullif(trim(coalesce(p_business_phone, '')), ''), business_phone),
      email_verified = true,
      updated_at = timezone('utc', now())
    where id = v_owner_profile_id;
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  left join public.workspace_members as wm on wm.workspace_id = w.id
  where wm.user_id = v_user_id
     or wm.email = v_email
     or w.owner_email = v_email
     or w.owner_profile_id = v_owner_profile_id
  order by
    case
      when wm.user_id = v_user_id then 0
      when wm.email = v_email then 1
      when w.owner_email = v_email then 2
      when w.owner_profile_id = v_owner_profile_id then 3
      else 4
    end,
    w.updated_at desc,
    w.created_at desc
  limit 1;

  if v_workspace_id is null then
    insert into public.workspaces (
      salon_name,
      slug,
      owner_email,
      owner_phone,
      owner_profile_id,
      subscription_plan,
      subscription_status
    )
    values (
      v_salon_name,
      v_salon_code,
      v_email,
      nullif(trim(coalesce(p_business_phone, '')), ''),
      v_owner_profile_id,
      'demo',
      'demo'
    )
    returning id into v_workspace_id;
  else
    update public.workspaces
    set
      owner_email = v_email,
      owner_phone = coalesce(nullif(trim(coalesce(p_business_phone, '')), ''), owner_phone),
      owner_profile_id = v_owner_profile_id,
      updated_at = timezone('utc', now())
    where id = v_workspace_id;
  end if;

  delete from public.workspace_members
  where user_id = v_user_id
     or email = v_email
     or workspace_id = v_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    email,
    role
  )
  values (
    v_workspace_id,
    v_user_id,
    v_email,
    'owner'
  );

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'ownerProfileId', v_owner_profile_id,
    'ownerEmail', v_email,
    'salonCode', v_salon_code
  );
end;
$$;

grant execute on function public.bootstrap_owner_account(
  text,
  text,
  text,
  text,
  text,
  citext,
  text
) to authenticated;
