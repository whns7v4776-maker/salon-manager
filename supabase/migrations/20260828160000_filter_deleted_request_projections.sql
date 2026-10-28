-- A stale owner publish may still contain a persisted booking-request UUID
-- after that request has been deleted. Local-only/non-UUID entries are allowed
-- while they are being created, but a persisted UUID is authoritative only
-- while the matching booking_requests row still exists.

create or replace function public.overlay_canonical_request_timing_v1(
  p_workspace_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with entries as (
    select
      entry.item,
      entry.ordinality,
      nullif(trim(entry.item ->> 'id'), '') as item_id,
      case
        when nullif(trim(entry.item ->> 'id'), '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then trim(entry.item ->> 'id')::uuid
        else null
      end as persisted_id
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality as entry(item, ordinality)
  ),
  projected as (
    select
      case
        when request.id is null then entries.item
        else (
          entries.item - 'mestiereRichiesto'
        ) || jsonb_build_object(
          'data', request.appointment_date::text,
          'ora', to_char(request.appointment_time, 'HH24:MI'),
          'durataMinuti', request.requested_duration_minutes,
          'phaseConfig', request.phase_snapshot,
          'mestiereRichiesto', trim(coalesce(request.required_role, ''))
        )
      end as item,
      entries.ordinality
    from entries
    left join public.booking_requests as request
      on request.workspace_id = p_workspace_id
     and request.id = entries.persisted_id
    where entries.persisted_id is null
       or request.id is not null
  )
  select coalesce(
    jsonb_agg(projected.item order by projected.ordinality),
    '[]'::jsonb
  )
  from projected;
$$;

-- cancel_owner_composition_phase_v1 already deletes the persisted appointment
-- and its technical booking request inside one transaction. These DELETE
-- barriers make that same transaction authoritative for both derived stores;
-- no later client publish is needed to make the removed phase disappear.
-- Assigning the column to itself intentionally runs the existing canonical
-- BEFORE triggers, which also preserve every unrelated local-only entry.
create or replace function public.prune_deleted_agenda_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'appointments' then
    update public.client_portals as portal
    set appuntamenti = portal.appuntamenti
    where portal.workspace_id = old.workspace_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(portal.appuntamenti) = 'array'
              then portal.appuntamenti
            else '[]'::jsonb
          end
        ) as entry(item)
        where nullif(trim(entry.item ->> 'id'), '') = old.id::text
      );

    update public.owner_app_snapshots as snapshot
    set payload = snapshot.payload
    where snapshot.workspace_id = old.workspace_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(snapshot.payload -> 'appuntamenti') = 'array'
              then snapshot.payload -> 'appuntamenti'
            else '[]'::jsonb
          end
        ) as entry(item)
        where nullif(trim(entry.item ->> 'id'), '') = old.id::text
      );
  elsif tg_table_name = 'booking_requests' then
    update public.client_portals as portal
    set richieste_prenotazione = portal.richieste_prenotazione
    where portal.workspace_id = old.workspace_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(portal.richieste_prenotazione) = 'array'
              then portal.richieste_prenotazione
            else '[]'::jsonb
          end
        ) as entry(item)
        where nullif(trim(entry.item ->> 'id'), '') = old.id::text
      );

    update public.owner_app_snapshots as snapshot
    set payload = snapshot.payload
    where snapshot.workspace_id = old.workspace_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(snapshot.payload -> 'richiestePrenotazione') = 'array'
              then snapshot.payload -> 'richiestePrenotazione'
            else '[]'::jsonb
          end
        ) as entry(item)
        where nullif(trim(entry.item ->> 'id'), '') = old.id::text
      );
  end if;

  return old;
end;
$$;

drop trigger if exists zz_prune_deleted_appointment_projection_v1
  on public.appointments;
create trigger zz_prune_deleted_appointment_projection_v1
after delete on public.appointments
for each row
execute function public.prune_deleted_agenda_projection_v1();

drop trigger if exists zz_prune_deleted_booking_request_projection_v1
  on public.booking_requests;
create trigger zz_prune_deleted_booking_request_projection_v1
after delete on public.booking_requests
for each row
execute function public.prune_deleted_agenda_projection_v1();

-- Stabilizing a draft captured before a phase removal must never run that stale
-- membership plan. Keep v4 untouched, but put a strict group-revision barrier
-- in front of it. The lock order matches cancel_owner_composition_phase_v1:
-- resolve anchor, lock group, re-read/lock anchor, then lock sorted siblings.
create or replace function public.apply_owner_linked_reorganization_v5(
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
  v_workspace_id uuid;
  v_group_id uuid;
  v_current_ids text[] := array[]::text[];
  v_plan_ids text[] := array[]::text[];
  v_plan_count integer := 0;
  v_plan_distinct_count integer := 0;
  v_plan_ids_valid boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_anchor_appointment_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_reorganization_plan';
  end if;

  -- Resolve authorization and the intended group without taking a component
  -- lock first. Every grouped mutation can then acquire the group lock first.
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

  v_workspace_id := v_anchor.workspace_id;
  v_group_id := v_anchor.appointment_group_id;

  if v_group_id is not null then
    perform appointment_group.id
    from public.appointment_groups as appointment_group
    where appointment_group.workspace_id = v_workspace_id
      and appointment_group.id = v_group_id
    for update;

    if not found then
      raise exception 'group_plan_changed';
    end if;
  end if;

  -- Membership may have changed while the caller was waiting for the group.
  -- Re-read and lock the anchor under the resolved membership contract.
  select appointment.*
  into v_anchor
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_anchor_appointment_id
    and appointment.appointment_group_id is not distinct from v_group_id
  for update;

  if v_anchor.id is null then
    raise exception 'group_plan_changed';
  end if;

  perform appointment.id
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and (
      (v_group_id is not null
        and appointment.appointment_group_id = v_group_id)
      or (v_group_id is null and appointment.id = v_anchor.id)
    )
  order by appointment.id
  for update;

  select coalesce(
    array_agg(appointment.id::text order by appointment.id::text),
    array[]::text[]
  )
  into v_current_ids
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and (
      (v_group_id is not null
        and appointment.appointment_group_id = v_group_id)
      or (v_group_id is null and appointment.id = v_anchor.id)
    );

  select
    coalesce(
      array_agg(
        lower(trim(plan_item.value ->> 'appointmentId'))
        order by lower(trim(plan_item.value ->> 'appointmentId'))
      ),
      array[]::text[]
    ),
    count(*)::integer,
    count(distinct lower(trim(plan_item.value ->> 'appointmentId')))::integer,
    coalesce(bool_and(
      nullif(trim(plan_item.value ->> 'appointmentId'), '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), false)
  into
    v_plan_ids,
    v_plan_count,
    v_plan_distinct_count,
    v_plan_ids_valid
  from jsonb_array_elements(p_items) as plan_item(value);

  if not v_plan_ids_valid
    or v_plan_count <> cardinality(v_current_ids)
    or v_plan_distinct_count <> v_plan_count
    or v_plan_ids is distinct from v_current_ids
  then
    raise exception 'group_plan_changed';
  end if;

  -- Locks remain held until transaction end, so v4 cannot observe a different
  -- membership after this exact-set check.
  return public.apply_owner_linked_reorganization_v4(
    p_anchor_appointment_id,
    p_items,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );
end;
$$;

-- Repair every already-persisted ghost. The existing protect triggers also
-- canonicalize the sibling appointment projection during these self-updates.
update public.client_portals as portal
set richieste_prenotazione = public.overlay_canonical_request_timing_v1(
  portal.workspace_id,
  portal.richieste_prenotazione
)
where portal.richieste_prenotazione is distinct from
  public.overlay_canonical_request_timing_v1(
    portal.workspace_id,
    portal.richieste_prenotazione
  );

update public.owner_app_snapshots as snapshot
set payload = jsonb_set(
  coalesce(snapshot.payload, '{}'::jsonb),
  '{richiestePrenotazione}',
  public.overlay_canonical_request_timing_v1(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)
  ),
  true
)
where coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)
  is distinct from public.overlay_canonical_request_timing_v1(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'richiestePrenotazione', '[]'::jsonb)
  );

revoke all on function public.overlay_canonical_request_timing_v1(uuid, jsonb)
  from public;
revoke all on function public.prune_deleted_agenda_projection_v1()
  from public;
revoke all on function public.apply_owner_linked_reorganization_v5(
  uuid, jsonb, boolean, boolean
) from public;
grant execute on function public.apply_owner_linked_reorganization_v5(
  uuid, jsonb, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
