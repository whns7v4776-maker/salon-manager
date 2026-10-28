do $$
declare
  v_target_email constant citext := 'marco.rossi@gmail.com'::citext;
begin
  create temporary table tmp_target_auth_users
  on commit drop
  as
  select u.id::text as user_id
  from auth.users as u
  where lower(trim(coalesce(u.email, '')))::citext = v_target_email;

  create temporary table tmp_target_owner_profiles
  on commit drop
  as
  select op.id::text as profile_id
  from public.owner_profiles as op
  left join tmp_target_auth_users as tu
    on tu.user_id = op.user_id::text
  where tu.user_id is not null
     or lower(trim(coalesce(op.email::text, '')))::citext = v_target_email;

  create temporary table tmp_target_workspaces
  on commit drop
  as
  select w.id::text as workspace_id
  from public.workspaces as w
  left join tmp_target_owner_profiles as tp
    on tp.profile_id = w.owner_profile_id::text
  where tp.profile_id is not null
     or lower(trim(coalesce(w.owner_email::text, '')))::citext = v_target_email;

  delete from public.audit_logs
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.client_portal_revisions
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(owner_email::text, '')))::citext = v_target_email;

  delete from public.push_notifications
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.push_devices
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(owner_email::text, '')))::citext = v_target_email;

  delete from public.booking_slot_waitlist
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.cash_movements
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or appointment_id in (
       select appointment.id
       from public.appointments as appointment
       where appointment.workspace_id::text in (select workspace_id from tmp_target_workspaces)
     );

  delete from public.appointments
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.booking_requests
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.customers
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.connected_cards
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.events
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.message_templates
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.services
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.operators
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  delete from public.owner_app_snapshots
  where workspace_id::text in (select workspace_id from tmp_target_workspaces);

  update public.client_portals
  set clienti = '[]'::jsonb,
      appuntamenti = '[]'::jsonb,
      servizi = '[]'::jsonb,
      operatori = '[]'::jsonb,
      richieste_prenotazione = '[]'::jsonb,
      availability_settings = '{}'::jsonb
  where workspace_id::text in (select workspace_id from tmp_target_workspaces)
     or lower(trim(coalesce(owner_email::text, '')))::citext = v_target_email;
end
$$;
