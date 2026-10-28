create or replace function public.check_owner_registration_duplicate(
  p_owner_email citext default null,
  p_business_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_email citext := nullif(lower(trim(coalesce(p_owner_email::text, ''))), '')::citext;
  v_business_phone text := nullif(right(regexp_replace(coalesce(p_business_phone, ''), '\D+', '', 'g'), 10), '');
  v_email_taken boolean := false;
  v_phone_taken boolean := false;
  v_status text := null;
begin
  if v_owner_email is null and v_business_phone is null then
    return jsonb_build_object(
      'emailTaken', false,
      'phoneTaken', false,
      'subscriptionStatus', null
    );
  end if;

  if v_owner_email is not null then
    select exists (
      select 1
      from public.owner_profiles as owner_profile
      where lower(trim(coalesce(owner_profile.email::text, ''))) = v_owner_email::text
    )
    or exists (
      select 1
      from public.workspaces as workspace
      where lower(trim(coalesce(workspace.owner_email::text, ''))) = v_owner_email::text
    )
    or exists (
      select 1
      from public.client_portals as portal
      where lower(trim(coalesce(portal.owner_email::text, ''))) = v_owner_email::text
    )
    into v_email_taken;
  end if;

  if v_business_phone is not null then
    select exists (
      select 1
      from public.owner_profiles as owner_profile
      where right(regexp_replace(coalesce(owner_profile.phone, owner_profile.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
         or right(regexp_replace(coalesce(owner_profile.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
    )
    or exists (
      select 1
      from public.workspaces as workspace
      where right(regexp_replace(coalesce(workspace.owner_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
    )
    or exists (
      select 1
      from public.client_portals as portal
      where right(regexp_replace(coalesce(portal.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
    )
    into v_phone_taken;
  end if;

  select workspace.subscription_status::text
  into v_status
  from public.workspaces as workspace
  where (
      v_owner_email is not null
      and lower(trim(coalesce(workspace.owner_email::text, ''))) = v_owner_email::text
    )
    or (
      v_business_phone is not null
      and right(regexp_replace(coalesce(workspace.owner_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
    )
  order by
    case workspace.subscription_status
      when 'active' then 0
      when 'demo' then 1
      when 'suspended' then 2
      when 'expired' then 3
      else 4
    end,
    workspace.updated_at desc,
    workspace.created_at desc
  limit 1;

  if v_status is null then
    select portal.subscription_status::text
    into v_status
    from public.client_portals as portal
    where (
        v_owner_email is not null
        and lower(trim(coalesce(portal.owner_email::text, ''))) = v_owner_email::text
      )
      or (
        v_business_phone is not null
        and right(regexp_replace(coalesce(portal.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
      )
    order by
      case portal.subscription_status
        when 'active' then 0
        when 'demo' then 1
        when 'suspended' then 2
        when 'expired' then 3
        else 4
      end,
      portal.updated_at desc,
      portal.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'emailTaken', coalesce(v_email_taken, false),
    'phoneTaken', coalesce(v_phone_taken, false),
    'subscriptionStatus', v_status
  );
end;
$$;

grant execute on function public.check_owner_registration_duplicate(citext, text) to anon, authenticated;

create or replace function public.bootstrap_owner_account(
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
  v_user_id uuid;
  v_email citext;
  v_workspace_id uuid;
  v_owner_profile_id uuid;
  v_salon_name text;
  v_salon_code text;
  v_activity_category text;
  v_street_line text;
  v_city text;
  v_postal_code text;
  v_salon_address text;
  v_business_phone text;
  v_existing_portal public.client_portals%rowtype;
  v_phone_conflict_exists boolean := false;
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

  v_activity_category := trim(coalesce(p_activity_category, ''));
  v_street_line := trim(coalesce(p_street_line, ''));
  v_city := upper(trim(coalesce(p_city, '')));
  v_postal_code := trim(coalesce(p_postal_code, ''));
  v_business_phone := nullif(right(regexp_replace(coalesce(p_business_phone, p_owner_phone, ''), '\D+', '', 'g'), 10), '');

  if v_activity_category = '' then
    raise exception 'activity_category_required';
  end if;

  if v_street_line = '' then
    raise exception 'street_line_required';
  end if;

  if v_city = '' then
    raise exception 'city_required';
  end if;

  if v_postal_code = '' then
    raise exception 'postal_code_required';
  end if;

  if v_business_phone is not null then
    select exists (
      select 1
      from public.workspaces as workspace
      left join public.workspace_members as workspace_member
        on workspace_member.workspace_id = workspace.id
      where right(regexp_replace(coalesce(workspace.owner_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
        and lower(trim(coalesce(workspace.owner_email::text, ''))) <> v_email::text
        and lower(trim(coalesce(workspace_member.email::text, ''))) <> v_email::text
    )
    or exists (
      select 1
      from public.owner_profiles as owner_profile
      where (
          right(regexp_replace(coalesce(owner_profile.phone, ''), '\D+', '', 'g'), 10) = v_business_phone
          or right(regexp_replace(coalesce(owner_profile.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
        )
        and lower(trim(coalesce(owner_profile.email::text, ''))) <> v_email::text
    )
    or exists (
      select 1
      from public.client_portals as portal
      where right(regexp_replace(coalesce(portal.business_phone, ''), '\D+', '', 'g'), 10) = v_business_phone
        and lower(trim(coalesce(portal.owner_email::text, ''))) <> v_email::text
    )
    into v_phone_conflict_exists;

    if v_phone_conflict_exists then
      raise exception 'owner_duplicate_phone';
    end if;
  end if;

  v_salon_address := trim(concat_ws(', ', v_street_line, concat_ws(' ', v_postal_code, v_city)));

  select op.id
  into v_owner_profile_id
  from public.owner_profiles as op
  where lower(trim(coalesce(op.email::text, '')))::citext = v_email
  order by op.updated_at desc, op.created_at desc
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
  where wm.email = v_email
     or w.owner_email = v_email
     or w.owner_profile_id = v_owner_profile_id
  order by
    case
      when wm.email = v_email then 0
      when w.owner_email = v_email then 1
      when w.owner_profile_id = v_owner_profile_id then 2
      else 3
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
      salon_name = v_salon_name,
      slug = v_salon_code,
      owner_email = v_email,
      owner_phone = coalesce(nullif(trim(coalesce(p_business_phone, '')), ''), owner_phone),
      owner_profile_id = v_owner_profile_id,
      updated_at = timezone('utc', now())
    where id = v_workspace_id;
  end if;

  select *
  into v_existing_portal
  from public.client_portals
  where workspace_id = v_workspace_id
  limit 1;

  insert into public.client_portals (
    workspace_id,
    owner_email,
    salon_code,
    salon_name,
    salon_name_display_style,
    salon_name_font_variant,
    business_phone,
    activity_category,
    salon_address,
    street_type,
    street_name,
    street_number,
    city,
    postal_code,
    subscription_plan,
    subscription_status,
    clienti,
    appuntamenti,
    servizi,
    operatori,
    richieste_prenotazione,
    availability_settings
  )
  values (
    v_workspace_id,
    v_email,
    v_salon_code,
    v_salon_name,
    coalesce(nullif(v_existing_portal.salon_name_display_style, ''), 'corsivo'),
    coalesce(nullif(v_existing_portal.salon_name_font_variant, ''), 'neon'),
    trim(coalesce(p_business_phone, '')),
    v_activity_category,
    v_salon_address,
    '',
    v_street_line,
    '',
    v_city,
    v_postal_code,
    coalesce(v_existing_portal.subscription_plan, 'starter'::public.subscription_plan),
    coalesce(v_existing_portal.subscription_status, 'active'::public.subscription_status),
    coalesce(v_existing_portal.clienti, '[]'::jsonb),
    coalesce(v_existing_portal.appuntamenti, '[]'::jsonb),
    coalesce(v_existing_portal.servizi, '[]'::jsonb),
    coalesce(v_existing_portal.operatori, '[]'::jsonb),
    coalesce(v_existing_portal.richieste_prenotazione, '[]'::jsonb),
    coalesce(v_existing_portal.availability_settings, '{}'::jsonb)
  )
  on conflict (workspace_id)
  do update set
    owner_email = excluded.owner_email,
    salon_code = excluded.salon_code,
    salon_name = excluded.salon_name,
    business_phone = excluded.business_phone,
    activity_category = excluded.activity_category,
    salon_address = excluded.salon_address,
    street_name = excluded.street_name,
    city = excluded.city,
    postal_code = excluded.postal_code,
    updated_at = timezone('utc', now());

  delete from public.workspace_members
  where email = v_email
     or (workspace_id = v_workspace_id and user_id = v_user_id);

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
  )
  on conflict do nothing;

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
  text,
  text,
  text,
  text,
  text
) to authenticated;
