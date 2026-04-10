do $$
declare
  v_workspace_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    raise notice 'Nessun workspace trovato per marziomus@gmail.com';
    return;
  end if;

  delete from public.cash_movements
  where workspace_id = v_workspace_id
     or appointment_id in (
       select a.id
       from public.appointments as a
       where a.workspace_id = v_workspace_id
     );

  delete from public.appointments
  where workspace_id = v_workspace_id;

  delete from public.booking_requests
  where workspace_id = v_workspace_id
    and lower(trim(coalesce(customer_email::text, ''))) in (
      'ludo.o7@live.it',
      'marzioposte13@gmail.com'
    );

  delete from public.booking_slot_waitlist
  where workspace_id = v_workspace_id
    and lower(trim(coalesce(customer_email::text, ''))) in (
      'ludo.o7@live.it',
      'marzioposte13@gmail.com'
    );

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
end
$$;
