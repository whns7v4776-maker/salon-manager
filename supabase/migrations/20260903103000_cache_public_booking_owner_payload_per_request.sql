-- Public availability used to rebuild the same owner JSON payload for every
-- candidate start, interval and operator. With a five-minute Agenda and a
-- fifteen-minute public cadence that turns one seven-day summary into hundreds
-- of identical snapshot reads. Keep one transaction-local copy instead: every
-- RPC still sees one PostgreSQL snapshot, and the existing consistency fence
-- remains authoritative if concurrent data changes while a summary is built.

create or replace function public.get_public_portal_owner_payload_cached_v1(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cached_workspace_id text := nullif(
    current_setting('salonpro.public_booking_payload_workspace_id', true),
    ''
  );
  v_cached_payload_text text := nullif(
    current_setting('salonpro.public_booking_payload_json', true),
    ''
  );
  v_payload jsonb;
begin
  if p_workspace_id is null then
    return '{}'::jsonb;
  end if;

  if v_cached_workspace_id = p_workspace_id::text
    and v_cached_payload_text is not null
  then
    begin
      return v_cached_payload_text::jsonb;
    exception when others then
      -- A malformed transaction-local value must never affect availability.
      -- Rebuild it from the canonical source below.
      null;
    end;
  end if;

  v_payload := coalesce(
    public.get_public_portal_owner_payload(p_workspace_id),
    '{}'::jsonb
  );

  perform set_config(
    'salonpro.public_booking_payload_workspace_id',
    p_workspace_id::text,
    true
  );
  perform set_config(
    'salonpro.public_booking_payload_json',
    v_payload::text,
    true
  );

  return v_payload;
end;
$$;

revoke all on function public.get_public_portal_owner_payload_cached_v1(uuid)
  from public, anon, authenticated;

-- Patch only the shared availability readers. Their signatures, return values,
-- grants and every booking rule stay unchanged, so already-installed clients
-- benefit without an application build.
do $$
declare
  v_signature text;
  v_definition text;
  v_patched_definition text;
begin
  foreach v_signature in array array[
    'public.is_public_booking_service_available(uuid,text)',
    'public.is_public_booking_time_allowed_by_availability(uuid,date,time without time zone,integer)',
    'public.is_public_booking_slot_available(uuid,date,time without time zone,integer,text,text,text)'
  ]
  loop
    select pg_get_functiondef(v_signature::regprocedure)
    into v_definition;

    if position('get_public_portal_owner_payload_cached_v1' in v_definition) > 0 then
      continue;
    end if;

    v_patched_definition := replace(
      v_definition,
      'public.get_public_portal_owner_payload(p_workspace_id)',
      'public.get_public_portal_owner_payload_cached_v1(p_workspace_id)'
    );

    if v_patched_definition = v_definition then
      raise exception 'public_booking_payload_cache_anchor_missing:%', v_signature;
    end if;

    execute v_patched_definition;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
