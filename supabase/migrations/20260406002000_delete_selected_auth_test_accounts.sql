do $$
begin
  create temporary table tmp_target_owner_emails (
    email citext primary key
  ) on commit drop;

  insert into tmp_target_owner_emails (email)
  values
    ('marziomus@icloud.com'::citext),
    ('marzioposte13@gmail.com'::citext),
    ('test@example.com'::citext),
    ('giorgiamuscatello12@gmail.com'::citext),
    ('john.doe@example.com'::citext);

  create temporary table tmp_target_auth_users
  on commit drop
  as
  select u.id
    ::text as user_id
  from auth.users as u
  join tmp_target_owner_emails as target
    on lower(trim(coalesce(u.email, '')))::citext = target.email;

  create temporary table tmp_target_owner_profiles
  on commit drop
  as
  select op.id
    ::text as profile_id
  from public.owner_profiles as op
  left join tmp_target_auth_users as tu
    on tu.user_id = op.user_id::text
  left join tmp_target_owner_emails as target
    on lower(trim(coalesce(op.email::text, '')))::citext = target.email
  where tu.user_id is not null
     or target.email is not null;

  create temporary table tmp_target_workspaces
  on commit drop
  as
  select w.id
    ::text as workspace_id
  from public.workspaces as w
  left join tmp_target_owner_profiles as tp
    on tp.profile_id = w.owner_profile_id::text
  left join tmp_target_owner_emails as target
    on lower(trim(coalesce(w.owner_email::text, '')))::citext = target.email
  where tp.profile_id is not null
     or target.email is not null;

  delete from public.audit_logs
  where actor_user_id::text in (select user_id from tmp_target_auth_users)
     or lower(trim(coalesce(actor_email::text, '')))::citext in (select email from tmp_target_owner_emails)
     or workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.client_portal_revisions
  where lower(trim(coalesce(owner_email::text, '')))::citext in (select email from tmp_target_owner_emails)
     or workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.trial_usage
  where owner_profile_id::text in (select profile_id from tmp_target_owner_profiles)
     or workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.trial_checks
  where matched_profile_id::text in (select profile_id from tmp_target_owner_profiles)
     or matched_workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or reviewed_by::text in (select user_id from tmp_target_auth_users)
     or lower(trim(coalesce(email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.backup_runs
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.push_notifications
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.push_devices
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(owner_email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.booking_slot_waitlist
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(customer_email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.device_fingerprints
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or owner_profile_id::text in (select profile_id from tmp_target_owner_profiles);

  delete from public.workspace_members
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or user_id::text in (select user_id from tmp_target_auth_users)
     or lower(trim(coalesce(email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.client_portals
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(owner_email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from public.subscriptions
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.workspaces
  where id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.owner_profiles
  where id::text in (select profile_id from tmp_target_owner_profiles)
     or user_id::text in (select user_id from tmp_target_auth_users)
     or lower(trim(coalesce(email::text, '')))::citext in (select email from tmp_target_owner_emails);

  delete from auth.sessions
  where user_id::text in (select user_id from tmp_target_auth_users);

  delete from auth.refresh_tokens
  where user_id::text in (select user_id from tmp_target_auth_users);

  delete from auth.identities
  where user_id::text in (select user_id from tmp_target_auth_users);

  delete from auth.users
  where id::text in (select user_id from tmp_target_auth_users)
     or lower(trim(coalesce(email, '')))::citext in (select email from tmp_target_owner_emails);
end;
$$;
