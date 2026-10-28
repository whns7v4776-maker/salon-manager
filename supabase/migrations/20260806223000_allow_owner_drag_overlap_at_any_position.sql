-- Il drag del backoffice puo forzare una sovrapposizione dell'operatore in
-- qualunque punto dell'appuntamento. Il controllo resta rigido finche il salone
-- non conferma esplicitamente p_allow_overlap.
create or replace function public.move_owner_appointment_direct_v1(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_assignments jsonb;
  v_overrides jsonb := '{}'::jsonb;
  v_initial_id text;
  v_initial_name text;
  v_final_id text;
  v_final_name text;
  v_initial_conflict boolean;
  v_final_conflict boolean;
  v_initial_start_occupied boolean;
  v_final_start_occupied boolean;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if p_scope not in ('whole', 'initial', 'final') then raise exception 'invalid_scope'; end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then raise exception 'appointment_not_found'; end if;
  if p_scope <> 'whole' and coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;

  v_initial := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'initialDurationMinutes')::integer, 1), 1)
    else greatest(coalesce(v_appointment.duration_minutes, 60), 1) end;
  v_processing := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'processingDurationMinutes')::integer, 1), 1)
    else 0 end;
  v_final := case when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased'
    then greatest(coalesce((v_appointment.phase_snapshot ->> 'finalDurationMinutes')::integer, 1), 1)
    else 0 end;

  if p_scope <> 'whole' then
    p_next_appointment_date := v_appointment.appointment_date;
    p_next_appointment_time := v_appointment.appointment_time;
  end if;
  v_final_time := (p_next_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  v_initial_id := coalesce(
    nullif(trim(p_next_initial_operator_id), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'id'), ''),
    nullif(trim(v_appointment.operator_id), '')
  );
  v_initial_name := coalesce(
    nullif(trim(p_next_initial_operator_name), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'name'), ''),
    nullif(trim(v_appointment.operator_name), '')
  );
  v_final_id := coalesce(
    nullif(trim(p_next_final_operator_id), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'id'), ''),
    v_initial_id
  );
  v_final_name := coalesce(
    nullif(trim(p_next_final_operator_name), ''),
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'name'), ''),
    v_initial_name
  );

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || p_next_appointment_date::text)
  );

  v_initial_conflict := public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, p_next_appointment_time, v_initial,
    v_initial_id, v_initial_name, v_appointment.id, v_appointment.booking_request_id
  );
  v_final_conflict := v_final > 0 and public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, v_final_time, v_final,
    v_final_id, v_final_name, v_appointment.id, v_appointment.booking_request_id
  );

  v_initial_start_occupied := public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, p_next_appointment_time, 1,
    v_initial_id, v_initial_name, v_appointment.id, v_appointment.booking_request_id
  );
  v_final_start_occupied := v_final > 0 and public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id, p_next_appointment_date, v_final_time, 1,
    v_final_id, v_final_name, v_appointment.id, v_appointment.booking_request_id
  );

  if (
    (p_scope <> 'final' and v_initial_start_occupied)
    or (p_scope <> 'initial' and v_final_start_occupied)
  ) and not p_allow_overlap then
    raise exception 'target_start_slot_occupied';
  end if;

  if (
    (p_scope <> 'final' and v_initial_conflict)
    or (p_scope <> 'initial' and v_final_conflict)
  ) and not p_allow_overlap then
    raise exception 'target_slot_occupied';
  end if;

  if coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then
    v_assignments := jsonb_build_object(
      'version', 1,
      'initial', jsonb_build_object('id', v_initial_id, 'name', v_initial_name),
      'final', jsonb_build_object('id', v_final_id, 'name', v_final_name)
    );
    v_overrides := jsonb_build_object(
      'version', 1,
      'initial', case
        when p_scope <> 'final' then v_initial_conflict and p_allow_overlap
        else coalesce((v_appointment.phase_overlap_overrides ->> 'initial')::boolean, false)
      end,
      'final', case
        when p_scope <> 'initial' then v_final_conflict and p_allow_overlap
        else coalesce((v_appointment.phase_overlap_overrides ->> 'final')::boolean, false)
      end
    );
  end if;

  update public.appointments
  set appointment_date = p_next_appointment_date,
      appointment_time = p_next_appointment_time,
      operator_id = v_initial_id,
      operator_name = v_initial_name,
      phase_operator_assignments = case
        when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_assignments
        else phase_operator_assignments
      end,
      phase_overlap_overrides = case
        when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_overrides
        else phase_overlap_overrides
      end,
      updated_at = timezone('utc', now())
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set appointment_date = p_next_appointment_date,
        appointment_time = p_next_appointment_time,
        requested_operator_id = v_initial_id,
        requested_operator_name = v_initial_name,
        phase_operator_assignments = case
          when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_assignments
          else phase_operator_assignments
        end,
        phase_overlap_overrides = case
          when coalesce(v_appointment.phase_snapshot ->> 'mode', '') = 'phased' then v_overrides
          else phase_overlap_overrides
        end,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_appointment.workspace_id);
  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'appointment_date', p_next_appointment_date,
    'appointment_time', p_next_appointment_time,
    'phase_operator_assignments', v_assignments,
    'phase_overlap_overrides', v_overrides,
    'overlap',
      (p_scope <> 'final' and v_initial_conflict)
      or (p_scope <> 'initial' and v_final_conflict)
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) from public;

grant execute on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
