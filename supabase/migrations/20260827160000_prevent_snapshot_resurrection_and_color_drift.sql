-- Derived snapshots must never resurrect a persisted appointment that has
-- already been deleted from the authoritative appointments table. The same
-- owner snapshot is the authority for card colors across web, iOS, Android,
-- and the public client portal.

create or replace function public.overlay_canonical_appointment_timing_v1(
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
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (entry.item ->> 'id')::uuid
        else null
      end as persisted_id
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality as entry(item, ordinality)
  )
  select coalesce(
    jsonb_agg(
      case
        when appointment.id is null then entries.item
        else entries.item || jsonb_build_object(
          'data', appointment.appointment_date::text,
          'ora', to_char(appointment.appointment_time, 'HH24:MI'),
          'durataMinuti', appointment.duration_minutes,
          'phaseConfig', appointment.phase_snapshot
        )
      end
      order by entries.ordinality
    ),
    '[]'::jsonb
  )
  from entries
  left join public.appointments as appointment
    on appointment.workspace_id = p_workspace_id
   and appointment.id = entries.persisted_id
  where entries.persisted_id is null
     or appointment.id is not null;
$$;

create or replace function public.protect_client_portal_owner_card_colors_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_payload jsonb;
  v_service_colors jsonb;
  v_role_colors jsonb;
begin
  select snapshot.payload
  into v_owner_payload
  from public.owner_app_snapshots as snapshot
  where snapshot.workspace_id = new.workspace_id
  limit 1;

  v_service_colors := v_owner_payload -> 'serviceCardColorOverrides';
  v_role_colors := v_owner_payload -> 'roleCardColorOverrides';

  if jsonb_typeof(v_service_colors) = 'object' then
    new.service_card_color_overrides := v_service_colors;
  end if;
  if jsonb_typeof(v_role_colors) = 'object' then
    new.role_card_color_overrides := v_role_colors;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_client_portal_owner_card_colors_v1
  on public.client_portals;
create trigger protect_client_portal_owner_card_colors_v1
before insert or update of service_card_color_overrides, role_card_color_overrides
on public.client_portals
for each row
execute function public.protect_client_portal_owner_card_colors_v1();

create or replace function public.sync_owner_card_colors_to_client_portal_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_colors jsonb;
  v_role_colors jsonb;
begin
  v_service_colors := new.payload -> 'serviceCardColorOverrides';
  v_role_colors := new.payload -> 'roleCardColorOverrides';

  update public.client_portals as portal
  set
    service_card_color_overrides = case
      when jsonb_typeof(v_service_colors) = 'object'
        then v_service_colors
      else portal.service_card_color_overrides
    end,
    role_card_color_overrides = case
      when jsonb_typeof(v_role_colors) = 'object'
        then v_role_colors
      else portal.role_card_color_overrides
    end,
    updated_at = timezone('utc', now())
  where portal.workspace_id = new.workspace_id
    and (
      (
        jsonb_typeof(v_service_colors) = 'object'
        and portal.service_card_color_overrides is distinct from v_service_colors
      )
      or (
        jsonb_typeof(v_role_colors) = 'object'
        and portal.role_card_color_overrides is distinct from v_role_colors
      )
    );

  return new;
end;
$$;

drop trigger if exists sync_owner_card_colors_to_client_portal_v1
  on public.owner_app_snapshots;
create trigger sync_owner_card_colors_to_client_portal_v1
after insert or update of payload
on public.owner_app_snapshots
for each row
execute function public.sync_owner_card_colors_to_client_portal_v1();

revoke all on function public.protect_client_portal_owner_card_colors_v1()
  from public;
revoke all on function public.sync_owner_card_colors_to_client_portal_v1()
  from public;

notify pgrst, 'reload schema';
