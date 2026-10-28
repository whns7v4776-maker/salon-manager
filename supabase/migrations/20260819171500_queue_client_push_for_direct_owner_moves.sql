-- Every Agenda drag currently reaches direct_v3 (and then v2 -> v1) so the
-- customer push must be queued in the same transaction as the persisted move.
-- Keep the client-side enqueue as a deduplicated safety net only.

alter function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) rename to move_owner_appointment_direct_v1_core_20260819;

revoke all on function public.move_owner_appointment_direct_v1_core_20260819(
  uuid, date, time, text, text, text, text, text, boolean
) from public, anon, authenticated;

create function public.move_owner_appointment_direct_v1(
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
  v_before public.appointments%rowtype;
  v_after public.appointments%rowtype;
  v_result jsonb;
  v_operator_changed boolean := false;
  v_notification_operator_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select appointment.*
  into v_before
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_before.id is null then
    raise exception 'appointment_not_found';
  end if;

  v_result := public.move_owner_appointment_direct_v1_core_20260819(
    p_appointment_id,
    p_next_appointment_date,
    p_next_appointment_time,
    p_next_initial_operator_id,
    p_next_initial_operator_name,
    p_next_final_operator_id,
    p_next_final_operator_name,
    p_scope,
    p_allow_overlap
  );

  select appointment.*
  into v_after
  from public.appointments as appointment
  where appointment.id = p_appointment_id;

  v_operator_changed :=
    coalesce(v_before.operator_id, '') is distinct from coalesce(v_after.operator_id, '')
    or coalesce(v_before.operator_name, '') is distinct from coalesce(v_after.operator_name, '')
    or coalesce(v_before.phase_operator_assignments, '{}'::jsonb)
      is distinct from coalesce(v_after.phase_operator_assignments, '{}'::jsonb);

  v_notification_operator_name := case
    when p_scope = 'final' then coalesce(
      nullif(trim(v_after.phase_operator_assignments -> 'final' ->> 'name'), ''),
      nullif(trim(v_after.operator_name), '')
    )
    else coalesce(
      nullif(trim(v_after.phase_operator_assignments -> 'initial' ->> 'name'), ''),
      nullif(trim(v_after.operator_name), '')
    )
  end;

  if v_after.booking_request_id is not null
    and (
      v_before.appointment_date is distinct from v_after.appointment_date
      or v_before.appointment_time is distinct from v_after.appointment_time
      or v_operator_changed
    ) then
    perform public.queue_customer_appointment_rescheduled_push(
      v_after.workspace_id,
      v_after.booking_request_id,
      v_after.id,
      v_before.appointment_date,
      v_before.appointment_time,
      v_after.appointment_date,
      v_after.appointment_time,
      v_after.service_name,
      v_after.customer_name,
      v_notification_operator_name
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'booking_request_id', v_after.booking_request_id,
    'bookingRequestId', v_after.booking_request_id
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) from public, anon;

grant execute on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) to authenticated;

comment on function public.move_owner_appointment_direct_v1(
  uuid, date, time, text, text, text, text, text, boolean
) is 'Moves an owner appointment and atomically queues the targeted customer reschedule push.';

notify pgrst, 'reload schema';
