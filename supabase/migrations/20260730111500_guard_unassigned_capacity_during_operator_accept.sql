create or replace function public.accept_owner_booking_request_with_operator_v2(
  p_request_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_next_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_operator_id uuid;
  v_duration integer;
  v_start_at timestamp;
  v_end_at timestamp;
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
    and booking_request.id = p_request_id;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_workspace_id::text || ':' || v_request.appointment_date::text)
  );

  v_duration := greatest(
    coalesce(p_next_duration_minutes, v_request.requested_duration_minutes, 60),
    1
  );
  v_start_at := v_request.appointment_date::timestamp + v_request.appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_duration);

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id is distinct from v_request.id
      and appointment.appointment_date = v_request.appointment_date
      and nullif(trim(coalesce(appointment.operator_id, '')), '') is null
      and nullif(trim(coalesce(appointment.operator_name, '')), '') is null
      and (v_request.appointment_date::timestamp + appointment.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_start_at
  ) then
    raise exception 'booking_request_conflict';
  end if;

  if exists (
    select 1
    from public.booking_requests as other_request
    where other_request.workspace_id = v_workspace_id
      and other_request.id <> v_request.id
      and other_request.status::text in ('pending', 'accepted')
      and other_request.appointment_date = v_request.appointment_date
      and nullif(trim(coalesce(other_request.requested_operator_id, '')), '') is null
      and nullif(trim(coalesce(other_request.requested_operator_name, '')), '') is null
      and (v_request.appointment_date::timestamp + other_request.appointment_time) < v_end_at
      and (
        v_request.appointment_date::timestamp
        + other_request.appointment_time
        + make_interval(
            mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1)
          )
      ) > v_start_at
  ) then
    raise exception 'booking_request_conflict';
  end if;

  select operator.id
  into v_operator_id
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '')
      or (
        nullif(trim(coalesce(p_operator_name, '')), '') is not null
        and lower(trim(operator.name)) =
          lower(trim(coalesce(p_operator_name, '')))
      )
    )
  order by
    case
      when operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '') then 0
      else 1
    end,
    operator.updated_at desc
  limit 1;

  if v_operator_id is null then
    raise exception 'operator_not_found';
  end if;

  return public.accept_owner_booking_request_with_operator_v1(
    p_request_id,
    v_operator_id,
    p_next_duration_minutes
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_with_operator_v2(
  uuid,
  text,
  text,
  integer
) from public;
grant execute on function public.accept_owner_booking_request_with_operator_v2(
  uuid,
  text,
  text,
  integer
) to authenticated;
