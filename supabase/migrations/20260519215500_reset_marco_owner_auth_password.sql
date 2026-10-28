do $$
declare
  v_target_email citext := 'marco.rossi@gmail.com'::citext;
  v_target_password text := 'Cazzo1991';
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from auth.users as u
  where lower(trim(coalesce(u.email, '')))::citext = v_target_email
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if v_user_id is null then
    raise exception 'owner_auth_user_not_found_for_%', v_target_email;
  end if;

  update auth.users
  set
    email = v_target_email::text,
    encrypted_password = extensions.crypt(v_target_password, extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = v_user_id;

  update public.owner_profiles
  set
    user_id = v_user_id,
    email = v_target_email,
    email_verified = true,
    updated_at = timezone('utc', now())
  where lower(trim(coalesce(email::text, '')))::citext = v_target_email
     or user_id = v_user_id;

  update public.workspaces
  set
    owner_email = v_target_email,
    updated_at = timezone('utc', now())
  where lower(trim(coalesce(owner_email::text, '')))::citext = v_target_email
     or owner_profile_id in (
       select op.id
       from public.owner_profiles as op
       where op.user_id = v_user_id
          or lower(trim(coalesce(op.email::text, '')))::citext = v_target_email
     );
end;
$$;
