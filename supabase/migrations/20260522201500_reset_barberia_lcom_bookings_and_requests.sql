do $$
declare
  v_workspace_id uuid;
  v_deleted_cash_movements integer := 0;
  v_deleted_appointments integer := 0;
  v_deleted_booking_requests integer := 0;
  v_deleted_waitlist integer := 0;
  v_deleted_push_notifications integer := 0;
  v_deleted_owner_snapshots integer := 0;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
     or lower(trim(coalesce(w.slug, ''))) = 'barberia-lcom'
  order by w.updated_at desc, w.created_at desc
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found:barberia-lcom';
  end if;

  delete from public.cash_movements
  where workspace_id = v_workspace_id
     or appointment_id in (
       select appointment.id
       from public.appointments as appointment
       where appointment.workspace_id = v_workspace_id
     );
  get diagnostics v_deleted_cash_movements = row_count;

  delete from public.appointments
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_appointments = row_count;

  delete from public.booking_requests
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_booking_requests = row_count;

  delete from public.booking_slot_waitlist
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_waitlist = row_count;

  delete from public.push_notifications
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_push_notifications = row_count;

  delete from public.owner_app_snapshots
  where workspace_id = v_workspace_id;
  get diagnostics v_deleted_owner_snapshots = row_count;

  update public.client_portals
  set
    appuntamenti = '[]'::jsonb,
    richieste_prenotazione = '[]'::jsonb,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id;

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
  perform public.sync_client_portal_customers(v_workspace_id);

  raise notice
    'barberia-lcom reset complete: workspace_id=%, cash_movements=%, appointments=%, booking_requests=%, waitlist=%, push_notifications=%, owner_snapshots=%',
    v_workspace_id,
    v_deleted_cash_movements,
    v_deleted_appointments,
    v_deleted_booking_requests,
    v_deleted_waitlist,
    v_deleted_push_notifications,
    v_deleted_owner_snapshots;
end
$$;
