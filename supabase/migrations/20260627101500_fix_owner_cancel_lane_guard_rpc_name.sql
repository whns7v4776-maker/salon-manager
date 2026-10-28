drop function if exists public.cancel_owner_appointment(
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
);

create or replace function public.cancel_owner_appointment_lane_guarded(
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
  v_resolved_appointment_id uuid := p_appointment_id;
  v_required_role text := nullif(regexp_replace(trim(coalesce(p_required_role, '')), '\s+', ' ', 'g'), '');
  v_operator_id text := nullif(trim(coalesce(p_operator_id, '')), '');
  v_operator_name text := nullif(regexp_replace(trim(coalesce(p_operator_name, '')), '\s+', ' ', 'g'), '');
  v_has_lane_guard boolean;
begin
  v_has_lane_guard := v_required_role is not null
    or v_operator_id is not null
    or v_operator_name is not null;

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

  if v_resolved_appointment_id is null and v_has_lane_guard then
    if p_appointment_date is null
      or p_appointment_time is null
      or nullif(trim(coalesce(p_customer_name, '')), '') is null
      or nullif(trim(coalesce(p_service_name, '')), '') is null
    then
      raise exception 'appointment_not_found';
    end if;

    select appointment.id
    into v_resolved_appointment_id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = p_appointment_date
      and appointment.appointment_time = p_appointment_time
      and lower(trim(appointment.customer_name)) = lower(trim(coalesce(p_customer_name, '')))
      and lower(trim(appointment.service_name)) = lower(trim(coalesce(p_service_name, '')))
      and (
        v_required_role is null
        or lower(regexp_replace(trim(coalesce(appointment.required_role, '')), '\s+', ' ', 'g')) =
          lower(v_required_role)
      )
      and (
        v_operator_id is null
        or trim(coalesce(appointment.operator_id, '')) = v_operator_id
      )
      and (
        v_operator_name is null
        or lower(regexp_replace(trim(coalesce(appointment.operator_name, '')), '\s+', ' ', 'g')) =
          lower(v_operator_name)
      )
    order by appointment.created_at desc
    limit 1;

    if v_resolved_appointment_id is null then
      raise exception 'appointment_not_found';
    end if;
  end if;

  return public.cancel_owner_appointment(
    v_resolved_appointment_id,
    p_appointment_date,
    p_appointment_time,
    p_customer_name,
    p_service_name,
    p_owner_email,
    p_salon_code,
    p_customer_email,
    p_customer_phone,
    p_cancellation_event_id
  );
end;
$$;

grant execute on function public.cancel_owner_appointment_lane_guarded(uuid, date, time, text, text, citext, text, citext, text, text, text, text, text) to anon;
grant execute on function public.cancel_owner_appointment_lane_guarded(uuid, date, time, text, text, citext, text, citext, text, text, text, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
