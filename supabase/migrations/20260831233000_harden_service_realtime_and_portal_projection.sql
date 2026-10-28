-- Keep the canonical service catalogue observable across owner devices and
-- prevent private, archived, or superseded rows from entering the public
-- client projection.

begin;

-- Owner clients subscribe with a workspace_id filter. FULL is required so
-- DELETE events retain that filter column as well as each stable row id.
alter table public.services replica identity full;
alter table public.service_compositions replica identity full;
alter table public.service_composition_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime_publication_missing';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'services'
  ) then
    alter publication supabase_realtime add table public.services;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_compositions'
  ) then
    alter publication supabase_realtime
      add table public.service_compositions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_composition_items'
  ) then
    alter publication supabase_realtime
      add table public.service_composition_items;
  end if;
end;
$$;

create or replace function public.project_public_services_v1(
  p_workspace_id uuid,
  p_existing_items jsonb default '[]'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
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
        'scontoOraDalle',
          case
            when service.discount_start_time is null then null
            else to_char(service.discount_start_time, 'HH24:MI')
          end,
        'scontoOraAlle',
          case
            when service.discount_end_time is null then null
            else to_char(service.discount_end_time, 'HH24:MI')
          end,
        'scontoGiorniSettimana', service.discount_weekdays,
        'durataMinuti', service.duration_minutes,
        'phaseConfig', service.phase_config,
        'linkedServiceConfig',
          case
            when (
              lower(
                trim(
                  coalesce(
                    service.linked_service_config ->> 'clientChoiceRequired',
                    'false'
                  )
                )
              ) = 'true'
              and jsonb_typeof(
                service.linked_service_config -> 'suggestedServiceIds'
              ) = 'array'
              and jsonb_array_length(
                service.linked_service_config -> 'suggestedServiceIds'
              ) > 0
            ) or (
              jsonb_typeof(
                service.linked_service_config -> 'requiredServiceIds'
              ) = 'array'
              and jsonb_array_length(
                service.linked_service_config -> 'requiredServiceIds'
              ) > 0
            )
              then service.linked_service_config
            else '{}'::jsonb
          end,
        'mestiereRichiesto', coalesce(service.required_role, ''),
        'badgeCliente', coalesce(service.client_badge, ''),
        'ordineMestiereCliente', service.client_role_display_order,
        'ordineCliente', service.client_display_order,
        'disponibileOnline', true,
        'soloComposizione', false,
        'compositionOnly', false,
        'composition_only', false,
        'compositionId', null,
        'composition_id', null,
        'supersededByCompositionId', null,
        'superseded_by_composition_id', null
      )
      order by
        service.client_role_display_order,
        service.required_role,
        service.client_display_order,
        service.updated_at desc,
        service.created_at desc
    ),
    '[]'::jsonb
  )
  from public.services as service
  left join lateral (
    select existing_item as item
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_existing_items, '[]'::jsonb)) = 'array'
          then coalesce(p_existing_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) with ordinality as existing(existing_item, existing_position)
    where
      jsonb_typeof(existing_item) = 'object'
      and (
        nullif(trim(coalesce(existing_item ->> 'id', '')), '') =
          service.id::text
        or (
          lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'nome', ''))) =
            lower(trim(service.name))
          and (
            nullif(
              lower(
                trim(
                  coalesce(
                    existing_item ->> 'mestiereRichiesto',
                    existing_item ->> 'requiredRole',
                    existing_item ->> 'required_role',
                    ''
                  )
                )
              ),
              ''
            ) is null
            or lower(
              trim(
                coalesce(
                  existing_item ->> 'mestiereRichiesto',
                  existing_item ->> 'requiredRole',
                  existing_item ->> 'required_role',
                  ''
                )
              )
            ) = lower(trim(coalesce(service.required_role, '')))
          )
        )
      )
    order by
      case
        when nullif(trim(coalesce(existing_item ->> 'id', '')), '') =
          service.id::text
          then 0
        else 1
      end,
      existing_position
    limit 1
  ) as matched on true
  where service.workspace_id = p_workspace_id
    and service.is_online = true
    and coalesce(service.composition_only, false) = false
    and service.superseded_by_composition_id is null;
$$;

revoke all on function public.project_public_services_v1(uuid, jsonb)
  from public, anon, authenticated;

comment on function public.project_public_services_v1(uuid, jsonb) is
  'Builds the public service catalogue exclusively from canonical service rows.';

create or replace function public.sync_client_portal_services(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = public.project_public_services_v1(
    portal.workspace_id,
    portal.servizi
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.sync_client_portal_services(uuid)
  from public, anon;
grant execute on function public.sync_client_portal_services(uuid)
  to authenticated;

comment on function public.sync_client_portal_services(uuid) is
  'Projects only active canonical catalogue services to the public client portal.';

-- Public snapshot/catalog RPCs currently read owner_app_snapshots through
-- this shared helper. Overlay the service field from the canonical table so
-- a stale app/web snapshot can preserve owner history without republishing an
-- archived, composition-only, superseded, or deleted service to customers.
create or replace function public.get_public_portal_owner_payload(
  p_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot_payload as (
    select case
      when jsonb_typeof(raw_payload.payload) = 'object'
        then raw_payload.payload
      else '{}'::jsonb
    end as payload
    from (
      select (
        select snapshot.payload
        from public.owner_app_snapshots as snapshot
        where snapshot.workspace_id = p_workspace_id
        limit 1
      ) as payload
    ) as raw_payload
  )
  select snapshot_payload.payload || jsonb_build_object(
    'servizi',
    public.project_public_services_v1(
      p_workspace_id,
      coalesce(snapshot_payload.payload -> 'servizi', '[]'::jsonb)
    )
  )
  from snapshot_payload;
$$;

comment on function public.get_public_portal_owner_payload(uuid) is
  'Returns owner snapshot data with a server-authoritative public service catalogue.';

-- The atomic booking writer historically checked availability by service name
-- alone. With the same display name in two professions, an online Barber row
-- could therefore authorize a stale request for an archived Hair Stylist row.
-- Keep legacy callers without a role working, but require an exact normalized
-- role whenever the current app/web contract supplies one.
create or replace function public.is_public_booking_service_available_v2(
  p_workspace_id uuid,
  p_requested_service_name text,
  p_required_role text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.services as service
    where service.workspace_id = p_workspace_id
      and lower(trim(service.name)) =
        lower(trim(coalesce(p_requested_service_name, '')))
      and service.is_online = true
      and coalesce(service.composition_only, false) = false
      and service.superseded_by_composition_id is null
      and (
        nullif(
          lower(
            regexp_replace(
              trim(coalesce(p_required_role, '')),
              '\s+',
              ' ',
              'g'
            )
          ),
          ''
        ) is null
        or lower(
          regexp_replace(
            trim(coalesce(service.required_role, '')),
            '\s+',
            ' ',
            'g'
          )
        ) = lower(
          regexp_replace(
            trim(coalesce(p_required_role, '')),
            '\s+',
            ' ',
            'g'
          )
        )
      )
  );
$$;

revoke all on function public.is_public_booking_service_available_v2(
  uuid,
  text,
  text
) from public, anon, authenticated;

do $migration$
declare
  v_signature regprocedure :=
    'public.create_public_booking_request_ultralight_v2(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_legacy_guard text :=
    'if not public.is_public_booking_service_available(v_workspace.id, v_service_name) then';
  v_canonical_guard text :=
    'if not public.is_public_booking_service_available_v2(v_workspace.id, v_service_name, v_required_role) then';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('is_public_booking_service_available_v2' in v_definition) = 0 then
    v_next := replace(v_definition, v_legacy_guard, v_canonical_guard);
    if v_next = v_definition then
      raise exception 'public_booking_service_role_guard_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$migration$;

-- This helper returns the whole private owner payload and is only an internal
-- building block for SECURITY DEFINER public RPCs. It must never be callable
-- directly through PostgREST by a customer or an authenticated client.
revoke all on function public.get_public_portal_owner_payload(uuid)
  from public, anon, authenticated;

-- Replacing the internal helper must not alter the intended public entrypoint.
grant execute on function public.get_client_portal_snapshot(text)
  to anon, authenticated;
grant execute on function public.get_client_portal_catalog(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
