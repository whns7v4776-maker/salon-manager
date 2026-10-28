-- Separate the salon Agenda contract from public booking availability.
-- Public/customer RPCs remain strict. Owner writes may bypass salon schedule,
-- service capability and capacity rules, while operator/customer overlaps still
-- require an explicit flag from the backoffice.

alter table public.appointments
  add column if not exists owner_override_snapshot jsonb not null default '{}'::jsonb;

alter table public.booking_requests
  add column if not exists owner_override_snapshot jsonb not null default '{}'::jsonb;

comment on column public.appointments.owner_override_snapshot is
  'Audit snapshot of explicit backoffice overrides used when the appointment was created.';

comment on column public.booking_requests.owner_override_snapshot is
  'Audit snapshot mirrored from the owner appointment creation contract.';

-- The established owner functions are kept as the single write implementation.
-- They only skip public availability/capability checks inside the transaction
-- opened by the flexible owner wrappers below.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  v_signature :=
    'public.create_owner_appointment_ultralight_v2(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if not public.is_public_booking_slot_available(',
    'if current_setting(''salonpro.owner_unrestricted'', true) <> ''on'' and not public.is_public_booking_slot_available('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:ultralight_v2';
  end if;
  execute v_next;

  v_signature :=
    'public.create_owner_phased_appointment_v1(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text,jsonb)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'not public.is_public_booking_slot_available(',
    'current_setting(''salonpro.owner_unrestricted'', true) <> ''on'' and not public.is_public_booking_slot_available('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:phased_v1';
  end if;
  execute v_next;

  v_signature :=
    'public.create_owner_appointment_ultralight_v3(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if not public.public_operator_can_book_service_v1(',
    'if current_setting(''salonpro.owner_unrestricted'', true) <> ''on'' and not public.public_operator_can_book_service_v1('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:ultralight_v3';
  end if;
  execute v_next;

  v_signature :=
    'public.create_owner_phased_appointment_v2(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text,jsonb)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if not public.public_operator_can_book_service_v1(',
    'if current_setting(''salonpro.owner_unrestricted'', true) <> ''on'' and not public.public_operator_can_book_service_v1('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:phased_v2';
  end if;
  execute v_next;

  v_signature :=
    'public.create_owner_appointment_group_v2(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if not public.public_operator_can_book_service_v1(',
    'if current_setting(''salonpro.owner_unrestricted'', true) <> ''on'' and not public.public_operator_can_book_service_v1('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:group_v2';
  end if;
  execute v_next;

  v_signature :=
    'public.create_owner_appointment_group_v3(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if exists (',
    'if current_setting(''salonpro.allow_owner_customer_overlap'', true) <> ''on'' and exists ('
  );
  v_next := replace(
    v_next,
    'if public.customer_terminal_pause_conflicts_v1(',
    'if current_setting(''salonpro.allow_owner_customer_overlap'', true) <> ''on'' and public.customer_terminal_pause_conflicts_v1('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:group_v3';
  end if;
  execute v_next;
end;
$$;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  v_signature := 'public.prevent_public_customer_time_overlap()'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    E'begin\n  if new.origin::text',
    E'begin\n  if current_setting(''salonpro.allow_owner_customer_overlap'', true) = ''on'' then\n    return new;\n  end if;\n\n  if new.origin::text'
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:public_customer_overlap_trigger';
  end if;
  execute v_next;
end;
$$;

-- An explicit owner override may also cross an existing terminal customer
-- pause. The bypass is transaction-local and can never be activated by public
-- booking RPCs.
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
  if current_setting('salonpro.allow_owner_customer_overlap', true) = 'on' then
    return new;
  end if;

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
  if current_setting('salonpro.allow_owner_customer_overlap', true) = 'on' then
    return new;
  end if;
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

create or replace function public.create_owner_appointment_flexible_v1(
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
  p_phase_snapshot jsonb default null,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false,
  p_allow_machinery_overlap boolean default false,
  p_allow_outside_schedule boolean default true,
  p_allow_capability_override boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result jsonb;
  v_phase jsonb;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_final_time time;
  v_start_at timestamp;
  v_end_at timestamp;
  v_operator_conflict boolean := false;
  v_customer_conflict boolean := false;
  v_override jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  join public.workspace_members as member on member.workspace_id = workspace.id
  where member.user_id = auth.uid()
    and (
      nullif(lower(trim(coalesce(p_salon_code, ''))), '') is null
      or workspace.slug = lower(trim(p_salon_code))
    )
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'customer_name_required';
  end if;
  if nullif(trim(coalesce(p_service_name, '')), '') is null then
    raise exception 'service_name_required';
  end if;
  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  v_phase := case
    when jsonb_typeof(p_phase_snapshot) = 'object'
      and coalesce(p_phase_snapshot ->> 'mode', '') = 'phased'
    then p_phase_snapshot
    else null
  end;
  v_initial := case when v_phase is not null
    then greatest(coalesce(nullif(v_phase ->> 'initialDurationMinutes', '')::integer, 1), 1)
    else greatest(coalesce(p_duration_minutes, 60), 1)
  end;
  v_processing := case when v_phase is not null
    then greatest(coalesce(nullif(v_phase ->> 'processingDurationMinutes', '')::integer, 1), 1)
    else 0
  end;
  v_final := case
    when v_phase is not null and coalesce((v_phase ->> 'finalPhaseEnabled')::boolean, true)
      then greatest(coalesce(nullif(v_phase ->> 'finalDurationMinutes', '')::integer, 1), 1)
    else 0
  end;
  v_total := v_initial + v_processing + v_final;
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;
  v_start_at := p_appointment_date::timestamp + p_appointment_time;
  v_end_at := v_start_at + make_interval(mins => v_total);

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text || ':' || p_appointment_date::text));

  v_operator_conflict := public.phased_operator_interval_conflicts_v1(
    v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
    p_operator_id, p_operator_name, null, null
  ) or (
    v_final > 0 and public.phased_operator_interval_conflicts_v1(
      v_workspace_id, p_appointment_date, v_final_time, v_final,
      p_operator_id, p_operator_name, null, null
    )
  );
  if v_operator_conflict and not coalesce(p_allow_operator_overlap, false) then
    raise exception 'owner_operator_overlap';
  end if;

  select exists (
    select 1
    from public.appointments as appointment
    left join public.customers as customer
      on customer.workspace_id = appointment.workspace_id
     and customer.id = appointment.customer_id
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = p_appointment_date
      and (
        lower(trim(appointment.customer_name)) = lower(trim(p_customer_name))
        or (
          nullif(lower(trim(coalesce(p_customer_email::text, ''))), '') is not null
          and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email::text))
        )
        or (
          nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
            regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
        )
      )
      and (appointment.appointment_date::timestamp + appointment.appointment_time) < v_end_at
      and (
        appointment.appointment_date::timestamp + appointment.appointment_time
        + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
      ) > v_start_at
  ) into v_customer_conflict;

  if not v_customer_conflict then
    select exists (
      select 1
      from public.booking_requests as request
      where request.workspace_id = v_workspace_id
        and request.status::text in ('pending', 'accepted')
        and request.appointment_date = p_appointment_date
        and not exists (
          select 1 from public.appointments as linked
          where linked.booking_request_id = request.id
        )
        and (
          lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
            lower(trim(p_customer_name))
          or (
            nullif(lower(trim(coalesce(p_customer_email::text, ''))), '') is not null
            and lower(trim(coalesce(request.customer_email::text, ''))) =
              lower(trim(p_customer_email::text))
          )
          or (
            nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is not null
            and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
              regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
          )
        )
        and (request.appointment_date::timestamp + request.appointment_time) < v_end_at
        and (
          request.appointment_date::timestamp + request.appointment_time
          + make_interval(mins => greatest(coalesce(request.requested_duration_minutes, 60), 1))
        ) > v_start_at
    ) into v_customer_conflict;
  end if;

  if not v_customer_conflict then
    v_customer_conflict := public.customer_terminal_pause_conflicts_v1(
      v_workspace_id, null, p_customer_name, p_customer_email, p_customer_phone,
      v_start_at, v_end_at, null
    );
  end if;
  if v_customer_conflict and not coalesce(p_allow_customer_overlap, false) then
    raise exception 'owner_customer_overlap';
  end if;

  perform set_config('salonpro.owner_unrestricted', 'on', true);
  perform set_config(
    'salonpro.allow_owner_customer_overlap',
    case when coalesce(p_allow_customer_overlap, false) then 'on' else 'off' end,
    true
  );

  if v_phase is not null then
    v_result := public.create_owner_phased_appointment_v2(
      p_customer_name, p_customer_phone, p_customer_email, p_customer_instagram,
      p_customer_note, p_customer_source, p_create_customer_record,
      p_create_booking_request, p_service_name, p_price, v_total,
      p_appointment_date, p_appointment_time, p_salon_code, p_operator_id,
      p_operator_name, p_required_role, v_phase
    );
  else
    v_result := public.create_owner_appointment_ultralight_v3(
      p_customer_name, p_customer_phone, p_customer_email, p_customer_instagram,
      p_customer_note, p_customer_source, p_create_customer_record,
      p_create_booking_request, p_service_name, p_price, v_total,
      p_appointment_date, p_appointment_time, p_salon_code, p_operator_id,
      p_operator_name, p_required_role
    );
  end if;

  v_override := jsonb_build_object(
    'version', 1,
    'operatorOverlap', v_operator_conflict and coalesce(p_allow_operator_overlap, false),
    'customerOverlap', v_customer_conflict and coalesce(p_allow_customer_overlap, false),
    'machineryOverlap', coalesce(p_allow_machinery_overlap, false),
    'outsideSchedule', coalesce(p_allow_outside_schedule, true),
    'capabilityOverride', coalesce(p_allow_capability_override, true),
    'createdBy', 'backoffice'
  );

  update public.appointments
  set owner_override_snapshot = v_override,
      phase_overlap_overrides = case
        when v_phase is not null and v_operator_conflict and coalesce(p_allow_operator_overlap, false)
          then jsonb_build_object('version', 1, 'initial', true, 'final', v_final > 0)
        else phase_overlap_overrides
      end
  where id = nullif(v_result ->> 'appointmentId', '')::uuid;

  if nullif(v_result ->> 'bookingRequestId', '') is not null then
    update public.booking_requests
    set owner_override_snapshot = v_override,
        phase_overlap_overrides = case
          when v_phase is not null and v_operator_conflict and coalesce(p_allow_operator_overlap, false)
            then jsonb_build_object('version', 1, 'initial', true, 'final', v_final > 0)
          else phase_overlap_overrides
        end,
        updated_at = timezone('utc', now())
    where id = (v_result ->> 'bookingRequestId')::uuid;
  end if;

  return v_result || jsonb_build_object('ownerOverrideSnapshot', v_override);
end;
$$;

revoke all on function public.create_owner_appointment_flexible_v1(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text, jsonb, boolean, boolean,
  boolean, boolean, boolean
) from public;
grant execute on function public.create_owner_appointment_flexible_v1(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text, jsonb, boolean, boolean,
  boolean, boolean, boolean
) to authenticated;

create or replace function public.create_owner_appointment_group_flexible_v1(
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
  p_create_booking_requests boolean,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false,
  p_allow_machinery_overlap boolean default false,
  p_allow_outside_schedule boolean default true,
  p_allow_capability_override boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
  v_phase jsonb;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_total integer;
  v_date date;
  v_time time;
  v_final_time time;
  v_start_at timestamp;
  v_end_at timestamp;
  v_operator_conflict boolean := false;
  v_customer_conflict boolean := false;
  v_result jsonb;
  v_override jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 2 then
    raise exception 'invalid_group_items';
  end if;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  join public.workspace_members as member on member.workspace_id = workspace.id
  where member.user_id = auth.uid()
    and workspace.slug = lower(trim(p_salon_code))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_date := (v_item ->> 'appointmentDate')::date;
    v_time := (v_item ->> 'appointmentTime')::time;
    v_phase := case
      when jsonb_typeof(v_item -> 'phaseSnapshot') = 'object'
        and coalesce(v_item #>> '{phaseSnapshot,mode}', '') = 'phased'
      then v_item -> 'phaseSnapshot'
      else null
    end;
    v_initial := case when v_phase is not null
      then greatest(coalesce(nullif(v_phase ->> 'initialDurationMinutes', '')::integer, 1), 1)
      else greatest(coalesce(nullif(v_item ->> 'durationMinutes', '')::integer, 60), 1)
    end;
    v_processing := case when v_phase is not null
      then greatest(coalesce(nullif(v_phase ->> 'processingDurationMinutes', '')::integer, 1), 1)
      else 0
    end;
    v_final := case
      when v_phase is not null and coalesce((v_phase ->> 'finalPhaseEnabled')::boolean, true)
        then greatest(coalesce(nullif(v_phase ->> 'finalDurationMinutes', '')::integer, 1), 1)
      else 0
    end;
    v_total := v_initial + v_processing + v_final;
    v_final_time := (v_time + make_interval(mins => v_initial + v_processing))::time;
    v_start_at := v_date::timestamp + v_time;
    v_end_at := v_start_at + make_interval(mins => v_total);

    v_operator_conflict := v_operator_conflict or public.phased_operator_interval_conflicts_v1(
      v_workspace_id, v_date, v_time, v_initial,
      v_item ->> 'operatorId', v_item ->> 'operatorName', null, null
    ) or (
      v_final > 0 and public.phased_operator_interval_conflicts_v1(
        v_workspace_id, v_date, v_final_time, v_final,
        v_item ->> 'operatorId', v_item ->> 'operatorName', null, null
      )
    );

    if not v_customer_conflict then
      select exists (
        select 1 from public.appointments as appointment
        where appointment.workspace_id = v_workspace_id
          and appointment.appointment_date = v_date
          and lower(trim(appointment.customer_name)) = lower(trim(p_customer_name))
          and (appointment.appointment_date::timestamp + appointment.appointment_time) < v_end_at
          and (
            appointment.appointment_date::timestamp + appointment.appointment_time
            + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))
          ) > v_start_at
      ) into v_customer_conflict;
    end if;
  end loop;

  if v_operator_conflict and not coalesce(p_allow_operator_overlap, false) then
    raise exception 'owner_operator_overlap';
  end if;
  if v_customer_conflict and not coalesce(p_allow_customer_overlap, false) then
    raise exception 'owner_customer_overlap';
  end if;

  perform set_config('salonpro.owner_unrestricted', 'on', true);
  perform set_config(
    'salonpro.allow_owner_customer_overlap',
    case when coalesce(p_allow_customer_overlap, false) then 'on' else 'off' end,
    true
  );

  v_result := public.create_owner_appointment_group_v3(
    p_salon_code, p_customer_name, p_customer_phone, p_customer_email,
    p_customer_instagram, p_customer_note, p_customer_source, p_group_title,
    p_items, p_idempotency_key, p_create_customer_record, p_create_booking_requests
  );

  v_override := jsonb_build_object(
    'version', 1,
    'operatorOverlap', v_operator_conflict and coalesce(p_allow_operator_overlap, false),
    'customerOverlap', v_customer_conflict and coalesce(p_allow_customer_overlap, false),
    'machineryOverlap', coalesce(p_allow_machinery_overlap, false),
    'outsideSchedule', coalesce(p_allow_outside_schedule, true),
    'capabilityOverride', coalesce(p_allow_capability_override, true),
    'createdBy', 'backoffice'
  );

  update public.appointments
  set owner_override_snapshot = v_override
  where appointment_group_id = nullif(v_result ->> 'groupId', '')::uuid;
  update public.booking_requests
  set owner_override_snapshot = v_override,
      updated_at = timezone('utc', now())
  where appointment_group_id = nullif(v_result ->> 'groupId', '')::uuid;

  return v_result || jsonb_build_object('ownerOverrideSnapshot', v_override);
end;
$$;

revoke all on function public.create_owner_appointment_group_flexible_v1(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean
) from public;
grant execute on function public.create_owner_appointment_group_flexible_v1(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;

-- Resizing keeps the existing, well-tested persistence paths. These wrappers
-- only add the explicit salon override for a real operator conflict.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  v_signature :=
    'public.resize_owner_appointment_duration_v2(uuid,integer,boolean)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if exists(',
    'if current_setting(''salonpro.allow_owner_operator_overlap'', true) <> ''on'' and exists('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:resize_v2';
  end if;
  execute v_next;

  v_signature :=
    'public.update_owner_phased_appointment_times_v2(uuid,integer,integer,integer,boolean)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_next := replace(
    v_definition,
    'if public.phased_operator_interval_conflicts_v1(',
    'if current_setting(''salonpro.allow_owner_operator_overlap'', true) <> ''on'' and public.phased_operator_interval_conflicts_v1('
  );
  if v_next = v_definition then
    raise exception 'owner_freedom_patch_missing:phased_times_v2';
  end if;
  execute v_next;
end;
$$;

create or replace function public.resize_owner_appointment_duration_v3(
  p_appointment_id uuid,
  p_next_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform set_config(
    'salonpro.allow_owner_operator_overlap',
    case when coalesce(p_allow_operator_overlap, false) then 'on' else 'off' end,
    true
  );
  perform set_config(
    'salonpro.allow_owner_customer_overlap',
    case when coalesce(p_allow_customer_overlap, false) then 'on' else 'off' end,
    true
  );
  v_result := public.resize_owner_appointment_duration_v2(
    p_appointment_id,
    p_next_duration_minutes,
    p_allow_customer_overlap
  );
  update public.appointments
  set owner_override_snapshot = coalesce(owner_override_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'resizeOperatorOverlap', coalesce(p_allow_operator_overlap, false),
      'resizeCustomerOverlap', coalesce(p_allow_customer_overlap, false),
      'updatedBy', 'backoffice'
    )
  where id = p_appointment_id;
  return v_result;
end;
$$;

revoke all on function public.resize_owner_appointment_duration_v3(
  uuid, integer, boolean, boolean
) from public;
grant execute on function public.resize_owner_appointment_duration_v3(
  uuid, integer, boolean, boolean
) to authenticated;

create or replace function public.update_owner_phased_appointment_times_v3(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform set_config(
    'salonpro.allow_owner_operator_overlap',
    case when coalesce(p_allow_operator_overlap, false) then 'on' else 'off' end,
    true
  );
  perform set_config(
    'salonpro.allow_owner_customer_overlap',
    case when coalesce(p_allow_customer_overlap, false) then 'on' else 'off' end,
    true
  );
  v_result := public.update_owner_phased_appointment_times_v2(
    p_appointment_id,
    p_initial_duration_minutes,
    p_processing_duration_minutes,
    p_final_duration_minutes,
    p_allow_customer_overlap
  );
  update public.appointments
  set owner_override_snapshot = coalesce(owner_override_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'phaseTimingOperatorOverlap', coalesce(p_allow_operator_overlap, false),
      'phaseTimingCustomerOverlap', coalesce(p_allow_customer_overlap, false),
      'updatedBy', 'backoffice'
    )
  where id = p_appointment_id;
  return v_result;
end;
$$;

revoke all on function public.update_owner_phased_appointment_times_v3(
  uuid, integer, integer, integer, boolean, boolean
) from public;
grant execute on function public.update_owner_phased_appointment_times_v3(
  uuid, integer, integer, integer, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
