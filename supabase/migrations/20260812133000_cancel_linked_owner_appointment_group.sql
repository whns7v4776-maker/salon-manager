-- Cancelling any phase of a phased service removes its single appointment row.
-- Cancelling any item of a composition removes only the rows tied to that
-- appointment_group_id. Other appointments for the same customer are never
-- selected by customer identity, date ranges or future dates.

create or replace function public.cancel_owner_linked_appointment_v1(
  p_appointment_id uuid default null,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_service_name text default null,
  p_owner_email citext default null,
  p_salon_code text default null,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_cancellation_event_id text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_target public.appointments%rowtype;
  v_group_id uuid;
  v_group_appointment_ids uuid[] := array[]::uuid[];
  v_group_request_ids uuid[] := array[]::uuid[];
  v_primary_result jsonb;
  v_request_id uuid;
begin
  if p_appointment_id is null then
    raise exception 'appointment_not_found';
  end if;

  if auth.uid() is not null and public.workspace_access_allowed() then
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null then
    select workspace.id
    into v_workspace_id
    from public.workspaces as workspace
    where lower(trim(workspace.owner_email::text)) = lower(trim(coalesce(p_owner_email::text, '')))
      and workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
  for update;

  if v_target.id is null then
    raise exception 'appointment_not_found';
  end if;

  v_group_id := v_target.appointment_group_id;

  if v_group_id is null then
    return public.cancel_owner_appointment_lane_guarded(
      v_target.id,
      v_target.appointment_date,
      v_target.appointment_time,
      v_target.customer_name,
      v_target.service_name,
      p_owner_email,
      p_salon_code,
      p_customer_email,
      p_customer_phone,
      p_cancellation_event_id,
      coalesce(nullif(trim(p_required_role), ''), v_target.required_role),
      coalesce(nullif(trim(p_operator_id), ''), v_target.operator_id),
      coalesce(nullif(trim(p_operator_name), ''), v_target.operator_name)
    );
  end if;

  select
    coalesce(array_agg(appointment.id order by appointment.appointment_group_order, appointment.id), array[]::uuid[])
  into v_group_appointment_ids
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  select
    coalesce(array_agg(request.id order by request.appointment_group_order, request.id), array[]::uuid[])
  into v_group_request_ids
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  foreach v_request_id in array v_group_request_ids
  loop
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_salon = true,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.workspace_id = v_workspace_id
      and request.id = v_request_id;
  end loop;

  -- Cancel the selected row through the established path so the canonical
  -- customer identity, history record and notification payload stay intact.
  v_primary_result := public.cancel_owner_appointment_lane_guarded(
    v_target.id,
    v_target.appointment_date,
    v_target.appointment_time,
    v_target.customer_name,
    v_target.service_name,
    p_owner_email,
    p_salon_code,
    p_customer_email,
    p_customer_phone,
    p_cancellation_event_id,
    coalesce(nullif(trim(p_required_role), ''), v_target.required_role),
    coalesce(nullif(trim(p_operator_id), ''), v_target.operator_id),
    coalesce(nullif(trim(p_operator_name), ''), v_target.operator_name)
  );

  -- Remove only the remaining services in this exact composition. Their
  -- request rows were already moved to the cancelled history above.
  perform set_config(
    'salonpro.skip_appointment_delete_client_cancellation',
    'on',
    true
  );
  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  update public.appointment_groups as appointment_group
  set status = 'cancelled',
      updated_at = timezone('utc', now())
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id;

  return coalesce(v_primary_result, '{}'::jsonb) || jsonb_build_object(
    'appointmentGroupId', v_group_id,
    'appointmentIds', to_jsonb(v_group_appointment_ids),
    'bookingRequestIds', to_jsonb(v_group_request_ids)
  );
end;
$$;

grant execute on function public.cancel_owner_linked_appointment_v1(
  uuid,
  date,
  time,
  text,
  text,
  citext,
  text,
  citext,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
