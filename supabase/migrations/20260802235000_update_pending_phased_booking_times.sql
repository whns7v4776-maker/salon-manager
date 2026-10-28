create or replace function public.update_owner_pending_phased_booking_times_v1(
  p_request_id uuid,
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
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_snapshot jsonb;
  v_assignments jsonb;
  v_initial_operator_id text;
  v_initial_operator_name text;
  v_final_operator_id text;
  v_final_operator_name text;
  v_final_time time;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select booking_request.*
  into v_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.id = p_request_id
  for update;

  if v_request.id is null then raise exception 'booking_request_not_found'; end if;
  if v_request.status::text <> 'pending' then raise exception 'booking_request_already_processed'; end if;
  if coalesce(v_request.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'booking_request_not_phased';
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
    v_request.appointment_time
    + make_interval(mins => p_initial_duration_minutes + p_processing_duration_minutes)
  )::time;
  v_snapshot := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_request.phase_snapshot,
        '{initialDurationMinutes}',
        to_jsonb(p_initial_duration_minutes)
      ),
      '{processingDurationMinutes}',
      to_jsonb(p_processing_duration_minutes)
    ),
    '{finalDurationMinutes}',
    to_jsonb(p_final_duration_minutes)
  );
  v_assignments := coalesce(v_request.phase_operator_assignments, '{}'::jsonb);
  v_initial_operator_id := coalesce(
    nullif(v_assignments #>> '{initial,id}', ''),
    nullif(v_request.requested_operator_id, '')
  );
  v_initial_operator_name := coalesce(
    nullif(v_assignments #>> '{initial,name}', ''),
    nullif(v_request.requested_operator_name, '')
  );
  v_final_operator_id := coalesce(
    nullif(v_assignments #>> '{final,id}', ''),
    v_initial_operator_id
  );
  v_final_operator_name := coalesce(
    nullif(v_assignments #>> '{final,name}', ''),
    v_initial_operator_name
  );

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  if public.phased_operator_interval_conflicts_v1(
    v_workspace_id,
    v_request.appointment_date,
    v_request.appointment_time,
    p_initial_duration_minutes,
    v_initial_operator_id,
    v_initial_operator_name,
    null,
    v_request.id
  ) or public.phased_operator_interval_conflicts_v1(
    v_workspace_id,
    v_request.appointment_date,
    v_final_time,
    p_final_duration_minutes,
    v_final_operator_id,
    v_final_operator_name,
    null,
    v_request.id
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.booking_requests
  set requested_duration_minutes = v_total,
      phase_snapshot = v_snapshot,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'duration_minutes', v_total,
    'phase_snapshot', v_snapshot
  );
end;
$$;

revoke all on function public.update_owner_pending_phased_booking_times_v1(
  uuid, integer, integer, integer
) from public;
grant execute on function public.update_owner_pending_phased_booking_times_v1(
  uuid, integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
