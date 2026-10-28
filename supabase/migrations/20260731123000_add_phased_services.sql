alter table public.services
  add column if not exists phase_config jsonb not null default '{}'::jsonb;

alter table public.booking_requests
  add column if not exists phase_snapshot jsonb;

alter table public.appointments
  add column if not exists phase_snapshot jsonb;

comment on column public.services.phase_config is
  'Optional three-stage service template: initial operator work, free processing time, final operator work.';
comment on column public.booking_requests.phase_snapshot is
  'Immutable phased-service timing captured when the customer sends the request.';
comment on column public.appointments.phase_snapshot is
  'Immutable phased-service timing captured for the appointment.';

create or replace function public.copy_booking_phase_snapshot_to_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phase_snapshot is null and new.booking_request_id is not null then
    select booking_request.phase_snapshot
    into new.phase_snapshot
    from public.booking_requests as booking_request
    where booking_request.id = new.booking_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_copy_booking_phase_snapshot on public.appointments;
create trigger appointments_copy_booking_phase_snapshot
before insert or update of booking_request_id on public.appointments
for each row execute function public.copy_booking_phase_snapshot_to_appointment();

create or replace function public.booking_busy_snapshot_overlaps_range(
  p_appointment_date date,
  p_appointment_time time,
  p_fallback_duration_minutes integer,
  p_phase_snapshot jsonb,
  p_requested_start_at timestamp,
  p_requested_end_at timestamp
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_base_start timestamp := p_appointment_date::timestamp + p_appointment_time;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_start timestamp;
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') = 'phased'
    and coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') ~ '^[0-9]+$'
    and coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') ~ '^[0-9]+$'
    and coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') ~ '^[0-9]+$'
  then
    v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
    v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
    v_final := greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1);
    v_final_start := v_base_start + make_interval(mins => v_initial + v_processing);

    return (
      v_base_start < p_requested_end_at
      and v_base_start + make_interval(mins => v_initial) > p_requested_start_at
    ) or (
      v_final_start < p_requested_end_at
      and v_final_start + make_interval(mins => v_final) > p_requested_start_at
    );
  end if;

  return v_base_start < p_requested_end_at
    and v_base_start + make_interval(
      mins => greatest(coalesce(p_fallback_duration_minutes, 60), 1)
    ) > p_requested_start_at;
end;
$$;

-- Keep the mature operator/capacity logic intact and only replace its two
-- continuous overlap predicates with the phased-aware predicate. The guards
-- deliberately fail the migration if the production function has drifted.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_appointment_pattern text := $pattern$and[[:space:]]+\(p_appointment_date::timestamp \+ appointment\.appointment_time\) < v_requested_end_at[[:space:]]+and[[:space:]]+\([[:space:]]+\(p_appointment_date::timestamp \+ appointment\.appointment_time\)[[:space:]]+\+ make_interval\(mins => (coalesce\(appointment\.duration_minutes, 60\)|greatest\(coalesce\(appointment\.duration_minutes, 60\), 1\))\)[[:space:]]+\) > v_requested_start_at$pattern$;
  v_appointment_new text := $new$and appointment.id::text <> coalesce(
        nullif(current_setting('app.booking_exclude_appointment_id', true), ''),
        '__none__'
      )
      and public.booking_busy_snapshot_overlaps_range(
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.duration_minutes,
        appointment.phase_snapshot,
        v_requested_start_at,
        v_requested_end_at
      )$new$;
  v_request_pattern text := $pattern$and[[:space:]]+\(p_appointment_date::timestamp \+ booking_request\.appointment_time\) < v_requested_end_at[[:space:]]+and[[:space:]]+\([[:space:]]+\(p_appointment_date::timestamp \+ booking_request\.appointment_time\)[[:space:]]+\+ make_interval\(mins => (coalesce\(booking_request\.requested_duration_minutes, 60\)|greatest\(coalesce\(booking_request\.requested_duration_minutes, 60\), 1\))\)[[:space:]]+\) > v_requested_start_at$pattern$;
  v_request_new text := $new$and booking_request.id::text <> coalesce(
        nullif(current_setting('app.booking_exclude_request_id', true), ''),
        '__none__'
      )
      and public.booking_busy_snapshot_overlaps_range(
        booking_request.appointment_date,
        booking_request.appointment_time,
        booking_request.requested_duration_minutes,
        booking_request.phase_snapshot,
        v_requested_start_at,
        v_requested_end_at
      )$new$;
begin
  v_definition := pg_get_functiondef(
    'public.is_public_booking_slot_available(uuid,date,time,integer,text,text,text)'::regprocedure
  );
  if strpos(v_definition, 'appointment.phase_snapshot') > 0 then
    v_updated := v_definition;
  else
    v_updated := regexp_replace(v_definition, v_appointment_pattern, v_appointment_new);
    if v_updated = v_definition then
      raise exception 'phased_booking_appointment_overlap_patch_not_applied';
    end if;
  end if;

  v_definition := v_updated;
  if strpos(v_definition, 'booking_request.phase_snapshot') > 0 then
    v_updated := v_definition;
  else
    v_updated := regexp_replace(v_definition, v_request_pattern, v_request_new);
    if v_updated = v_definition then
      raise exception 'phased_booking_request_overlap_patch_not_applied';
    end if;
  end if;

  execute v_updated;
end;
$migration$;

create or replace function public.create_public_phased_booking_request_v1(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_phase_snapshot jsonb default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_customer_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_customer_full_name text := trim(concat_ws(' ', coalesce(p_customer_name, ''), coalesce(p_customer_surname, '')));
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased'
    or coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') !~ '^[0-9]+$'
    or nullif(trim(coalesce(p_phase_snapshot ->> 'finalServiceName', '')), '') is null
  then
    raise exception 'invalid_phase_snapshot';
  end if;

  v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
  v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
  v_final := greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1);
  v_total := v_initial + v_processing + v_final;
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  if v_initial > 480 or v_processing > 480 or v_final > 480 or v_total > 960 then
    raise exception 'invalid_phase_snapshot';
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace_id,
    p_appointment_date,
    p_appointment_time,
    v_initial,
    p_requested_service_name,
    p_operator_id,
    p_operator_name
  ) or not public.is_public_booking_slot_available(
    v_workspace_id,
    p_appointment_date,
    v_final_time,
    v_final,
    p_requested_service_name,
    p_operator_id,
    p_operator_name
  ) then
    raise exception 'slot_unavailable';
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (v_customer_phone is not null and coalesce(customer.phone, '') = v_customer_phone)
      or lower(trim(coalesce(customer.full_name, ''))) = lower(v_customer_full_name)
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
      )
      and (p_appointment_date::timestamp + appointment.appointment_time) <
        (p_appointment_date::timestamp + p_appointment_time + make_interval(mins => v_total))
      and (
        p_appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > (p_appointment_date::timestamp + p_appointment_time)
  ) or exists (
    select 1
    from public.booking_requests as booking_request
    where booking_request.workspace_id = v_workspace_id
      and booking_request.status in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and (
        (v_customer_id is not null and booking_request.customer_id = v_customer_id)
        or booking_request.customer_email = v_customer_email
        or coalesce(booking_request.customer_phone, '') = v_customer_phone
        or lower(trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname))) =
          lower(v_customer_full_name)
      )
      and (p_appointment_date::timestamp + booking_request.appointment_time) <
        (p_appointment_date::timestamp + p_appointment_time + make_interval(mins => v_total))
      and (
        p_appointment_date::timestamp + booking_request.appointment_time
        + make_interval(mins => greatest(coalesce(booking_request.requested_duration_minutes, 60), 1))
      ) > (p_appointment_date::timestamp + p_appointment_time)
  ) then
    raise exception 'customer_time_conflict';
  end if;

  v_request := public.create_public_booking_request_ultralight_v2(
    p_salon_code,
    p_requested_service_name,
    p_requested_price,
    v_initial,
    p_appointment_date,
    p_appointment_time,
    p_customer_name,
    p_customer_surname,
    p_customer_email,
    p_customer_phone,
    p_customer_instagram,
    p_notes,
    p_required_role,
    p_operator_id,
    p_operator_name
  );

  update public.booking_requests
  set requested_duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot,
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot
  where booking_request_id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_request;
end;
$$;

grant execute on function public.create_public_phased_booking_request_v1(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.create_owner_phased_appointment_v1(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_required_role text default null,
  p_phase_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_result jsonb;
  v_appointment_id uuid;
  v_booking_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased'
    or coalesce(p_phase_snapshot ->> 'initialDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'processingDurationMinutes', '') !~ '^[0-9]+$'
    or coalesce(p_phase_snapshot ->> 'finalDurationMinutes', '') !~ '^[0-9]+$'
  then
    raise exception 'invalid_phase_snapshot';
  end if;

  v_initial := greatest((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 1);
  v_processing := greatest((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 1);
  v_final := greatest((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 1);
  v_total := v_initial + v_processing + v_final;
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  join public.workspace_members as member on member.workspace_id = w.id
  where member.user_id = auth.uid()
    and (
      nullif(lower(trim(coalesce(p_salon_code, ''))), '') is null
      or w.slug = lower(trim(p_salon_code))
    )
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  if not public.is_public_booking_slot_available(
    v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
    p_service_name, p_operator_id, p_operator_name
  ) or not public.is_public_booking_slot_available(
    v_workspace_id, p_appointment_date, v_final_time, v_final,
    p_service_name, p_operator_id, p_operator_name
  ) then
    raise exception 'target_slot_occupied';
  end if;

  v_result := public.create_owner_appointment_ultralight_v2(
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_instagram,
    p_customer_note,
    p_customer_source,
    p_create_customer_record,
    p_create_booking_request,
    p_service_name,
    p_price,
    v_initial,
    p_appointment_date,
    p_appointment_time,
    p_salon_code,
    p_operator_id,
    p_operator_name,
    p_required_role
  );

  v_appointment_id := nullif(v_result ->> 'appointmentId', '')::uuid;
  v_booking_request_id := nullif(v_result ->> 'bookingRequestId', '')::uuid;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = p_phase_snapshot
  where id = v_appointment_id;

  if v_booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = v_total,
        phase_snapshot = p_phase_snapshot,
        updated_at = timezone('utc', now())
    where id = v_booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_result || jsonb_build_object(
    'durationMinutes', v_total,
    'phaseSnapshot', p_phase_snapshot
  );
end;
$$;

grant execute on function public.create_owner_phased_appointment_v1(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text, jsonb
) to authenticated;

create or replace function public.update_owner_phased_appointment_times_v1(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_snapshot jsonb;
  v_total integer;
  v_final_time time;
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
  limit 1;

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

  v_total := p_initial_duration_minutes + p_processing_duration_minutes + p_final_duration_minutes;
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

  perform pg_advisory_xact_lock(
    hashtext(v_appointment.workspace_id::text || ':' || v_appointment.appointment_date::text)
  );
  perform set_config('app.booking_exclude_appointment_id', v_appointment.id::text, true);
  perform set_config(
    'app.booking_exclude_request_id',
    coalesce(v_appointment.booking_request_id::text, ''),
    true
  );

  if not public.is_public_booking_slot_available(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    p_initial_duration_minutes,
    v_appointment.service_name,
    v_appointment.operator_id,
    v_appointment.operator_name
  ) or not public.is_public_booking_slot_available(
    v_appointment.workspace_id,
    v_appointment.appointment_date,
    v_final_time,
    p_final_duration_minutes,
    v_appointment.service_name,
    v_appointment.operator_id,
    v_appointment.operator_name
  ) then
    raise exception 'target_slot_occupied';
  end if;

  update public.appointments
  set duration_minutes = v_total,
      phase_snapshot = v_snapshot
  where id = v_appointment.id;

  if v_appointment.booking_request_id is not null then
    update public.booking_requests
    set requested_duration_minutes = v_total,
        phase_snapshot = v_snapshot,
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where id = v_appointment.booking_request_id;
  end if;

  perform public.refresh_workspace_agenda_state(v_appointment.workspace_id);
  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'duration_minutes', v_total,
    'phase_snapshot', v_snapshot
  );
end;
$$;

grant execute on function public.update_owner_phased_appointment_times_v1(uuid, integer, integer, integer)
  to authenticated;

create or replace function public.get_public_booking_occupancy_phased_v1(
  p_salon_code text,
  p_date date
)
returns table (
  id text,
  data text,
  ora text,
  cliente text,
  servizio text,
  prezzo numeric,
  durata_minuti integer,
  phase_snapshot jsonb,
  operatore_id text,
  operatore_nome text
)
language sql
security definer
set search_path = public
stable
as $$
  with target_workspace as (
    select portal.workspace_id
    from public.client_portals as portal
    where portal.salon_code = lower(trim(p_salon_code))
      and portal.subscription_status in ('active', 'demo')
    limit 1
  ),
  live_appointments as (
    select
      appointment.id::text,
      appointment.appointment_date::text,
      to_char(appointment.appointment_time, 'HH24:MI'),
      appointment.customer_name,
      appointment.service_name,
      appointment.price,
      appointment.duration_minutes,
      appointment.phase_snapshot,
      appointment.operator_id,
      appointment.operator_name
    from public.appointments as appointment
    join target_workspace on target_workspace.workspace_id = appointment.workspace_id
    where appointment.appointment_date = p_date
  ),
  live_requests as (
    select
      case when booking_request.status = 'accepted'
        then 'accepted-' || booking_request.id::text
        else 'pending-' || booking_request.id::text
      end,
      booking_request.appointment_date::text,
      to_char(booking_request.appointment_time, 'HH24:MI'),
      trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)),
      booking_request.requested_service_name,
      booking_request.requested_price,
      booking_request.requested_duration_minutes,
      booking_request.phase_snapshot,
      booking_request.requested_operator_id,
      booking_request.requested_operator_name
    from public.booking_requests as booking_request
    join target_workspace on target_workspace.workspace_id = booking_request.workspace_id
    where booking_request.appointment_date = p_date
      and booking_request.status in ('pending', 'accepted')
      and (
        booking_request.status <> 'accepted'
        or not exists (
          select 1 from public.appointments as appointment
          where appointment.workspace_id = booking_request.workspace_id
            and (
              appointment.booking_request_id = booking_request.id
              or (
                appointment.appointment_date = booking_request.appointment_date
                and appointment.appointment_time = booking_request.appointment_time
                and lower(trim(appointment.customer_name)) = lower(trim(concat_ws(' ', booking_request.customer_name, booking_request.customer_surname)))
                and lower(trim(appointment.service_name)) = lower(trim(booking_request.requested_service_name))
              )
            )
        )
      )
  )
  select * from live_appointments
  union all
  select * from live_requests
$$;

grant execute on function public.get_public_booking_occupancy_phased_v1(text, date)
  to anon, authenticated;

create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'descrizione', coalesce(service.description, ''),
          'prezzo', service.price,
          'prezzoOriginale', service.original_price,
          'scontoAttivo', service.discount_enabled,
          'scontoValidoDal', service.discount_valid_from,
          'scontoValidoAl', service.discount_valid_to,
          'scontoOraDalle', case when service.discount_start_time is null then null else to_char(service.discount_start_time, 'HH24:MI') end,
          'scontoOraAlle', case when service.discount_end_time is null then null else to_char(service.discount_end_time, 'HH24:MI') end,
          'durataMinuti', service.duration_minutes,
          'phaseConfig', service.phase_config,
          'mestiereRichiesto', coalesce(service.required_role, ''),
          'badgeCliente', coalesce(service.client_badge, ''),
          'ordineMestiereCliente', service.client_role_display_order,
          'ordineCliente', service.client_display_order,
          'disponibileOnline', true
        )
        order by service.client_role_display_order, service.required_role,
          service.client_display_order, service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb))
          with ordinality as existing(existing_item, existing_position)
        where nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
          )
        order by case when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0 else 1 end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
        and service.is_online = true
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

notify pgrst, 'reload schema';
