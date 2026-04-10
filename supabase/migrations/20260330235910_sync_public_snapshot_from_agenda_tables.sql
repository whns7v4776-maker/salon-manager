create or replace function public.sync_client_portal_appointments(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set appuntamenti = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', appointment.id,
          'data', appointment.appointment_date,
          'ora', to_char(appointment.appointment_time, 'HH24:MI'),
          'cliente', appointment.customer_name,
          'servizio', appointment.service_name,
          'prezzo', appointment.price,
          'durataMinuti', appointment.duration_minutes,
          'incassato', appointment.cashed_in,
          'completato', appointment.completed,
          'nonEffettuato', appointment.no_show
        )
        order by appointment.appointment_date asc, appointment.appointment_time asc, appointment.created_at asc
      )
      from public.appointments as appointment
      where appointment.workspace_id = portal.workspace_id
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

grant execute on function public.sync_client_portal_appointments(uuid) to authenticated;

create or replace function public.handle_client_portal_public_snapshot_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_client_portal_after_appointments_change on public.appointments;
create trigger sync_client_portal_after_appointments_change
after insert or update or delete on public.appointments
for each row execute procedure public.handle_client_portal_public_snapshot_sync();

drop trigger if exists sync_client_portal_after_booking_requests_change on public.booking_requests;
create trigger sync_client_portal_after_booking_requests_change
after insert or update or delete on public.booking_requests
for each row execute procedure public.handle_client_portal_public_snapshot_sync();
