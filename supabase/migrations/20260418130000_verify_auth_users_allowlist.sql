do $$
declare
  v_auth_users_remaining integer;
begin
  select count(*)
  into v_auth_users_remaining
  from auth.users as user_record
  where
    nullif(lower(trim(coalesce(user_record.email, ''))), '')::citext is null
    or nullif(lower(trim(coalesce(user_record.email, ''))), '')::citext not in (
      'michelle_91_@hotmail.it'::citext,
      'felicecristiano331@gmail.com'::citext,
      'mchiaramacri97@gmail.com'::citext
    );

  if v_auth_users_remaining > 0 then
    raise exception 'auth_users_cleanup_failed:%', v_auth_users_remaining;
  end if;

  raise notice 'auth_users_cleanup_verified: only allowlist users remain';
end
$$;
