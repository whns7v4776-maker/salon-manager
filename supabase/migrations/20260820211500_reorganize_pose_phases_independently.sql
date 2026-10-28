-- Native Agenda can move the two visible pieces of a phased appointment
-- independently. Persist the resulting processing gap in the same transaction
-- used to stabilize the complete linked draft.

create or replace function public.apply_owner_linked_reorganization_v2(
  p_anchor_appointment_id uuid,
  p_items jsonb,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor public.appointments%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_phase jsonb;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_enabled boolean;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_anchor_appointment_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_reorganization_plan';
  end if;

  select appointment.*
  into v_anchor
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_anchor_appointment_id
  for update;

  if v_anchor.id is null then
    raise exception 'appointment_not_found';
  end if;

  perform 1
  from public.appointments as appointment
  where appointment.workspace_id = v_anchor.workspace_id
    and (
      (v_anchor.appointment_group_id is not null
        and appointment.appointment_group_id = v_anchor.appointment_group_id)
      or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
    )
  order by appointment.id
  for update;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item ->> 'appointmentId', '')::uuid;
    v_phase := v_item -> 'phaseConfig';
    if v_phase is null or jsonb_typeof(v_phase) <> 'object' then
      continue;
    end if;

    if coalesce(v_phase ->> 'mode', '') <> 'phased' then
      raise exception 'invalid_phase_duration';
    end if;
    v_initial := coalesce((v_phase ->> 'initialDurationMinutes')::integer, 0);
    v_processing := coalesce((v_phase ->> 'processingDurationMinutes')::integer, -1);
    v_final := coalesce((v_phase ->> 'finalDurationMinutes')::integer, 0);
    v_final_enabled := coalesce((v_phase ->> 'finalPhaseEnabled')::boolean, true);
    if v_initial < 5 or v_initial > 480
       or v_processing < 0 or v_processing > 480
       or v_final < 0 or v_final > 480
       or (v_final_enabled and v_final < 5)
       or (not v_final_enabled and v_final <> 0)
       or v_initial % 5 <> 0
       or v_processing % 5 <> 0
       or v_final % 5 <> 0 then
      raise exception 'invalid_phase_duration';
    end if;

    update public.appointments as appointment
    set phase_snapshot = v_phase,
        duration_minutes = v_initial + v_processing + v_final,
        updated_at = timezone('utc', now())
    where appointment.id = v_item_id
      and appointment.workspace_id = v_anchor.workspace_id
      and (
        (v_anchor.appointment_group_id is not null
          and appointment.appointment_group_id = v_anchor.appointment_group_id)
        or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
      );
    if not found then
      raise exception 'incomplete_linked_reorganization_plan';
    end if;

    update public.booking_requests as request
    set phase_snapshot = v_phase,
        requested_duration_minutes = v_initial + v_processing + v_final,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    from public.appointments as appointment
    where appointment.id = v_item_id
      and request.id = appointment.booking_request_id;
  end loop;

  -- v1 now sees the new pose durations, applies times/operators, and validates
  -- the final layout. Any error rolls this outer transaction back completely.
  v_result := public.apply_owner_linked_reorganization_v1(
    p_anchor_appointment_id,
    p_items,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );
  return v_result;
end;
$$;

revoke all on function public.apply_owner_linked_reorganization_v2(
  uuid, jsonb, boolean, boolean
) from public;
grant execute on function public.apply_owner_linked_reorganization_v2(
  uuid, jsonb, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
