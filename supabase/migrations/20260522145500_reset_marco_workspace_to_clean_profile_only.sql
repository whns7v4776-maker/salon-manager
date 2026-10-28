do $$
declare
  v_workspace_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marco.rossi@gmail.com'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found:marco.rossi@gmail.com';
  end if;

  delete from public.push_notifications
  where workspace_id = v_workspace_id;

  delete from public.cash_movements
  where workspace_id = v_workspace_id
     or appointment_id in (
       select appointment.id
       from public.appointments as appointment
       where appointment.workspace_id = v_workspace_id
     );

  delete from public.appointments
  where workspace_id = v_workspace_id;

  delete from public.booking_requests
  where workspace_id = v_workspace_id;

  delete from public.booking_slot_waitlist
  where workspace_id = v_workspace_id;

  delete from public.customers
  where workspace_id = v_workspace_id;

  perform public.sync_client_portal_customers(v_workspace_id);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
end
$$;
