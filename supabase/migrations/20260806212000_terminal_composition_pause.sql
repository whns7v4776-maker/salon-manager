-- Persist a terminal customer pause for owner-created service compositions.
-- The pause extends the customer's commitment without creating an appointment
-- row, so it never occupies an operator lane and never changes reminder time.

create or replace function public.customer_terminal_pause_conflicts_v1(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email citext,
  p_customer_phone text,
  p_start_at timestamp,
  p_end_at timestamp,
  p_excluded_group_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.appointment_groups as appointment_group
    join public.appointments as final_appointment
      on final_appointment.workspace_id = appointment_group.workspace_id
      and final_appointment.appointment_group_id = appointment_group.id
      and final_appointment.appointment_group_order = final_appointment.appointment_group_size
    where appointment_group.workspace_id = p_workspace_id
      and appointment_group.status = 'active'
      and appointment_group.id is distinct from p_excluded_group_id
      and case
        when coalesce(appointment_group.metadata ->> 'terminalPauseMinutes', '') ~ '^[0-9]+$'
          then (appointment_group.metadata ->> 'terminalPauseMinutes')::integer
        else 0
      end > 0
      and (
        (p_customer_id is not null and appointment_group.customer_id = p_customer_id)
        or (
          nullif(lower(trim(coalesce(p_customer_name, ''))), '') is not null
          and lower(trim(final_appointment.customer_name)) =
            lower(trim(coalesce(p_customer_name, '')))
        )
        or (
          nullif(lower(trim(coalesce(p_customer_email::text, ''))), '') is not null
          and lower(trim(coalesce(appointment_group.metadata ->> 'customerEmail', ''))) =
            lower(trim(p_customer_email::text))
        )
        or (
          nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null
          and regexp_replace(
            coalesce(appointment_group.metadata ->> 'customerPhone', ''),
            '\D+',
            '',
            'g'
          ) = regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
        )
      )
      and (
        final_appointment.appointment_date::timestamp
        + final_appointment.appointment_time
        + make_interval(mins => greatest(coalesce(final_appointment.duration_minutes, 60), 1))
      ) < p_end_at
      and (
        final_appointment.appointment_date::timestamp
        + final_appointment.appointment_time
        + make_interval(mins => greatest(coalesce(final_appointment.duration_minutes, 60), 1))
        + make_interval(
          mins => case
            when coalesce(appointment_group.metadata ->> 'terminalPauseMinutes', '') ~ '^[0-9]+$'
              then (appointment_group.metadata ->> 'terminalPauseMinutes')::integer
            else 0
          end
        )
      ) > p_start_at
  );
$$;

revoke all on function public.customer_terminal_pause_conflicts_v1(
  uuid, uuid, text, citext, text, timestamp, timestamp, uuid
) from public;

create or replace function public.prevent_appointment_terminal_pause_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamp;
  v_end_at timestamp;
begin
  v_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_end_at := v_start_at
    + make_interval(mins => greatest(coalesce(new.duration_minutes, 60), 1));

  if public.customer_terminal_pause_conflicts_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_name,
    null,
    null,
    v_start_at,
    v_end_at,
    new.appointment_group_id
  ) then
    raise exception 'customer_terminal_pause_overlap';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_prevent_terminal_pause_overlap
  on public.appointments;

create trigger appointments_prevent_terminal_pause_overlap
before insert or update of
  appointment_date,
  appointment_time,
  duration_minutes,
  customer_id,
  customer_name,
  appointment_group_id
on public.appointments
for each row
execute function public.prevent_appointment_terminal_pause_overlap_v1();

create or replace function public.prevent_booking_request_terminal_pause_overlap_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamp;
  v_end_at timestamp;
begin
  if new.status::text not in ('pending', 'accepted') then
    return new;
  end if;

  v_start_at := new.appointment_date::timestamp + new.appointment_time;
  v_end_at := v_start_at
    + make_interval(mins => greatest(coalesce(new.requested_duration_minutes, 60), 1));

  if public.customer_terminal_pause_conflicts_v1(
    new.workspace_id,
    new.customer_id,
    new.customer_name,
    new.customer_email,
    new.customer_phone,
    v_start_at,
    v_end_at,
    new.appointment_group_id
  ) then
    raise exception 'customer_terminal_pause_overlap';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_prevent_terminal_pause_overlap
  on public.booking_requests;

create trigger booking_requests_prevent_terminal_pause_overlap
before insert or update of
  appointment_date,
  appointment_time,
  requested_duration_minutes,
  customer_id,
  customer_name,
  customer_email,
  customer_phone,
  appointment_group_id,
  status
on public.booking_requests
for each row
execute function public.prevent_booking_request_terminal_pause_overlap_v1();

create or replace function public.create_owner_appointment_group_v3(
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email citext,
  p_customer_instagram text,
  p_customer_note text,
  p_customer_source text,
  p_group_title text,
  p_items jsonb,
  p_idempotency_key text,
  p_create_customer_record boolean,
  p_create_booking_requests boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_group_id uuid;
  v_workspace_id uuid;
  v_customer_id uuid;
  v_last_item jsonb;
  v_terminal_pause integer := 0;
  v_buffer_start timestamp;
  v_buffer_end timestamp;
  v_item_pauses jsonb := '[]'::jsonb;
  v_customer_commitment_minutes integer := 0;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 2 then
    raise exception 'invalid_group_items';
  end if;

  v_last_item := p_items -> (jsonb_array_length(p_items) - 1);
  if coalesce(v_last_item ->> 'pauseAfterMinutes', '') <> ''
    and coalesce(v_last_item ->> 'pauseAfterMinutes', '') !~ '^[0-9]+$'
  then
    raise exception 'invalid_terminal_pause';
  end if;

  v_terminal_pause := greatest(
    0,
    least(180, coalesce(nullif(v_last_item ->> 'pauseAfterMinutes', '')::integer, 0))
  );
  if mod(v_terminal_pause, 5) <> 0 then
    raise exception 'invalid_terminal_pause_step';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', item.ordinality,
          'pauseAfterMinutes', greatest(
            0,
            least(
              180,
              case
                when coalesce(item.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]+$'
                  then (item.value ->> 'pauseAfterMinutes')::integer
                else 0
              end
            )
          )
        )
        order by item.ordinality
      ),
      '[]'::jsonb
    ),
    coalesce(
      sum(
        greatest(coalesce(nullif(item.value ->> 'durationMinutes', '')::integer, 60), 1)
        + greatest(
          0,
          least(
            180,
            case
              when coalesce(item.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]+$'
                then (item.value ->> 'pauseAfterMinutes')::integer
              else 0
            end
          )
        )
      ),
      0
    )::integer
  into v_item_pauses, v_customer_commitment_minutes
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  v_result := public.create_owner_appointment_group_v2(
    p_salon_code,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_instagram,
    p_customer_note,
    p_customer_source,
    p_group_title,
    p_items,
    p_idempotency_key,
    p_create_customer_record,
    p_create_booking_requests
  );

  v_group_id := nullif(v_result ->> 'groupId', '')::uuid;
  v_workspace_id := nullif(v_result ->> 'workspaceId', '')::uuid;
  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;

  if v_group_id is null then
    raise exception 'appointment_group_item_not_created';
  end if;
  if v_workspace_id is null then
    select appointment_group.workspace_id
    into v_workspace_id
    from public.appointment_groups as appointment_group
    where appointment_group.id = v_group_id;
  end if;
  if v_customer_id is null then
    select appointment_group.customer_id
    into v_customer_id
    from public.appointment_groups as appointment_group
    where appointment_group.id = v_group_id;
  end if;

  if v_terminal_pause > 0 then
    v_buffer_start :=
      (v_last_item ->> 'appointmentDate')::date::timestamp
      + (v_last_item ->> 'appointmentTime')::time
      + make_interval(
        mins => greatest(
          coalesce(nullif(v_last_item ->> 'durationMinutes', '')::integer, 60),
          1
        )
      );
    v_buffer_end := v_buffer_start + make_interval(mins => v_terminal_pause);

    perform pg_advisory_xact_lock(
      hashtext(v_workspace_id::text || ':' || (v_last_item ->> 'appointmentDate'))
    );

    if exists (
      select 1
      from public.appointments as appointment
      where appointment.workspace_id = v_workspace_id
        and appointment.appointment_group_id is distinct from v_group_id
        and (
          (v_customer_id is not null and appointment.customer_id = v_customer_id)
          or lower(trim(appointment.customer_name)) = lower(trim(p_customer_name))
        )
        and (appointment.appointment_date::timestamp + appointment.appointment_time) < v_buffer_end
        and (
          appointment.appointment_date::timestamp
          + appointment.appointment_time
          + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
        ) > v_buffer_start
    ) then
      raise exception 'terminal_pause_customer_overlap';
    end if;

    if exists (
      select 1
      from public.booking_requests as request
      where request.workspace_id = v_workspace_id
        and request.appointment_group_id is distinct from v_group_id
        and request.status::text in ('pending', 'accepted')
        and (
          (v_customer_id is not null and request.customer_id = v_customer_id)
          or lower(trim(request.customer_name)) = lower(trim(p_customer_name))
          or (
            nullif(lower(trim(coalesce(p_customer_email::text, ''))), '') is not null
            and request.customer_email = p_customer_email
          )
          or (
            nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null
            and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
              regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
          )
        )
        and (request.appointment_date::timestamp + request.appointment_time) < v_buffer_end
        and (
          request.appointment_date::timestamp
          + request.appointment_time
          + make_interval(
            mins => greatest(coalesce(request.requested_duration_minutes, 60), 1)
          )
        ) > v_buffer_start
    ) then
      raise exception 'terminal_pause_customer_overlap';
    end if;

    if public.customer_terminal_pause_conflicts_v1(
      v_workspace_id,
      v_customer_id,
      p_customer_name,
      p_customer_email,
      p_customer_phone,
      v_buffer_start,
      v_buffer_end,
      v_group_id
    ) then
      raise exception 'terminal_pause_customer_overlap';
    end if;
  end if;

  update public.appointment_groups
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'itemPauses', v_item_pauses,
        'terminalPauseMinutes', v_terminal_pause,
        'customerCommitmentMinutes', v_customer_commitment_minutes,
        'customerCommitmentEndLocal', case
          when v_terminal_pause > 0 then to_char(v_buffer_end, 'YYYY-MM-DD"T"HH24:MI:SS')
          else null
        end,
        'customerEmail', nullif(lower(trim(coalesce(p_customer_email::text, ''))), ''),
        'customerPhone', nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '')
      ),
      updated_at = timezone('utc', now())
  where id = v_group_id
    and workspace_id = v_workspace_id;

  return v_result || jsonb_build_object(
    'terminalPauseMinutes', v_terminal_pause,
    'customerCommitmentMinutes', v_customer_commitment_minutes
  );
end;
$$;

revoke all on function public.create_owner_appointment_group_v3(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) from public;

grant execute on function public.create_owner_appointment_group_v3(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
