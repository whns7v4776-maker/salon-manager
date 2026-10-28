-- Send-time validation also suppresses old queued reminders after an owner move.
create or replace function public.customer_timing_push_is_current_v1(p_workspace_id uuid,p_payload jsonb,p_reference timestamptz default clock_timestamp())
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  event text := lower(coalesce(p_payload->>'event_type',p_payload->>'notificationType',p_payload->>'_pushEventType',p_payload->>'type',''));
  appointment_id text := nullif(p_payload->>'appointmentId','');
  request_id text := nullif(p_payload->>'bookingRequestId','');
  payload_date text := p_payload->>'appointmentDate';
  payload_time text := coalesce(nullif(p_payload->>'appointmentTime',''),nullif(p_payload->>'anchorAppointmentTime',''));
  a public.appointments%rowtype;
  target timestamp;
begin
  select lower(value) into event from unnest(array[p_payload->>'event_type',p_payload->>'notificationType',p_payload->>'_pushEventType',p_payload->>'type']) value
    where lower(value) in ('appointment_reminder','appointment_rescheduled','appointment_rescheduled_by_salon') limit 1;
  if event is null then return true; end if;
  if p_workspace_id is null then return false; end if;
  if payload_date !~ '^\d{4}-\d{2}-\d{2}$' or payload_time !~ '^\d{1,2}:\d{2}(:\d{2})?$' or payload_date is null or payload_time is null then return false; end if;
  target := payload_date::date+payload_time::time;
  if target <= (p_reference at time zone 'Europe/Rome') then return false; end if;
  if appointment_id is null and request_id is null then return false; end if;
  select x.* into a from public.appointments x where x.workspace_id=p_workspace_id
    and case when appointment_id is not null then x.id::text=appointment_id else x.booking_request_id::text=request_id end;
  if a.id is null or coalesce(a.no_show,false) or coalesce(a.completed,false) or coalesce(a.cashed_in,false) then return false; end if;
  return a.appointment_date::timestamp+a.appointment_time=target;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function public.customer_timing_push_is_current_v1(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.customer_timing_push_is_current_v1(uuid,jsonb,timestamptz) to service_role;
