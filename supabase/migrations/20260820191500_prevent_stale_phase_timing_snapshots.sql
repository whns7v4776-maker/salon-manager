-- Derived owner/client snapshots may be published by a tab that was opened
-- before a phased resize. Never let that stale projection overwrite the
-- canonical duration and phase timing already committed in appointments and
-- booking_requests.

create or replace function public.overlay_canonical_appointment_timing_v1(
  p_workspace_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when appointment.id is null then entry.item
        else entry.item || jsonb_build_object(
          'data', appointment.appointment_date::text,
          'ora', to_char(appointment.appointment_time, 'HH24:MI'),
          'durataMinuti', appointment.duration_minutes,
          'phaseConfig', appointment.phase_snapshot
        )
      end
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
  ) with ordinality as entry(item, ordinality)
  left join public.appointments as appointment
    on appointment.workspace_id = p_workspace_id
   and appointment.id::text = nullif(entry.item ->> 'id', '');
$$;

create or replace function public.overlay_canonical_request_timing_v1(
  p_workspace_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when request.id is null then entry.item
        else entry.item || jsonb_build_object(
          'data', request.appointment_date::text,
          'ora', to_char(request.appointment_time, 'HH24:MI'),
          'durataMinuti', request.requested_duration_minutes,
          'phaseConfig', request.phase_snapshot
        )
      end
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
  ) with ordinality as entry(item, ordinality)
  left join public.booking_requests as request
    on request.workspace_id = p_workspace_id
   and request.id::text = nullif(entry.item ->> 'id', '');
$$;

create or replace function public.protect_client_portal_canonical_timing_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.appuntamenti := public.overlay_canonical_appointment_timing_v1(
    new.workspace_id,
    new.appuntamenti
  );
  new.richieste_prenotazione := public.overlay_canonical_request_timing_v1(
    new.workspace_id,
    new.richieste_prenotazione
  );
  return new;
end;
$$;

drop trigger if exists protect_client_portal_canonical_timing_v1
  on public.client_portals;
create trigger protect_client_portal_canonical_timing_v1
before insert or update of appuntamenti, richieste_prenotazione
on public.client_portals
for each row
execute function public.protect_client_portal_canonical_timing_v1();

create or replace function public.protect_owner_snapshot_canonical_timing_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.payload := jsonb_set(
    coalesce(new.payload, '{}'::jsonb),
    '{appuntamenti}',
    public.overlay_canonical_appointment_timing_v1(
      new.workspace_id,
      coalesce(new.payload -> 'appuntamenti', '[]'::jsonb)
    ),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{richiestePrenotazione}',
    public.overlay_canonical_request_timing_v1(
      new.workspace_id,
      coalesce(new.payload -> 'richiestePrenotazione', '[]'::jsonb)
    ),
    true
  );
  return new;
end;
$$;

drop trigger if exists protect_owner_snapshot_canonical_timing_v1
  on public.owner_app_snapshots;
create trigger protect_owner_snapshot_canonical_timing_v1
before insert or update of payload
on public.owner_app_snapshots
for each row
execute function public.protect_owner_snapshot_canonical_timing_v1();

-- Repair already-stale derived copies once. The triggers above protect every
-- subsequent publish, including publishes from older open app/web sessions.
update public.client_portals
set appuntamenti = appuntamenti,
    richieste_prenotazione = richieste_prenotazione;

update public.owner_app_snapshots
set payload = payload;

revoke all on function public.overlay_canonical_appointment_timing_v1(uuid, jsonb)
  from public;
revoke all on function public.overlay_canonical_request_timing_v1(uuid, jsonb)
  from public;

notify pgrst, 'reload schema';
