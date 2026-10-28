-- A complete complex day may require several resumable RPC calls because the
-- public database role has a short statement timeout. Keep this consistency
-- counter separate from public_availability_revisions: that existing table is
-- a Realtime UI signal, while this table is an internal read fence for one
-- resumable day attempt and cached-summary validation. It is intentionally not
-- added to any Realtime publication.

create table if not exists public.public_booking_consistency_revisions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  salon_code text not null,
  revision bigint not null default 0,
  last_transaction_id bigint not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.public_booking_consistency_revisions enable row level security;
revoke all on table public.public_booking_consistency_revisions
  from public, anon, authenticated;

-- Realtime consumers need both sides of a move. Without FULL identity an
-- UPDATE only carries the primary key in `old`, so moving 26 -> 27 cannot
-- invalidate the former date and can leave a stale green/red summary behind.
alter table public.appointments replica identity full;
alter table public.booking_requests replica identity full;

create or replace function public.bump_public_booking_consistency_revision_v1(
  p_workspace_id uuid,
  p_salon_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_transaction_id bigint := txid_current();
begin
  insert into public.public_booking_consistency_revisions (
    workspace_id,
    salon_code,
    revision,
    last_transaction_id,
    updated_at
  )
  select
    p_workspace_id,
    lower(trim(p_salon_code)),
    1,
    v_transaction_id,
    clock_timestamp()
  where p_workspace_id is not null
    and nullif(lower(trim(coalesce(p_salon_code, ''))), '') is not null
  on conflict (workspace_id) do update set
    salon_code = excluded.salon_code,
    revision = public.public_booking_consistency_revisions.revision + 1,
    last_transaction_id = excluded.last_transaction_id,
    updated_at = excluded.updated_at
  where public.public_booking_consistency_revisions.last_transaction_id
      is distinct from excluded.last_transaction_id
     or public.public_booking_consistency_revisions.salon_code
      is distinct from excluded.salon_code;
end;
$$;

revoke all on function public.bump_public_booking_consistency_revision_v1(
  uuid, text
) from public, anon, authenticated;

create or replace function public.touch_public_booking_consistency_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_old_row jsonb;
  v_new_row jsonb;
  v_workspace_id uuid;
  v_old_workspace_id uuid;
  v_salon_code text;
begin
  v_old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;

  -- Whole owner snapshots and public portal rows also carry payments,
  -- notification/read state, cards and presentation data. Only the keys read
  -- by public-booking planners delimit a resumable availability calculation.
  if tg_op = 'UPDATE' and tg_table_name = 'workspaces' then
    if jsonb_build_object(
      'slug', v_old_row -> 'slug',
      'subscription_status', v_old_row -> 'subscription_status',
      'is_internal_tester', v_old_row -> 'is_internal_tester'
    ) = jsonb_build_object(
      'slug', v_new_row -> 'slug',
      'subscription_status', v_new_row -> 'subscription_status',
      'is_internal_tester', v_new_row -> 'is_internal_tester'
    ) then
      return new;
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'owner_app_snapshots' then
    if jsonb_build_object(
      'appuntamenti', v_old_row -> 'payload' -> 'appuntamenti',
      'richiestePrenotazione', v_old_row -> 'payload' -> 'richiestePrenotazione',
      'servizi', v_old_row -> 'payload' -> 'servizi',
      'operatori', v_old_row -> 'payload' -> 'operatori',
      'availabilitySettings', v_old_row -> 'payload' -> 'availabilitySettings',
      'macchinari', v_old_row -> 'payload' -> 'macchinari',
      'clienti', v_old_row -> 'payload' -> 'clienti'
    ) = jsonb_build_object(
      'appuntamenti', v_new_row -> 'payload' -> 'appuntamenti',
      'richiestePrenotazione', v_new_row -> 'payload' -> 'richiestePrenotazione',
      'servizi', v_new_row -> 'payload' -> 'servizi',
      'operatori', v_new_row -> 'payload' -> 'operatori',
      'availabilitySettings', v_new_row -> 'payload' -> 'availabilitySettings',
      'macchinari', v_new_row -> 'payload' -> 'macchinari',
      'clienti', v_new_row -> 'payload' -> 'clienti'
    ) then
      return new;
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'client_portals' then
    if jsonb_build_object(
      'appuntamenti', v_old_row -> 'appuntamenti',
      'richieste_prenotazione', v_old_row -> 'richieste_prenotazione',
      'servizi', v_old_row -> 'servizi',
      'operatori', v_old_row -> 'operatori',
      'availability_settings', v_old_row -> 'availability_settings',
      'macchinari', v_old_row -> 'macchinari',
      'clienti', v_old_row -> 'clienti',
      'salon_code', v_old_row -> 'salon_code',
      'subscription_status', v_old_row -> 'subscription_status'
    ) = jsonb_build_object(
      'appuntamenti', v_new_row -> 'appuntamenti',
      'richieste_prenotazione', v_new_row -> 'richieste_prenotazione',
      'servizi', v_new_row -> 'servizi',
      'operatori', v_new_row -> 'operatori',
      'availability_settings', v_new_row -> 'availability_settings',
      'macchinari', v_new_row -> 'macchinari',
      'clienti', v_new_row -> 'clienti',
      'salon_code', v_new_row -> 'salon_code',
      'subscription_status', v_new_row -> 'subscription_status'
    ) then
      return new;
    end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'workspaces' then
    -- The revision row is deleted by the workspace foreign-key cascade. Do
    -- not recreate it from an AFTER DELETE trigger.
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_workspace_id := nullif(v_row ->> 'id', '')::uuid;
    v_salon_code := nullif(lower(trim(coalesce(v_row ->> 'slug', ''))), '');
  else
    v_workspace_id := nullif(v_row ->> 'workspace_id', '')::uuid;
    select nullif(lower(trim(workspace.slug)), '')
    into v_salon_code
    from public.workspaces as workspace
    where workspace.id = v_workspace_id;
  end if;

  -- Moving a source row between workspaces changes availability on both
  -- sides. It is uncommon, but failing closed here keeps the fence complete.
  if tg_op = 'UPDATE' and tg_table_name <> 'workspaces' then
    v_old_workspace_id := nullif(v_old_row ->> 'workspace_id', '')::uuid;
    if v_old_workspace_id is distinct from v_workspace_id then
      select nullif(lower(trim(workspace.slug)), '')
      into v_salon_code
      from public.workspaces as workspace
      where workspace.id = v_old_workspace_id;

      if v_old_workspace_id is not null and v_salon_code is not null then
        perform public.bump_public_booking_consistency_revision_v1(
          v_old_workspace_id,
          v_salon_code
        );
      end if;

      select nullif(lower(trim(workspace.slug)), '')
      into v_salon_code
      from public.workspaces as workspace
      where workspace.id = v_workspace_id;
    end if;
  end if;

  if v_workspace_id is not null and v_salon_code is not null then
    perform public.bump_public_booking_consistency_revision_v1(
      v_workspace_id,
      v_salon_code
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.touch_public_booking_consistency_revision_v1()
  from public, anon, authenticated;

-- These are exactly the persisted inputs read directly or through helpers by
-- the simple, phased, dependency and composition public planners. A row-level
-- trigger is intentional: multi-row statements may touch more than one
-- workspace, and each workspace needs an independent monotonic boundary.
do $install_public_booking_consistency_triggers$
declare
  v_table_name text;
  v_trigger_name text;
begin
  foreach v_table_name in array array[
    'workspaces',
    'owner_app_snapshots',
    'client_portals',
    'services',
    'operators',
    'customers',
    'appointments',
    'booking_requests',
    'appointment_groups',
    'service_compositions',
    'service_composition_items',
    'operator_public_booking_policies',
    'operator_public_service_links',
    'customer_service_duration_overrides',
    'customer_online_booking_policies',
    'customer_online_service_overrides',
    'customer_online_composition_overrides'
  ]
  loop
    v_trigger_name := 'touch_public_booking_consistency_' || v_table_name;
    execute format(
      'drop trigger if exists %I on public.%I',
      v_trigger_name,
      v_table_name
    );
    execute format(
      'create constraint trigger %I after insert or update or delete on public.%I '
      || 'deferrable initially deferred for each row '
      || 'execute function public.touch_public_booking_consistency_revision_v1()',
      v_trigger_name,
      v_table_name
    );
  end loop;
end;
$install_public_booking_consistency_triggers$;

-- Existing workspaces predate the counter. Backfill without manufacturing a
-- large revision; every later relevant transaction increments it atomically.
insert into public.public_booking_consistency_revisions (
  workspace_id,
  salon_code,
  revision,
  last_transaction_id,
  updated_at
)
select
  workspace.id,
  lower(trim(workspace.slug)),
  1,
  txid_current(),
  clock_timestamp()
from public.workspaces as workspace
where nullif(lower(trim(workspace.slug)), '') is not null
on conflict (workspace_id) do update set
  salon_code = excluded.salon_code,
  revision = greatest(public.public_booking_consistency_revisions.revision, 1);

-- The final public writers use the phase-aware interval guard. Patch the
-- effective read planners in place so their green result cannot ignore a
-- phased request whose appointment materialization is temporarily missing.
-- Exact regprocedure signatures make this migration fail closed if the
-- deployed planner contract has drifted.
do $align_public_booking_planners_with_writers$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.get_public_booking_slot_availability_batch(uuid,date,jsonb,text,text,text)'::regprocedure,
    'public.get_public_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text)'::regprocedure,
    'public.get_public_phased_booking_slot_availability_batch_v2(uuid,date,jsonb,text,text,text,text,boolean)'::regprocedure,
    'public.get_public_phased_booking_slot_availability_batch_v3(uuid,date,jsonb,text,text,text,text,boolean)'::regprocedure,
    'public.resolve_public_composition_operator_plan_v1(uuid,uuid,date,time without time zone,text,text,text,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated := replace(
      v_definition,
      'public.is_public_booking_slot_available(',
      'public.is_public_operator_interval_available_v1('
    );

    if v_updated is distinct from v_definition then
      execute v_updated;
    end if;

    select pg_get_functiondef(v_signature) into v_definition;
    if position('public.is_public_operator_interval_available_v1(' in v_definition) = 0
      or position('public.is_public_booking_slot_available(' in v_definition) > 0
    then
      raise exception 'phase_aware_public_planner_not_installed:%', v_signature;
    end if;
  end loop;
end;
$align_public_booking_planners_with_writers$;

-- The hard customer-envelope helper predates terminal composition pauses.
-- Final writes already reject those pauses through a separate trigger; fold
-- the same check into the shared read helper so dependency/composition
-- planners cannot advertise a start that submit will roll back.
do $align_public_customer_envelope_with_terminal_pause$
declare
  v_signature regprocedure :=
    'public.public_customer_booking_envelope_available_v1(uuid,date,time without time zone,integer,text,text)'::regprocedure;
  v_definition text;
  v_updated text;
  v_anchor text := E'  return true;\nend;';
  v_replacement text := E'  if public.customer_terminal_pause_conflicts_v1(\n'
    || E'    p_workspace_id,\n'
    || E'    v_customer_id,\n'
    || E'    null,\n'
    || E'    v_customer_email,\n'
    || E'    v_customer_phone,\n'
    || E'    v_requested_start_at,\n'
    || E'    v_requested_end_at,\n'
    || E'    null\n'
    || E'  ) then\n'
    || E'    return false;\n'
    || E'  end if;\n\n'
    || E'  return true;\nend;';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('public.customer_terminal_pause_conflicts_v1(' in v_definition) = 0 then
    v_updated := replace(v_definition, v_anchor, v_replacement);
    if v_updated = v_definition then
      raise exception 'public_customer_terminal_pause_envelope_anchor_missing';
    end if;
    execute v_updated;
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  if position('public.customer_terminal_pause_conflicts_v1(' in v_definition) = 0 then
    raise exception 'public_customer_terminal_pause_envelope_not_installed';
  end if;
end;
$align_public_customer_envelope_with_terminal_pause$;

do $verify_public_dependency_customer_envelope$
declare
  v_signature regprocedure :=
    'public.resolve_public_dependency_operator_plan_v1(uuid,text,uuid,date,time without time zone,text,text,text,text)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('public.public_customer_booking_envelope_available_v1(' in v_definition) = 0 then
    raise exception 'public_dependency_customer_envelope_not_installed';
  end if;
end;
$verify_public_dependency_customer_envelope$;

-- Build a complete all-false response with the same keys as the planner
-- request. Customer policy denials are authoritative, not errors: the slot is
-- genuinely not bookable for this customer even if the salon lane is free.
create or replace function public.build_public_false_slot_map_v1(
  p_slots jsonb,
  p_slots_are_requests boolean
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_item jsonb;
  v_slot_time text;
begin
  if jsonb_typeof(p_slots) <> 'array' then
    return v_result;
  end if;

  for v_item in select value from jsonb_array_elements(p_slots)
  loop
    if coalesce(p_slots_are_requests, false) then
      v_slot_time := trim(coalesce(v_item ->> 'slotTime', ''));
    elsif jsonb_typeof(v_item) = 'string' then
      v_slot_time := trim(v_item #>> '{}');
    else
      v_slot_time := '';
    end if;

    if v_slot_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      v_result := v_result || jsonb_build_object(v_slot_time, false);
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.build_public_false_slot_map_v1(jsonb, boolean)
  from public, anon, authenticated;

-- Match enforce_customer_online_booking_policy_v1 exactly: a customer policy
-- is authoritative only when the active salon customer matches BOTH normalized
-- email and phone. Unknown visitors keep the default public catalog. Service
-- names remain fail-closed for legacy payloads with homonyms, and a blocked
-- composition component blocks the complete composition.
create or replace function public.public_customer_online_plan_allowed_v1(
  p_workspace_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_requested_service_name text default null,
  p_dependency_service_id uuid default null,
  p_composition_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_customer_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_customer_phone text := nullif(
    regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'),
    ''
  );
  v_service_name text := nullif(lower(trim(coalesce(p_requested_service_name, ''))), '');
begin
  if p_workspace_id is null then
    return false;
  end if;

  -- The writer deliberately does not trust a partial identity for policy
  -- enforcement. Preserve that boundary here to avoid blocking a guest due to
  -- an unrelated email-only or phone-only contact.
  if v_customer_email is null or v_customer_phone is null then
    return true;
  end if;

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = p_workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') = v_customer_phone
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is null then
    return true;
  end if;

  if v_service_name is not null and exists (
    select 1
    from public.services as service
    join public.customer_online_service_overrides as override
      on override.workspace_id = service.workspace_id
      and override.service_id = service.id
    where service.workspace_id = p_workspace_id
      and lower(trim(service.name)) = v_service_name
      and override.customer_id = v_customer_id
      and override.is_allowed is false
  ) then
    return false;
  end if;

  if p_dependency_service_id is not null and exists (
    select 1
    from public.customer_online_service_overrides as override
    where override.workspace_id = p_workspace_id
      and override.customer_id = v_customer_id
      and override.service_id = p_dependency_service_id
      and override.is_allowed is false
  ) then
    return false;
  end if;

  if p_composition_id is not null and (
    exists (
      select 1
      from public.customer_online_composition_overrides as override
      where override.workspace_id = p_workspace_id
        and override.customer_id = v_customer_id
        and override.composition_id = p_composition_id
        and override.is_allowed is false
    )
    or exists (
      select 1
      from public.service_composition_items as item
      join public.customer_online_service_overrides as override
        on override.workspace_id = item.workspace_id
        and override.customer_id = v_customer_id
        and override.service_id = item.service_id
        and override.is_allowed is false
      where item.workspace_id = p_workspace_id
        and item.composition_id = p_composition_id
    )
  ) then
    return false;
  end if;

  if v_service_name is not null and exists (
    select 1
    from public.service_compositions as composition
    where composition.workspace_id = p_workspace_id
      and composition.is_active is true
      and lower(trim(composition.name)) = v_service_name
      and (
        exists (
          select 1
          from public.customer_online_composition_overrides as override
          where override.workspace_id = p_workspace_id
            and override.customer_id = v_customer_id
            and override.composition_id = composition.id
            and override.is_allowed is false
        )
        or exists (
          select 1
          from public.service_composition_items as item
          join public.customer_online_service_overrides as override
            on override.workspace_id = item.workspace_id
            and override.customer_id = v_customer_id
            and override.service_id = item.service_id
            and override.is_allowed is false
          where item.workspace_id = p_workspace_id
            and item.composition_id = composition.id
        )
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.public_customer_online_plan_allowed_v1(
  uuid, text, text, text, uuid, uuid
) from public, anon, authenticated;

-- The atomic writer's per-customer switch has a second, independent effect:
-- when false, another request for the same service on the same day is rejected
-- even if its time does not overlap. Mirror the writer's active/terminal
-- precedence so the summary cannot advertise a later green slot that submit
-- rejects with same_day_same_service_conflict. Linked dependency/composition
-- writers deliberately use their existing transaction-local bypass and do not
-- call this helper.
create or replace function public.public_customer_atomic_day_service_allowed_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_requested_service_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_name text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_customer_full_name text := nullif(lower(trim(coalesce(p_customer_name, ''))), '');
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(
    regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'),
    ''
  );
  v_service_name text := nullif(lower(trim(coalesce(p_requested_service_name, ''))), '');
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or v_service_name is null
    or (v_customer_email is null and v_customer_phone is null)
  then
    return true;
  end if;

  -- This is the effective helper invoked by the guarded raises in the atomic
  -- writer. `true` means the customer explicitly allows another booking.
  if public.customer_allows_delegated_booking_v1(
    p_workspace_id,
    null,
    v_customer_email,
    v_customer_phone
  ) then
    return true;
  end if;

  select customer.id,
         coalesce(v_customer_full_name, lower(trim(customer.full_name)))
  into v_customer_id, v_customer_full_name
  from public.customers as customer
  where customer.workspace_id = p_workspace_id
    and customer.is_active is not false
    and (
      (v_customer_email is not null and customer.email = v_customer_email)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and appointment.appointment_date = p_appointment_date
      and lower(trim(coalesce(appointment.service_name, ''))) = v_service_name
      and (
        (v_customer_id is not null and appointment.customer_id = v_customer_id)
        or (
          v_customer_full_name is not null
          and lower(trim(coalesce(appointment.customer_name, ''))) = v_customer_full_name
        )
      )
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = p_workspace_id
          and terminal_request.status::text in ('cancelled', 'rejected')
          and terminal_request.appointment_date = appointment.appointment_date
          and terminal_request.appointment_time = appointment.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(appointment.service_name, '')))
          and (
            (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
            or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
            or (
              v_customer_phone is not null
              and regexp_replace(coalesce(terminal_request.customer_phone, ''), '\D+', '', 'g') =
                v_customer_phone
            )
            or (
              v_customer_full_name is not null
              and lower(trim(concat_ws(
                ' ',
                coalesce(terminal_request.customer_name, ''),
                coalesce(terminal_request.customer_surname, '')
              ))) = v_customer_full_name
            )
          )
          and not exists (
            select 1
            from public.booking_requests as newer_active_request
            where newer_active_request.workspace_id = terminal_request.workspace_id
              and newer_active_request.status::text in ('pending', 'accepted')
              and newer_active_request.appointment_date = terminal_request.appointment_date
              and newer_active_request.appointment_time = terminal_request.appointment_time
              and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                lower(trim(coalesce(terminal_request.requested_service_name, '')))
              and (
                (v_customer_id is not null and newer_active_request.customer_id = v_customer_id)
                or (v_customer_email is not null and newer_active_request.customer_email = v_customer_email)
                or (
                  v_customer_phone is not null
                  and regexp_replace(
                    coalesce(newer_active_request.customer_phone, ''),
                    '\D+',
                    '',
                    'g'
                  ) = v_customer_phone
                )
                or (
                  v_customer_full_name is not null
                  and lower(trim(concat_ws(
                    ' ',
                    coalesce(newer_active_request.customer_name, ''),
                    coalesce(newer_active_request.customer_surname, '')
                  ))) = v_customer_full_name
                )
              )
              and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >=
                coalesce(terminal_request.updated_at, terminal_request.created_at)
          )
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.booking_requests as booking_request
    where booking_request.workspace_id = p_workspace_id
      and booking_request.status::text in ('pending', 'accepted')
      and booking_request.appointment_date = p_appointment_date
      and lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_service_name
      and (
        (v_customer_id is not null and booking_request.customer_id = v_customer_id)
        or (v_customer_email is not null and booking_request.customer_email = v_customer_email)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') =
            v_customer_phone
        )
        or (
          v_customer_full_name is not null
          and lower(trim(concat_ws(
            ' ',
            coalesce(booking_request.customer_name, ''),
            coalesce(booking_request.customer_surname, '')
          ))) = v_customer_full_name
        )
      )
      and (
        booking_request.status::text <> 'accepted'
        or exists (
          select 1
          from public.appointments as matched_appointment
          where matched_appointment.workspace_id = booking_request.workspace_id
            and (
              matched_appointment.booking_request_id = booking_request.id
              or (
                matched_appointment.appointment_date = booking_request.appointment_date
                and matched_appointment.appointment_time = booking_request.appointment_time
                and lower(trim(coalesce(matched_appointment.service_name, ''))) =
                  lower(trim(coalesce(booking_request.requested_service_name, '')))
                and (
                  matched_appointment.customer_id = booking_request.customer_id
                  or lower(trim(coalesce(matched_appointment.customer_name, ''))) =
                    lower(trim(concat_ws(
                      ' ',
                      coalesce(booking_request.customer_name, ''),
                      coalesce(booking_request.customer_surname, '')
                    )))
                )
              )
            )
        )
      )
      and not exists (
        select 1
        from public.booking_requests as terminal_request
        where terminal_request.workspace_id = booking_request.workspace_id
          and terminal_request.status::text in ('cancelled', 'rejected')
          and terminal_request.appointment_date = booking_request.appointment_date
          and terminal_request.appointment_time = booking_request.appointment_time
          and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
            lower(trim(coalesce(booking_request.requested_service_name, '')))
          and (
            (v_customer_id is not null and terminal_request.customer_id = v_customer_id)
            or (v_customer_email is not null and terminal_request.customer_email = v_customer_email)
            or (
              v_customer_phone is not null
              and regexp_replace(coalesce(terminal_request.customer_phone, ''), '\D+', '', 'g') =
                v_customer_phone
            )
            or (
              v_customer_full_name is not null
              and lower(trim(concat_ws(
                ' ',
                coalesce(terminal_request.customer_name, ''),
                coalesce(terminal_request.customer_surname, '')
              ))) = v_customer_full_name
            )
          )
          and coalesce(terminal_request.updated_at, terminal_request.created_at) >=
            coalesce(booking_request.updated_at, booking_request.created_at)
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.public_customer_atomic_day_service_allowed_v1(
  uuid, date, text, text, text, text
) from public, anon, authenticated;

-- Composition requests are linked and therefore skip the atomic repeated-day
-- rule, but the later hard-overlap migration requires one continuous customer
-- envelope. Resolve the same customer-aware total used by the composition
-- operator planner once per batch, not once per candidate slot.
create or replace function public.public_composition_customer_duration_minutes_v1(
  p_workspace_id uuid,
  p_composition_id uuid,
  p_customer_email text,
  p_customer_phone text
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_duration integer;
begin
  select sum(greatest(
    case
      when coalesce((timing.value ->> 'customized')::boolean, false)
        then coalesce(
          (timing.value ->> 'durationMinutes')::integer,
          service.duration_minutes,
          60
        )
      else coalesce(item.duration_override_minutes, service.duration_minutes, 60)
    end,
    5
  ))::integer
  into v_total_duration
  from public.service_composition_items as item
  join public.services as service
    on service.id = item.service_id
    and service.workspace_id = item.workspace_id
  cross join lateral (
    select public.resolve_customer_service_timing_v1(
      p_workspace_id,
      p_customer_email,
      p_customer_phone,
      service.name
    ) as value
  ) as timing
  where item.workspace_id = p_workspace_id
    and item.composition_id = p_composition_id
    and item.link_type = 'required';

  return greatest(coalesce(v_total_duration, 0), 0);
end;
$$;

revoke all on function public.public_composition_customer_duration_minutes_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;

-- Customer-aware simple and phased batches now apply both the authoritative
-- online catalog policy and the existing customer-overlap filter. Their public
-- signatures do not change, so detailed slot loading and the page summary use
-- one identical planner contract.
create or replace function public.get_public_booking_slot_availability_batch_v3(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_customer_duration_minutes integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.public_customer_online_plan_allowed_v1(
      p_workspace_id,
      p_customer_email,
      p_customer_phone,
      p_requested_service_name,
      null,
      null
    ) and public.public_customer_atomic_day_service_allowed_v1(
      p_workspace_id,
      p_appointment_date,
      p_requested_service_name,
      p_customer_email,
      p_customer_phone,
      p_customer_name
    ) then public.filter_public_customer_slot_availability_v1(
      public.get_public_booking_slot_availability_batch_v2(
        p_workspace_id,
        p_appointment_date,
        p_slot_requests,
        p_requested_service_name,
        p_required_role,
        p_requested_operator_id,
        p_requested_operator_name
      ),
      p_workspace_id,
      p_appointment_date,
      p_slot_requests,
      p_requested_service_name,
      p_customer_email,
      p_customer_phone,
      p_customer_name,
      p_customer_duration_minutes
    )
    else public.build_public_false_slot_map_v1(p_slot_requests, true)
  end;
$$;

revoke all on function public.get_public_booking_slot_availability_batch_v3(
  uuid, date, jsonb, text, text, text, text, text, text, text, integer
) from public;
grant execute on function public.get_public_booking_slot_availability_batch_v3(
  uuid, date, jsonb, text, text, text, text, text, text, text, integer
) to anon, authenticated;

create or replace function public.get_public_phased_booking_slot_availability_batch_v4(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_allow_split_operators boolean default true,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_customer_duration_minutes integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.public_customer_online_plan_allowed_v1(
      p_workspace_id,
      p_customer_email,
      p_customer_phone,
      p_requested_service_name,
      null,
      null
    ) and public.public_customer_atomic_day_service_allowed_v1(
      p_workspace_id,
      p_appointment_date,
      p_requested_service_name,
      p_customer_email,
      p_customer_phone,
      p_customer_name
    ) then public.filter_public_customer_slot_availability_v1(
      public.get_public_phased_booking_slot_availability_batch_v3(
        p_workspace_id,
        p_appointment_date,
        p_slot_requests,
        p_requested_service_name,
        p_required_role,
        p_requested_operator_id,
        p_requested_operator_name,
        p_allow_split_operators
      ),
      p_workspace_id,
      p_appointment_date,
      p_slot_requests,
      p_requested_service_name,
      p_customer_email,
      p_customer_phone,
      p_customer_name,
      p_customer_duration_minutes
    )
    else public.build_public_false_slot_map_v1(p_slot_requests, true)
  end;
$$;

revoke all on function public.get_public_phased_booking_slot_availability_batch_v4(
  uuid, date, jsonb, text, text, text, text, boolean, text, text, text, integer
) from public;
grant execute on function public.get_public_phased_booking_slot_availability_batch_v4(
  uuid, date, jsonb, text, text, text, text, boolean, text, text, text, integer
) to anon, authenticated;

create or replace function public.get_public_dependency_slot_availability_batch_v1(
  p_salon_code text,
  p_parent_service_name text,
  p_dependency_service_id uuid,
  p_appointment_date date,
  p_slot_times jsonb,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_slot text;
  v_plan jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(coalesce(p_slot_times, '[]'::jsonb)) <> 'array'
  then
    return v_result;
  end if;

  if not public.public_customer_online_plan_allowed_v1(
    v_workspace_id,
    p_customer_email,
    p_customer_phone,
    p_parent_service_name,
    p_dependency_service_id,
    null
  ) then
    return public.build_public_false_slot_map_v1(p_slot_times, false);
  end if;

  for v_slot in
    select value
    from jsonb_array_elements_text(p_slot_times)
    where value ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  loop
    v_plan := public.resolve_public_dependency_operator_plan_v1(
      v_workspace_id,
      p_parent_service_name,
      p_dependency_service_id,
      p_appointment_date,
      v_slot::time,
      p_customer_email,
      p_customer_phone,
      p_requested_operator_id,
      p_requested_operator_name
    );
    v_result := v_result || jsonb_build_object(
      v_slot,
      coalesce((v_plan ->> 'available')::boolean, false)
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_dependency_slot_availability_batch_v1(
  text, text, uuid, date, jsonb, text, text, text, text
) from public;
grant execute on function public.get_public_dependency_slot_availability_batch_v1(
  text, text, uuid, date, jsonb, text, text, text, text
) to anon, authenticated;

create or replace function public.get_public_composition_slot_availability_batch_v1(
  p_salon_code text,
  p_composition_id uuid,
  p_appointment_date date,
  p_slot_times jsonb,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_slot_text text;
  v_plan jsonb;
  v_customer_duration integer;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(p_slot_times) <> 'array'
  then
    return v_result;
  end if;

  if not public.public_customer_online_plan_allowed_v1(
    v_workspace_id,
    p_customer_email,
    p_customer_phone,
    null,
    null,
    p_composition_id
  ) then
    return public.build_public_false_slot_map_v1(p_slot_times, false);
  end if;

  v_customer_duration := public.public_composition_customer_duration_minutes_v1(
    v_workspace_id,
    p_composition_id,
    p_customer_email,
    p_customer_phone
  );
  if coalesce(v_customer_duration, 0) <= 0 then
    return public.build_public_false_slot_map_v1(p_slot_times, false);
  end if;

  for v_slot_text in
    select value
    from jsonb_array_elements_text(p_slot_times)
    where value ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  loop
    if not public.public_customer_booking_envelope_available_v1(
      v_workspace_id,
      p_appointment_date,
      v_slot_text::time,
      v_customer_duration,
      p_customer_email,
      p_customer_phone
    ) then
      v_result := v_result || jsonb_build_object(v_slot_text, false);
      continue;
    end if;

    v_plan := public.resolve_public_composition_operator_plan_v1(
      v_workspace_id,
      p_composition_id,
      p_appointment_date,
      v_slot_text::time,
      p_customer_email,
      p_customer_phone,
      p_requested_operator_id,
      p_requested_operator_name
    );
    v_result := v_result || jsonb_build_object(
      v_slot_text,
      coalesce((v_plan ->> 'available')::boolean, false)
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_public_composition_slot_availability_batch_v1(
  text, uuid, date, jsonb, text, text, text, text
) from public;
grant execute on function public.get_public_composition_slot_availability_batch_v1(
  text, uuid, date, jsonb, text, text, text, text
) to anon, authenticated;

create or replace function public.get_public_booking_consistency_token_v1(
  p_workspace_id uuid,
  p_salon_code text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  if p_workspace_id is null
    or nullif(lower(trim(coalesce(p_salon_code, ''))), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'public_booking_consistency_workspace_required';
  end if;

  select revision_row.revision
  into v_revision
  from public.public_booking_consistency_revisions as revision_row
  join public.workspaces as workspace
    on workspace.id = revision_row.workspace_id
  where workspace.id = p_workspace_id
    and lower(trim(workspace.slug)) = lower(trim(p_salon_code))
    and lower(trim(revision_row.salon_code)) = lower(trim(p_salon_code))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_revision is null then
    raise exception using
      errcode = '22023',
      message = 'public_booking_consistency_workspace_mismatch';
  end if;

  return v_revision::text;
end;
$$;

revoke all on function public.get_public_booking_consistency_token_v1(
  uuid, text
) from public;
grant execute on function public.get_public_booking_consistency_token_v1(
  uuid, text
) to anon, authenticated;

-- Collapse up to seven public-booking day checks into one network round trip.
--
-- Each page item must have this shape:
--   regular/phased:
--     {"date":"YYYY-MM-DD","coverageComplete":true,"candidateSlotCount":42,"slotRequests":[...]}
--   dependency/composition:
--     {"date":"YYYY-MM-DD","coverageComplete":true,"candidateSlotCount":42,"slotTimes":[...]}
--
-- The result is `{ "consistencyToken": "…", "statuses": { date: state } }`.
-- `full` is deliberately stricter than `available`: one complete,
-- authoritative true is sufficient to prove availability, while `full`
-- additionally requires the caller to declare that it supplied every
-- candidate slot for that date and the declared candidate count exactly
-- matches the validated unique requests. Invalid, partial or failed planner
-- results stay `error`; they are never converted into false red/green. Every
-- planner also has a conservative per-day/page work budget. Budget exhaustion
-- returns `error`, allowing the client to resume the missing day with its
-- existing smaller chunk fallback instead of losing the whole page to a
-- database statement timeout. Final booking writes keep their own independent
-- revalidation.

create or replace function public.get_public_booking_day_summary_page_v1(
  p_planner_kind text,
  p_day_requests jsonb,
  p_workspace_id uuid default null,
  p_salon_code text default null,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_allow_split_operators boolean default true,
  p_dependency_service_id uuid default null,
  p_composition_id uuid default null,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_customer_duration_minutes integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_planner_kind text := lower(trim(coalesce(p_planner_kind, '')));
  v_page_size integer;
  v_page_item jsonb;
  v_date_text text;
  v_appointment_date date;
  v_seen_dates text[] := array[]::text[];
  v_result jsonb := '{}'::jsonb;
  v_slot_requests jsonb;
  v_slot_request_chunk jsonb;
  v_slot_times jsonb;
  v_slot_time_chunk jsonb;
  v_slot_request jsonb;
  v_slot_value jsonb;
  v_interval jsonb;
  v_slot_time text;
  v_interval_time text;
  v_interval_duration_text text;
  v_expected_slot_time text;
  v_expected_slot_times text[];
  v_chunk_expected_slot_times text[];
  v_total_slot_count integer;
  v_chunk_start integer;
  v_chunk_size integer;
  v_first_chunk_size constant integer := 6;
  v_followup_chunk_size constant integer := 24;
  -- A measured 24-slot dependency chunk can exceed the public statement
  -- timeout by itself. Complex planners therefore remain at six per call;
  -- their fallback is resumable and the page budget stops before cancellation.
  v_complex_followup_chunk_size constant integer := 6;
  -- The public database role cancels statements at roughly three seconds.
  -- Keep enough headroom for the next bounded planner chunk and response
  -- serialization instead of relying on an exception that PostgreSQL cannot
  -- safely recover from after the top-level statement is cancelled.
  v_day_budget constant interval := interval '1600 milliseconds';
  v_page_budget constant interval := interval '2100 milliseconds';
  v_page_started_at timestamp with time zone := clock_timestamp();
  v_day_started_at timestamp with time zone;
  v_slot_map jsonb;
  v_complete_result boolean;
  v_has_available_slot boolean;
  v_scanned_all_slots boolean;
  v_coverage_complete boolean;
  v_candidate_slot_count_text text;
  v_candidate_slot_count_matches boolean;
  v_status text;
  v_consistency_token_before text;
  v_consistency_token_after text;
begin
  if p_day_requests is null or jsonb_typeof(p_day_requests) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'day_summary_page_must_be_array';
  end if;

  v_page_size := jsonb_array_length(p_day_requests);
  if v_page_size < 1 or v_page_size > 7 then
    raise exception using
      errcode = '22023',
      message = 'day_summary_page_size_must_be_between_1_and_7';
  end if;

  if octet_length(p_day_requests::text) > 2000000 then
    raise exception using
      errcode = '22023',
      message = 'day_summary_page_payload_too_large';
  end if;

  if v_planner_kind not in ('simple', 'phased', 'dependency', 'composition') then
    raise exception using
      errcode = '22023',
      message = 'day_summary_planner_kind_invalid';
  end if;

  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is null
    and nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'day_summary_customer_identity_required';
  end if;

  if p_workspace_id is null
    or nullif(lower(trim(coalesce(p_salon_code, ''))), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'day_summary_workspace_identity_required';
  end if;

  if v_planner_kind in ('simple', 'phased') then
    if nullif(trim(coalesce(p_requested_service_name, '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'day_summary_regular_plan_incomplete';
    end if;
  elsif v_planner_kind = 'dependency' then
    if nullif(trim(coalesce(p_salon_code, '')), '') is null
      or nullif(trim(coalesce(p_requested_service_name, '')), '') is null
      or p_dependency_service_id is null
    then
      raise exception using
        errcode = '22023',
        message = 'day_summary_dependency_plan_incomplete';
    end if;
  elsif nullif(trim(coalesce(p_salon_code, '')), '') is null
    or p_composition_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'day_summary_composition_plan_incomplete';
  end if;

  -- Validate canonical, unique dates before executing any planner. A malformed
  -- page is rejected as one request so the caller cannot mistake a synthetic
  -- key for a real day.
  for v_page_item in
    select value from jsonb_array_elements(p_day_requests)
  loop
    if jsonb_typeof(v_page_item) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'day_summary_page_item_must_be_object';
    end if;

    v_date_text := trim(coalesce(v_page_item ->> 'date', ''));
    if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using
        errcode = '22023',
        message = 'day_summary_date_invalid';
    end if;

    begin
      v_appointment_date := v_date_text::date;
    exception when others then
      raise exception using
        errcode = '22023',
        message = 'day_summary_date_invalid';
    end;

    if v_appointment_date::text <> v_date_text then
      raise exception using
        errcode = '22023',
        message = 'day_summary_date_invalid';
    end if;

    if v_date_text = any(v_seen_dates) then
      raise exception using
        errcode = '22023',
        message = 'day_summary_dates_must_be_unique';
    end if;
    v_seen_dates := array_append(v_seen_dates, v_date_text);
  end loop;

  -- This function is VOLATILE because its timeout headroom uses
  -- clock_timestamp(), so its internal SQL commands are not advertised as one
  -- MVCC snapshot. A monotonic read fence is stronger: only return a page when
  -- the same workspace revision is visible before and after every planner.
  select revision_row.revision::text
  into v_consistency_token_before
  from public.public_booking_consistency_revisions as revision_row
  join public.workspaces as workspace
    on workspace.id = revision_row.workspace_id
  where workspace.id = p_workspace_id
    and lower(trim(workspace.slug)) = lower(trim(p_salon_code))
    and lower(trim(revision_row.salon_code)) = lower(trim(p_salon_code))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_consistency_token_before is null then
    raise exception using
      errcode = '22023',
      message = 'day_summary_workspace_identity_mismatch';
  end if;

  for v_page_item in
    select value from jsonb_array_elements(p_day_requests)
  loop
    v_date_text := trim(v_page_item ->> 'date');
    v_appointment_date := v_date_text::date;
    v_expected_slot_times := array[]::text[];
    v_slot_map := null;
    v_complete_result := true;
    v_has_available_slot := false;
    v_scanned_all_slots := false;
    v_status := 'error';
    v_day_started_at := clock_timestamp();
    v_coverage_complete :=
      jsonb_typeof(v_page_item -> 'coverageComplete') = 'boolean'
      and coalesce((v_page_item ->> 'coverageComplete')::boolean, false);
    v_candidate_slot_count_text := trim(
      coalesce(v_page_item ->> 'candidateSlotCount', '')
    );
    v_candidate_slot_count_matches := false;

    begin
      if v_planner_kind in ('simple', 'phased') then
        v_slot_requests := v_page_item -> 'slotRequests';
        if v_slot_requests is null
          or jsonb_typeof(v_slot_requests) <> 'array'
          or jsonb_array_length(v_slot_requests) < 1
          or jsonb_array_length(v_slot_requests) > 288
        then
          raise exception 'day_summary_slot_requests_invalid';
        end if;

        for v_slot_request in
          select value from jsonb_array_elements(v_slot_requests)
        loop
          if jsonb_typeof(v_slot_request) <> 'object' then
            raise exception 'day_summary_slot_request_invalid';
          end if;

          v_slot_time := trim(coalesce(v_slot_request ->> 'slotTime', ''));
          if v_slot_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
            or v_slot_time = any(v_expected_slot_times)
          then
            raise exception 'day_summary_slot_time_invalid_or_duplicate';
          end if;

          if (v_slot_request -> 'intervals') is null
            or jsonb_typeof(v_slot_request -> 'intervals') <> 'array'
            or jsonb_array_length(v_slot_request -> 'intervals') < 1
            or jsonb_array_length(v_slot_request -> 'intervals') > 32
          then
            raise exception 'day_summary_slot_intervals_invalid';
          end if;

          for v_interval in
            select value from jsonb_array_elements(v_slot_request -> 'intervals')
          loop
            if jsonb_typeof(v_interval) <> 'object' then
              raise exception 'day_summary_slot_interval_invalid';
            end if;
            v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
            v_interval_duration_text := trim(coalesce(v_interval ->> 'durationMinutes', ''));
            if v_interval_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
              or v_interval_duration_text !~ '^[0-9]+$'
              or v_interval_duration_text::integer < 1
              or v_interval_duration_text::integer > 1440
            then
              raise exception 'day_summary_slot_interval_invalid';
            end if;
          end loop;

          v_expected_slot_times := array_append(v_expected_slot_times, v_slot_time);
        end loop;

        v_total_slot_count := cardinality(v_expected_slot_times);
        v_chunk_start := 0;
        while v_chunk_start < v_total_slot_count
        loop
          if clock_timestamp() - v_day_started_at >= v_day_budget
            or clock_timestamp() - v_page_started_at >= v_page_budget
          then
            v_complete_result := false;
            exit;
          end if;

          v_chunk_size := least(
            case
              when v_chunk_start = 0 then v_first_chunk_size
              else v_followup_chunk_size
            end,
            v_total_slot_count - v_chunk_start
          );
          select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
          into v_slot_request_chunk
          from jsonb_array_elements(v_slot_requests) with ordinality as item(value, ordinality)
          where item.ordinality > v_chunk_start
            and item.ordinality <= v_chunk_start + v_chunk_size;
          v_chunk_expected_slot_times :=
            v_expected_slot_times[v_chunk_start + 1:v_chunk_start + v_chunk_size];

          if v_planner_kind = 'phased' then
            v_slot_map := public.get_public_phased_booking_slot_availability_batch_v4(
              p_workspace_id,
              v_appointment_date,
              v_slot_request_chunk,
              p_requested_service_name,
              p_required_role,
              p_requested_operator_id,
              p_requested_operator_name,
              p_allow_split_operators,
              p_customer_email,
              p_customer_phone,
              p_customer_name,
              p_customer_duration_minutes
            );
          else
            v_slot_map := public.get_public_booking_slot_availability_batch_v3(
              p_workspace_id,
              v_appointment_date,
              v_slot_request_chunk,
              p_requested_service_name,
              p_required_role,
              p_requested_operator_id,
              p_requested_operator_name,
              p_customer_email,
              p_customer_phone,
              p_customer_name,
              p_customer_duration_minutes
            );
          end if;

          v_complete_result := coalesce(jsonb_typeof(v_slot_map) = 'object', false);
          if v_complete_result then
            foreach v_expected_slot_time in array v_chunk_expected_slot_times
            loop
              if jsonb_typeof(v_slot_map -> v_expected_slot_time) <> 'boolean' then
                v_complete_result := false;
                exit;
              end if;
            end loop;
          end if;
          exit when not v_complete_result;

          foreach v_expected_slot_time in array v_chunk_expected_slot_times
          loop
            if (v_slot_map ->> v_expected_slot_time)::boolean is true then
              v_has_available_slot := true;
              exit;
            end if;
          end loop;
          exit when v_has_available_slot;

          v_chunk_start := v_chunk_start + v_chunk_size;
        end loop;
        v_scanned_all_slots :=
          v_complete_result and v_chunk_start >= v_total_slot_count;
      else
        v_slot_times := v_page_item -> 'slotTimes';
        if v_slot_times is null
          or jsonb_typeof(v_slot_times) <> 'array'
          or jsonb_array_length(v_slot_times) < 1
          or jsonb_array_length(v_slot_times) > 288
        then
          raise exception 'day_summary_slot_times_invalid';
        end if;

        for v_slot_value in
          select value from jsonb_array_elements(v_slot_times)
        loop
          if jsonb_typeof(v_slot_value) <> 'string' then
            raise exception 'day_summary_slot_time_invalid';
          end if;
          v_slot_time := trim(v_slot_value #>> '{}');
          if v_slot_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
            or v_slot_time = any(v_expected_slot_times)
          then
            raise exception 'day_summary_slot_time_invalid_or_duplicate';
          end if;
          v_expected_slot_times := array_append(v_expected_slot_times, v_slot_time);
        end loop;

        v_total_slot_count := cardinality(v_expected_slot_times);
        v_chunk_start := 0;
        while v_chunk_start < v_total_slot_count
        loop
          if clock_timestamp() - v_day_started_at >= v_day_budget
            or clock_timestamp() - v_page_started_at >= v_page_budget
          then
            -- A summary is read-only guidance. Returning error lets the app
            -- continue this date through its resumable chunk fallback; it is
            -- safer than allowing one full complex day to cancel all seven.
            v_complete_result := false;
            exit;
          end if;

          v_chunk_size := least(
            case
              when v_chunk_start = 0 then v_first_chunk_size
              else v_complex_followup_chunk_size
            end,
            v_total_slot_count - v_chunk_start
          );
          select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
          into v_slot_time_chunk
          from jsonb_array_elements(v_slot_times) with ordinality as item(value, ordinality)
          where item.ordinality > v_chunk_start
            and item.ordinality <= v_chunk_start + v_chunk_size;
          v_chunk_expected_slot_times :=
            v_expected_slot_times[v_chunk_start + 1:v_chunk_start + v_chunk_size];

          if v_planner_kind = 'dependency' then
            v_slot_map := public.get_public_dependency_slot_availability_batch_v1(
              p_salon_code,
              p_requested_service_name,
              p_dependency_service_id,
              v_appointment_date,
              v_slot_time_chunk,
              p_customer_email,
              p_customer_phone,
              p_requested_operator_id,
              p_requested_operator_name
            );
          else
            v_slot_map := public.get_public_composition_slot_availability_batch_v1(
              p_salon_code,
              p_composition_id,
              v_appointment_date,
              v_slot_time_chunk,
              p_customer_email,
              p_customer_phone,
              p_requested_operator_id,
              p_requested_operator_name
            );
          end if;

          v_complete_result := coalesce(jsonb_typeof(v_slot_map) = 'object', false);
          if v_complete_result then
            foreach v_expected_slot_time in array v_chunk_expected_slot_times
            loop
              if jsonb_typeof(v_slot_map -> v_expected_slot_time) <> 'boolean' then
                v_complete_result := false;
                exit;
              end if;
            end loop;
          end if;
          exit when not v_complete_result;

          foreach v_expected_slot_time in array v_chunk_expected_slot_times
          loop
            if (v_slot_map ->> v_expected_slot_time)::boolean is true then
              v_has_available_slot := true;
              exit;
            end if;
          end loop;
          exit when v_has_available_slot;

          v_chunk_start := v_chunk_start + v_chunk_size;
        end loop;
        v_scanned_all_slots :=
          v_complete_result and v_chunk_start >= v_total_slot_count;
      end if;

      v_candidate_slot_count_matches := case
        when jsonb_typeof(v_page_item -> 'candidateSlotCount') = 'number'
          and v_candidate_slot_count_text ~ '^[0-9]{1,3}$'
        then
          v_candidate_slot_count_text::integer = cardinality(v_expected_slot_times)
          and v_candidate_slot_count_text::integer between 1 and 288
        else false
      end;

      v_status := case
        when not v_complete_result then 'error'
        when v_has_available_slot then 'available'
        when v_scanned_all_slots
          and v_coverage_complete
          and v_candidate_slot_count_matches
        then 'full'
        else 'error'
      end;
    exception when others then
      -- Do not expose database details or turn a timeout/planner error into a
      -- false state. Other dates in the same page remain independently useful.
      v_status := 'error';
    end;

    v_result := v_result || jsonb_build_object(v_date_text, v_status);
  end loop;

  select revision_row.revision::text
  into v_consistency_token_after
  from public.public_booking_consistency_revisions as revision_row
  join public.workspaces as workspace
    on workspace.id = revision_row.workspace_id
  where workspace.id = p_workspace_id
    and lower(trim(workspace.slug)) = lower(trim(p_salon_code))
    and lower(trim(revision_row.salon_code)) = lower(trim(p_salon_code))
    and (
      workspace.subscription_status in ('demo', 'active')
      or workspace.is_internal_tester is true
    )
  limit 1;

  if v_consistency_token_after is null
    or v_consistency_token_after is distinct from v_consistency_token_before
  then
    raise exception using
      errcode = '40001',
      message = 'day_summary_consistency_changed';
  end if;

  return jsonb_build_object(
    'consistencyToken', v_consistency_token_before,
    'statuses', v_result
  );
end;
$$;

revoke all on function public.get_public_booking_day_summary_page_v1(
  text, jsonb, uuid, text, text, text, text, text, boolean, uuid, uuid,
  text, text, text, integer
) from public;
grant execute on function public.get_public_booking_day_summary_page_v1(
  text, jsonb, uuid, text, text, text, text, text, boolean, uuid, uuid,
  text, text, text, integer
) to anon, authenticated;

notify pgrst, 'reload schema';
