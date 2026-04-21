do $$
begin
  create temporary table keep_auth_user_emails (
    email citext primary key
  ) on commit drop;

  insert into keep_auth_user_emails (email)
  values
    ('michelle_91_@hotmail.it'::citext),
    ('felicecristiano331@gmail.com'::citext),
    ('mchiaramacri97@gmail.com'::citext);

  create temporary table doomed_auth_users
  on commit drop
  as
  select
    user_record.id::text as user_id,
    nullif(lower(trim(coalesce(user_record.email, ''))), '')::citext as email
  from auth.users as user_record
  where (
    nullif(lower(trim(coalesce(user_record.email, ''))), '')::citext is null
    or not exists (
      select 1
      from keep_auth_user_emails as keep_email
      where keep_email.email = nullif(lower(trim(coalesce(user_record.email, ''))), '')::citext
    )
  );

  delete from auth.sessions
  where user_id::text in (
    select doomed_user.user_id
    from doomed_auth_users as doomed_user
  );

  delete from auth.refresh_tokens
  where user_id::text in (
    select doomed_user.user_id
    from doomed_auth_users as doomed_user
  );

  delete from auth.identities
  where user_id::text in (
    select doomed_user.user_id
    from doomed_auth_users as doomed_user
  );

  delete from auth.users
  where id::text in (
      select doomed_user.user_id
      from doomed_auth_users as doomed_user
    )
    or (
      nullif(lower(trim(coalesce(email, ''))), '')::citext is null
      or not exists (
        select 1
        from keep_auth_user_emails as keep_email
        where keep_email.email = nullif(lower(trim(coalesce(auth.users.email, ''))), '')::citext
      )
    );
end;
$$;
