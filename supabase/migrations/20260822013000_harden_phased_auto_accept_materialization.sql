-- Auto-accept remains a request-status transition, not a second booking path.
-- Revalidate the real operator-busy portions of phased services immediately
-- before acceptance and persist the phase snapshot explicitly on the canonical
-- appointment. The processing/posa interval stays free and the customer still
-- receives one logical booking notification.

create or replace function public.validate_booking_request_auto_accept_v1(
  p_workspace_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_is_phased boolean := false;
  v_initial integer := 0;
  v_processing integer := 0;
  v_final integer := 0;
  v_final_enabled boolean := false;
  v_initial_operator_id text;
  v_initial_operator_name text;
  v_final_operator_id text;
  v_final_operator_name text;
  v_final_time time;
begin
  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.id = p_request_id
    and request.origin = 'frontend'
    and request.status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  v_is_phased := coalesce(v_request.phase_snapshot ->> 'mode', '') = 'phased';
  v_initial := case
    when v_is_phased then greatest(
      coalesce((v_request.phase_snapshot ->> 'initialDurationMinutes')::integer, 0),
      1
    )
    else greatest(coalesce(v_request.requested_duration_minutes, 60), 1)
  end;
  v_processing := case
    when v_is_phased then greatest(
      coalesce((v_request.phase_snapshot ->> 'processingDurationMinutes')::integer, 0),
      0
    )
    else 0
  end;
  v_final := case
    when v_is_phased then greatest(
      coalesce((v_request.phase_snapshot ->> 'finalDurationMinutes')::integer, 0),
      0
    )
    else 0
  end;
  v_final_enabled := v_is_phased
    and v_final > 0
    and lower(coalesce(v_request.phase_snapshot ->> 'finalPhaseEnabled', 'true')) <> 'false';

  v_initial_operator_id := nullif(trim(coalesce(
    v_request.phase_operator_assignments -> 'initial' ->> 'id',
    v_request.requested_operator_id,
    ''
  )), '');
  v_initial_operator_name := nullif(trim(coalesce(
    v_request.phase_operator_assignments -> 'initial' ->> 'name',
    v_request.requested_operator_name,
    ''
  )), '');
  v_final_operator_id := nullif(trim(coalesce(
    v_request.phase_operator_assignments -> 'final' ->> 'id',
    v_request.requested_operator_id,
    ''
  )), '');
  v_final_operator_name := nullif(trim(coalesce(
    v_request.phase_operator_assignments -> 'final' ->> 'name',
    v_request.requested_operator_name,
    ''
  )), '');

  perform pg_advisory_xact_lock(
    hashtext(p_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  if public.phased_operator_interval_conflicts_v1(
    p_workspace_id,
    v_request.appointment_date,
    v_request.appointment_time,
    v_initial,
    v_initial_operator_id,
    v_initial_operator_name,
    null,
    v_request.id
  ) then
    raise exception 'booking_request_conflict';
  end if;

  if v_final_enabled then
    v_final_time := (
      v_request.appointment_time
      + make_interval(mins => v_initial + v_processing)
    )::time;

    if public.phased_operator_interval_conflicts_v1(
      p_workspace_id,
      v_request.appointment_date,
      v_final_time,
      v_final,
      v_final_operator_id,
      v_final_operator_name,
      null,
      v_request.id
    ) then
      raise exception 'booking_request_conflict';
    end if;
  end if;
end;
$$;

revoke all on function public.validate_booking_request_auto_accept_v1(uuid, uuid)
  from public;

create or replace function public.materialize_booking_request_phases_v1(
  p_workspace_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments as appointment
  set phase_snapshot = request.phase_snapshot,
      phase_operator_assignments = request.phase_operator_assignments,
      phase_overlap_overrides = request.phase_overlap_overrides,
      duration_minutes = greatest(
        coalesce(request.requested_duration_minutes, appointment.duration_minutes, 1),
        1
      ),
      updated_at = timezone('utc', now())
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.id = p_request_id
    and appointment.workspace_id = request.workspace_id
    and appointment.booking_request_id = request.id;
end;
$$;

revoke all on function public.materialize_booking_request_phases_v1(uuid, uuid)
  from public;

-- Ordinary and phased services follow the same 15 second policy. Linked
-- compositions deliberately remain pending so the salon accepts the complete
-- group atomically with its existing group action.
create or replace function public.process_due_auto_accept_booking_requests(
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select request.id, request.workspace_id
    from public.booking_requests as request
    where request.origin = 'frontend'
      and request.status = 'pending'
      and request.appointment_group_id is null
      and public.resolve_customer_online_auto_accept_v1(
        request.workspace_id,
        request.customer_id
      ) is true
      and request.created_at <= v_now - interval '15 seconds'
    order by request.created_at asc, request.id asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update of request skip locked
  loop
    begin
      perform public.validate_booking_request_auto_accept_v1(
        v_row.workspace_id,
        v_row.id
      );
      perform public.update_owner_booking_request_status_core(
        v_row.workspace_id,
        v_row.id,
        'accepted'::public.request_status
      );
      perform public.materialize_booking_request_phases_v1(
        v_row.workspace_id,
        v_row.id
      );
      perform public.queue_owner_badge_refresh_after_auto_accept(
        v_row.workspace_id,
        v_row.id
      );
      v_processed := v_processed + 1;
    exception when others then
      if position('booking_request_conflict' in SQLERRM) > 0
        or position('booking_request_not_found' in SQLERRM) > 0 then
        null;
      else
        raise notice 'process_due_auto_accept_booking_requests failed for %: %',
          v_row.id,
          SQLERRM;
      end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception when others then
  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
