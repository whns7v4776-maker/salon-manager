create or replace function public.update_owner_phased_appointment_times_v2(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_customer_overlap boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_snapshot jsonb;
  v_assignments jsonb;
  v_initial_operator_id text;
  v_initial_operator_name text;
  v_final_operator_id text;
  v_final_operator_name text;
  v_previous_total integer;
  v_total integer;
  v_start_at timestamp;
  v_end_at timestamp;
  v_final_time time;
  v_customer_conflict boolean := false;
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
  for update;

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

  v_previous_total := case
    when coalesce(v_appointment.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
     and coalesce(v_appointment.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
     and coalesce(v_appointment.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
    then greatest(
      (v_appointment.phase_snapshot ->> 'initialDurationMinutes')::integer
        + (v_appointment.phase_snapshot ->> 'processingDurationMinutes')::integer
        + (v_appointment.phase_snapshot ->> 'finalDurationMinutes')::integer,
      1
    )
    else greatest(coalesce(v_appointment.duration_minutes, 60), 1)
  end;
  v_total := p_initial_duration_minutes + p_processing_duration_minutes + p_final_duration_minutes;
  v_start_at := v_appointment.appointment_date::timestamp + v_appointment.appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_total);
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

  v_assignments := coalesce(v_appointment.phase_operator_assignments, '{}'::jsonb);
  v_initial_operator_id := coalesce(
    nullif(v_assignments #>> '{initial,id}', ''),
    nullif(v_appointment.operator_id, '')
  );
  v_initial_operator_name := coalesce(
    nullif(v_assignments #>> '{initial,name}', ''),
    nullif(v_appointment.operator_name, '')
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
    hashtext(v_appointment.workspace_id::text || ':' || v_appointment.appointment_date::text)
  );

  -- La stessa corsia non e mai forzabile. Le due fasi lavorate possono avere
  -- operatori differenti, quindi vanno controllate separatamente.
  if public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    p_initial_duration_minutes,
    v_initial_operator_id,
    v_initial_operator_name,
    v_appointment.id,
    v_appointment.booking_request_id
  ) or public.phased_operator_interval_conflicts_v1(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_final_time,
    p_final_duration_minutes,
    v_final_operator_id,
    v_final_operator_name,
    v_appointment.id,
    v_appointment.booking_request_id
  ) then
    raise exception 'target_slot_occupied';
  end if;

  -- La posa fa parte dell'impegno del cliente. Quando l'intero servizio si
  -- allunga, anche un solo minuto condiviso con un altro ramo richiede una
  -- conferma esplicita del salone. Una riduzione non riapre conflitti storici.
  if v_total > v_previous_total and not coalesce(p_allow_customer_overlap, false) then
    select exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_appointment.workspace_id
        and other.id <> v_appointment.id
        and other.appointment_date = v_appointment.appointment_date
        and (
          (
            v_appointment.customer_id is not null
            and other.customer_id is not null
            and other.customer_id = v_appointment.customer_id
          )
          or (
            trim(coalesce(v_appointment.customer_name, '')) <> ''
            and lower(regexp_replace(trim(coalesce(other.customer_name, '')), '\s+', ' ', 'g')) =
              lower(regexp_replace(trim(coalesce(v_appointment.customer_name, '')), '\s+', ' ', 'g'))
          )
        )
        and (other.appointment_date::timestamp + other.appointment_time) < v_end_at
        and (
          other.appointment_date::timestamp
          + other.appointment_time
          + make_interval(
              mins => case
                when coalesce(other.phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(other.phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
                 and coalesce(other.phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
                then greatest(
                  (other.phase_snapshot ->> 'initialDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'processingDurationMinutes')::integer
                    + (other.phase_snapshot ->> 'finalDurationMinutes')::integer,
                  1
                )
                else greatest(coalesce(other.duration_minutes, 60), 1)
              end
            )
        ) > v_start_at
    ) into v_customer_conflict;

    if v_customer_conflict then
      raise exception 'customer_time_overlap';
    end if;
  end if;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = v_snapshot
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    -- Una variazione della sola durata non e uno spostamento: niente push,
    -- badge o nuovo stato non letto lato cliente.
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
    'phase_snapshot', v_snapshot,
    'customer_overlap_forced', coalesce(p_allow_customer_overlap, false)
  );
end;
$$;

revoke all on function public.update_owner_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean
) from public;
grant execute on function public.update_owner_phased_appointment_times_v2(
  uuid, integer, integer, integer, boolean
) to authenticated;

notify pgrst, 'reload schema';
