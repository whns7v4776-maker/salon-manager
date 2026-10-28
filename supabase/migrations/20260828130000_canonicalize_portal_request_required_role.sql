-- Two owner publishers can derive a profession from the service catalog while
-- the persisted booking request has no required role. Keep the booking_requests
-- row authoritative so stale/open clients cannot alternate the same snapshot
-- between an empty role and a derived role forever.

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
        else (
          entry.item - 'mestiereRichiesto'
        ) || jsonb_build_object(
          'data', request.appointment_date::text,
          'ora', to_char(request.appointment_time, 'HH24:MI'),
          'durataMinuti', request.requested_duration_minutes,
          'phaseConfig', request.phase_snapshot,
          'mestiereRichiesto', trim(coalesce(request.required_role, ''))
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

-- The existing BEFORE triggers call the helper above for both owner snapshots
-- and client portals. Repair only rows whose request projection really changes.
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

notify pgrst, 'reload schema';
