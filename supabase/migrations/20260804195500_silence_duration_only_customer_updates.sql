create or replace function public.update_owner_phased_appointment_times_v1(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_snapshot jsonb;
  v_total integer;
  v_final_time time;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  limit 1;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;
  if coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;
  if least(
    coalesce(p_initial_duration_minutes, 0),
    coalesce(p_processing_duration_minutes, 0),
    coalesce(p_final_duration_minutes, 0)
  ) < 5 or greatest(
    p_initial_duration_minutes,
    p_processing_duration_minutes,
    p_final_duration_minutes
  ) > 480 then
    raise exception 'invalid_phase_duration';
  end if;

  v_total := p_initial_duration_minutes + p_processing_duration_minutes + p_final_duration_minutes;
  v_final_time := (
    v_appointment.appointment_time
    + make_interval(mins => p_initial_duration_minutes + p_processing_duration_minutes)
  )::time;
  v_snapshot := jsonb_set(
    jsonb_set(
      jsonb_set(v_appointment.phase_snapshot, '{initialDurationMinutes}', to_jsonb(p_initial_duration_minutes)),
      '{processingDurationMinutes}', to_jsonb(p_processing_duration_minutes)
    ),
    '{finalDurationMinutes}', to_jsonb(p_final_duration_minutes)
  );

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || v_appointment.appointment_date::text)
  );
  perform set_config('app.booking_exclude_appointment_id', v_appointment.id::text, true);
  perform set_config(
    'app.booking_exclude_request_id',
    coalesce(v_appointment.booking_request_id::text, ''),
    true
  );

  if not public.is_public_booking_slot_available(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    p_initial_duration_minutes,
    v_appointment.service_name,
    v_appointment.operator_id,
    v_appointment.operator_name
  ) or not public.is_public_booking_slot_available(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_final_time,
    p_final_duration_minutes,
    v_appointment.service_name,
    v_appointment.operator_id,
    v_appointment.operator_name
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = v_snapshot
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    -- Una modifica della sola durata non è uno spostamento: preserva lo stato
    -- di lettura del cliente e non genera badge/push di variazione.
    update public.booking_requests
    set requested_duration_minutes = v_total,
        phase_snapshot = v_snapshot,
        updated_at = timezone('utc', now())
    where id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_appointment.workspace_id);
  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'duration_minutes', v_total,
    'phase_snapshot', v_snapshot
  );
end;
$$;

revoke all on function public.update_owner_phased_appointment_times_v1(uuid, integer, integer, integer)
  from public;
grant execute on function public.update_owner_phased_appointment_times_v1(uuid, integer, integer, integer)
  to authenticated;

notify pgrst, 'reload schema';
