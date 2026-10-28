create or replace function public.move_owner_appointment_direct_v3(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_next_start timestamp;
  v_next_end timestamp;
  v_customer_duration_minutes integer;
  v_customer_conflict boolean := false;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_scope not in ('whole', 'initial', 'final') then
    raise exception 'invalid_scope';
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

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || p_next_appointment_date::text)
  );

  -- Il cliente resta impegnato per l'intero servizio con posa, inclusa la pausa
  -- centrale. Basta anche un solo minuto condiviso con un altro ramo per chiedere
  -- una forzatura esplicita al salone.
  if p_scope = 'whole'
    and (
      p_next_appointment_date is distinct from v_appointment.appointment_date
      or p_next_appointment_time is distinct from v_appointment.appointment_time
    )
    and not p_allow_customer_overlap then
    v_customer_duration_minutes := case
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

    v_next_start := p_next_appointment_date::timestamp + p_next_appointment_time;
    v_next_end := v_next_start + make_interval(mins => v_customer_duration_minutes);

    select exists (
      select 1
      from public.appointments as other
      where other.workspace_id = v_appointment.workspace_id
        and other.id <> v_appointment.id
        and (
          (
            v_appointment.customer_id is not null
            and other.customer_id is not null
            and other.customer_id = v_appointment.customer_id
          )
          or (
            lower(regexp_replace(trim(coalesce(other.customer_name, '')), '\s+', ' ', 'g')) =
              lower(regexp_replace(trim(coalesce(v_appointment.customer_name, '')), '\s+', ' ', 'g'))
            and trim(coalesce(v_appointment.customer_name, '')) <> ''
          )
        )
        and (other.appointment_date::timestamp + other.appointment_time) < v_next_end
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
        ) > v_next_start
    ) into v_customer_conflict;

    if v_customer_conflict then
      raise exception 'customer_time_overlap';
    end if;
  end if;

  v_result := public.move_owner_appointment_direct_v2(
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

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'customer_overlap_forced', p_allow_customer_overlap
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v3(
  uuid, date, time, text, text, text, text, text, boolean, boolean
) from public;

grant execute on function public.move_owner_appointment_direct_v3(
  uuid, date, time, text, text, text, text, text, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
