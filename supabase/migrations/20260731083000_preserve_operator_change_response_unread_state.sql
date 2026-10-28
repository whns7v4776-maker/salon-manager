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
          'viewedBySalon', booking_request.viewed_by_salon,
          'operatorChangeStatus', booking_request.operator_change_status,
          'operatorChangeOriginalId',
            nullif(trim(coalesce(booking_request.operator_change_original_id, '')), ''),
          'operatorChangeOriginalName',
            nullif(trim(coalesce(booking_request.operator_change_original_name, '')), ''),
          'operatorChangeProposedId',
            nullif(trim(coalesce(booking_request.operator_change_proposed_id, '')), ''),
          'operatorChangeProposedName',
            nullif(trim(coalesce(booking_request.operator_change_proposed_name, '')), ''),
          'operatorChangeRequestedAt', booking_request.operator_change_requested_at,
          'operatorChangeExpiresAt', booking_request.operator_change_expires_at,
          'operatorChangeRespondedAt', booking_request.operator_change_responded_at
        )
        order by booking_request.created_at desc
      )
      from public.booking_requests as booking_request
      where booking_request.workspace_id = portal.workspace_id
        and (
          booking_request.status not in ('pending', 'accepted')
          or not exists (
            select 1
            from public.booking_requests as terminal_request
            where terminal_request.workspace_id = portal.workspace_id
              and terminal_request.status in ('cancelled', 'rejected')
              and terminal_request.appointment_date = booking_request.appointment_date
              and terminal_request.appointment_time = booking_request.appointment_time
              and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                lower(trim(coalesce(booking_request.requested_service_name, '')))
              and public.same_public_booking_operator_identity(
                terminal_request.requested_operator_id,
                terminal_request.requested_operator_name,
                booking_request.requested_operator_id,
                booking_request.requested_operator_name
              )
              and lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(terminal_request.customer_name, ''),
                    coalesce(terminal_request.customer_surname, '')
                  )
                )
              ) = lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(booking_request.customer_name, ''),
                    coalesce(booking_request.customer_surname, '')
                  )
                )
              )
              and not exists (
                select 1
                from public.booking_requests as newer_active_request
                where newer_active_request.workspace_id = terminal_request.workspace_id
                  and newer_active_request.status in ('pending', 'accepted')
                  and newer_active_request.appointment_date = terminal_request.appointment_date
                  and newer_active_request.appointment_time = terminal_request.appointment_time
                  and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                    lower(trim(coalesce(terminal_request.requested_service_name, '')))
                  and public.same_public_booking_operator_identity(
                    newer_active_request.requested_operator_id,
                    newer_active_request.requested_operator_name,
                    terminal_request.requested_operator_id,
                    terminal_request.requested_operator_name
                  )
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(newer_active_request.customer_name, ''),
                        coalesce(newer_active_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  )
                  and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                    coalesce(terminal_request.created_at, '-infinity'::timestamptz)
              )
          )
        )
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

do $$
declare
  v_workspace_id uuid;
begin
  for v_workspace_id in
    select distinct booking_request.workspace_id
    from public.booking_requests as booking_request
    where booking_request.operator_change_responded_at is not null
  loop
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end loop;
end;
$$;
