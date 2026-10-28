-- A stale native snapshot may temporarily omit one technical row of a linked
-- appointment. Preserve that server row unchanged instead of rejecting every
-- valid move in the visible draft.

create or replace function public.apply_owner_linked_reorganization_v3(
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
  v_appointment public.appointments%rowtype;
  v_complete_items jsonb := coalesce(p_items, '[]'::jsonb);
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
  where appointment.id = p_anchor_appointment_id;
  if v_anchor.id is null then
    raise exception 'appointment_not_found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as plan(item)
    left join public.appointments as appointment
      on appointment.id = nullif(plan.item ->> 'appointmentId', '')::uuid
     and appointment.workspace_id = v_anchor.workspace_id
     and (
       (v_anchor.appointment_group_id is not null
         and appointment.appointment_group_id = v_anchor.appointment_group_id)
       or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
     )
    where appointment.id is null
  ) then
    raise exception 'unexpected_linked_reorganization_item';
  end if;

  for v_appointment in
    select appointment.*
    from public.appointments as appointment
    where appointment.workspace_id = v_anchor.workspace_id
      and (
        (v_anchor.appointment_group_id is not null
          and appointment.appointment_group_id = v_anchor.appointment_group_id)
        or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
      )
      and not exists (
        select 1
        from jsonb_array_elements(p_items) as plan(item)
        where nullif(plan.item ->> 'appointmentId', '')::uuid = appointment.id
      )
    order by appointment.id
  loop
    v_complete_items := v_complete_items || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'appointmentId', v_appointment.id,
          'appointmentDate', v_appointment.appointment_date::text,
          'appointmentTime', to_char(v_appointment.appointment_time, 'HH24:MI'),
          'initialOperatorId', coalesce(
            v_appointment.phase_operator_assignments #>> '{initial,id}',
            v_appointment.operator_id
          ),
          'initialOperatorName', coalesce(
            v_appointment.phase_operator_assignments #>> '{initial,name}',
            v_appointment.operator_name
          ),
          'finalOperatorId', v_appointment.phase_operator_assignments #>> '{final,id}',
          'finalOperatorName', v_appointment.phase_operator_assignments #>> '{final,name}',
          'phaseConfig', v_appointment.phase_snapshot,
          'phaseOverlapOverrides', v_appointment.phase_overlap_overrides
        )
      )
    );
  end loop;

  return public.apply_owner_linked_reorganization_v2(
    p_anchor_appointment_id,
    v_complete_items,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );
end;
$$;

revoke all on function public.apply_owner_linked_reorganization_v3(
  uuid, jsonb, boolean, boolean
) from public;
grant execute on function public.apply_owner_linked_reorganization_v3(
  uuid, jsonb, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
