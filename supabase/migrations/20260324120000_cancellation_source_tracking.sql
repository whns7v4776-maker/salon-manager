-- Add cancellation_source column to booking_requests so that
-- "cancelled by salon" persists in the database across refreshes.

alter table public.booking_requests
  add column if not exists cancellation_source text
    check (cancellation_source in ('salone', 'cliente'));

-- Re-create cancel_owner_appointment to:
--   1. Set cancellation_source = 'salone' when updating a linked booking_request
--   2. INSERT a new booking_request (tracked as cancelled-by-salon) when the
--      appointment has no linked booking_request (e.g. owner-created directly)
create or replace function public.cancel_owner_appointment(
  p_appointment_id uuid default null,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_service_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_appointment public.appointments%rowtype;
  v_customer_email citext := '';
  v_customer_phone text := '';
  v_customer_instagram text := null;
  v_customer_name_first text;
  v_customer_name_last text;
  v_new_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and (
      (p_appointment_id is not null and appointment.id = p_appointment_id)
      or (
        p_appointment_id is null
        and p_appointment_date is not null
        and p_appointment_time is not null
        and lower(trim(appointment.customer_name)) = lower(trim(coalesce(p_customer_name, '')))
        and lower(trim(appointment.service_name)) = lower(trim(coalesce(p_service_name, '')))
        and appointment.appointment_date = p_appointment_date
        and appointment.appointment_time = p_appointment_time
      )
    )
  order by appointment.created_at desc
  limit 1;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if v_appointment.booking_request_id is not null then
    -- Linked booking_request: update status and record who cancelled
    update public.booking_requests as br
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where br.id = v_appointment.booking_request_id
      and br.workspace_id = v_workspace_id;
  else
    -- No linked booking_request (owner-created appointment): insert a tracking record
    if v_appointment.customer_id is not null then
      select
        coalesce(c.email, ''),
        coalesce(c.phone, ''),
        c.instagram
      into v_customer_email, v_customer_phone, v_customer_instagram
      from public.customers as c
      where c.id = v_appointment.customer_id;
    end if;

    -- Split full name into first / last
    v_customer_name_first := split_part(trim(v_appointment.customer_name), ' ', 1);
    if position(' ' in trim(v_appointment.customer_name)) > 0 then
      v_customer_name_last := trim(
        substring(trim(v_appointment.customer_name)
          from position(' ' in trim(v_appointment.customer_name)) + 1)
      );
    else
      v_customer_name_last := '';
    end if;

    insert into public.booking_requests (
      workspace_id,
      customer_id,
      requested_service_name,
      requested_price,
      requested_duration_minutes,
      appointment_date,
      appointment_time,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      origin,
      status,
      cancellation_source,
      viewed_by_customer
    ) values (
      v_workspace_id,
      v_appointment.customer_id,
      v_appointment.service_name,
      v_appointment.price,
      v_appointment.duration_minutes,
      v_appointment.appointment_date,
      v_appointment.appointment_time,
      v_customer_name_first,
      v_customer_name_last,
      v_customer_email,
      v_customer_phone,
      v_customer_instagram,
      'backoffice',
      'cancelled',
      'salone',
      false
    )
    returning id into v_new_request_id;
  end if;

  delete from public.appointments as appointment
  where appointment.id = v_appointment.id;

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'bookingRequestId', coalesce(v_appointment.booking_request_id, v_new_request_id),
    'customerId', v_appointment.customer_id
  );
end;
$$;

grant execute on function public.cancel_owner_appointment(uuid, date, time, text, text) to authenticated;

-- Re-create sync function to include cancellationSource in the JSON snapshot
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

grant execute on function public.sync_client_portal_booking_requests(uuid) to authenticated;
