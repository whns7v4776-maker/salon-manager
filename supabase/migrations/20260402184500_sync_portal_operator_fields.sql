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
          'operatoreId', nullif(trim(coalesce(appointment.operator_id, '')), ''),
          'operatoreNome', nullif(trim(coalesce(appointment.operator_name, '')), ''),
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

create or replace function public.sync_client_portal_booking_requests(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set richieste_prenotazione = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', booking_request.id,
          'data', booking_request.appointment_date,
          'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
          'servizio', booking_request.requested_service_name,
          'prezzo', booking_request.requested_price,
          'durataMinuti', booking_request.requested_duration_minutes,
          'nome', booking_request.customer_name,
          'cognome', booking_request.customer_surname,
          'email', booking_request.customer_email,
          'telefono', booking_request.customer_phone,
          'instagram', coalesce(booking_request.customer_instagram, ''),
          'note', coalesce(booking_request.notes, ''),
          'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
          'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
          'origine',
            case
              when booking_request.origin = 'backoffice' then 'backoffice'
              else 'frontend'
            end,
          'stato',
            case booking_request.status
              when 'accepted' then 'Accettata'
              when 'rejected' then 'Rifiutata'
              when 'cancelled' then 'Annullata'
              else 'In attesa'
            end,
          'cancellationSource', booking_request.cancellation_source,
          'createdAt', booking_request.created_at,
          'viewedByCliente', booking_request.viewed_by_customer,
          'viewedBySalon',
            case
              when booking_request.status in ('pending', 'cancelled') then false
              else true
            end
        )
        order by booking_request.created_at desc
      )
      from public.booking_requests as booking_request
      where booking_request.workspace_id = portal.workspace_id
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

grant execute on function public.sync_client_portal_appointments(uuid) to authenticated;
grant execute on function public.sync_client_portal_booking_requests(uuid) to authenticated;
