create or replace function public.get_public_booking_occupancy_live(
  p_salon_code text,
  p_date date
)
returns table (
  id text,
  data text,
  ora text,
  cliente text,
  servizio text,
  prezzo numeric,
  durata_minuti integer,
  operatore_id text,
  operatore_nome text
)
language sql
security definer
set search_path = public
stable
as $$
  with target_workspace as (
    select portal.workspace_id
    from public.client_portals as portal
    where portal.salon_code = lower(trim(p_salon_code))
      and portal.subscription_status = 'active'
    limit 1
  ),
  live_appointments as (
    select
      appointment.id::text as id,
      appointment.appointment_date::text as data,
      to_char(appointment.appointment_time, 'HH24:MI') as ora,
      appointment.customer_name as cliente,
      appointment.service_name as servizio,
      appointment.price as prezzo,
      appointment.duration_minutes as durata_minuti,
      null::text as operatore_id,
      null::text as operatore_nome
    from public.appointments as appointment
    join target_workspace on target_workspace.workspace_id = appointment.workspace_id
    where appointment.appointment_date = p_date
  ),
  live_requests as (
    select
      case
        when booking_request.status = 'accepted' then 'accepted-' || booking_request.id::text
        else 'pending-' || booking_request.id::text
      end as id,
      booking_request.appointment_date::text as data,
      to_char(booking_request.appointment_time, 'HH24:MI') as ora,
      trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)) as cliente,
      booking_request.requested_service_name as servizio,
      booking_request.requested_price as prezzo,
      booking_request.requested_duration_minutes as durata_minuti,
      null::text as operatore_id,
      null::text as operatore_nome
    from public.booking_requests as booking_request
    join target_workspace on target_workspace.workspace_id = booking_request.workspace_id
    where booking_request.appointment_date = p_date
      and booking_request.status in ('pending', 'accepted')
      and (
        booking_request.status <> 'accepted'
        or not exists (
          select 1
          from public.appointments as appointment
          where appointment.workspace_id = booking_request.workspace_id
            and appointment.appointment_date = booking_request.appointment_date
            and appointment.appointment_time = booking_request.appointment_time
            and lower(trim(appointment.customer_name)) =
              lower(trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)))
            and lower(trim(appointment.service_name)) =
              lower(trim(booking_request.requested_service_name))
        )
      )
  )
  select * from live_appointments
  union all
  select * from live_requests
$$;
grant execute on function public.get_public_booking_occupancy_live(text, date) to anon, authenticated;
