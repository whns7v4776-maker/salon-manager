-- Persist the public booking window as one server-authoritative mutation.
-- The owner snapshot remains a private recovery copy; it is updated only when
-- it already exists and receives the exact same value/unit/timestamp triplet.

create or replace function public.set_public_booking_window_v1(
  p_value integer,
  p_unit text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
  v_portal_settings jsonb;
  v_canonical_settings jsonb;
  v_window_patch jsonb;
  v_unit text;
  v_value integer;
  v_server_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using
      errcode = '42501',
      message = 'workspace_access_denied';
  end if;

  v_unit := lower(btrim(coalesce(p_unit, '')));
  if v_unit not in ('days', 'weeks', 'months', 'years') then
    v_unit := 'days';
  end if;

  v_value := greatest(
    1,
    least(
      coalesce(
        p_value,
        case when v_unit = 'days' then 90 else 1 end
      ),
      case v_unit
        when 'weeks' then 104
        when 'months' then 24
        when 'years' then 2
        else 730
      end
    )
  );

  -- Owner snapshot publishers acquire this row before their portal projection.
  -- Keeping the same lock order avoids a snapshot/portal deadlock while still
  -- allowing accounts that do not have a private snapshot yet.
  perform 1
  from public.owner_app_snapshots as snapshot
  where snapshot.workspace_id = v_workspace_id
  for update;

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'workspace_not_found';
  end if;

  v_server_updated_at := clock_timestamp();
  v_window_patch := jsonb_build_object(
    'publicBookingWindowValue', v_value,
    'publicBookingWindowUnit', v_unit,
    'publicBookingWindowUpdatedAt', v_server_updated_at
  );

  v_portal_settings := case
    when jsonb_typeof(v_portal.availability_settings) = 'object'
      then v_portal.availability_settings
    else '{}'::jsonb
  end;
  v_canonical_settings := v_portal_settings || v_window_patch;

  update public.client_portals as portal
  set
    availability_settings = v_canonical_settings,
    updated_at = v_server_updated_at
  where portal.workspace_id = v_workspace_id
  returning portal.* into v_portal;

  -- Do not create a derived owner snapshot here. If present, patch only the
  -- three booking-window keys and preserve every unrelated snapshot setting.
  update public.owner_app_snapshots as snapshot
  set payload = jsonb_set(
    case
      when jsonb_typeof(snapshot.payload) = 'object' then snapshot.payload
      else '{}'::jsonb
    end,
    '{availabilitySettings}',
    (
      case
        when jsonb_typeof(snapshot.payload -> 'availabilitySettings') = 'object'
          then snapshot.payload -> 'availabilitySettings'
        else '{}'::jsonb
      end
    ) || v_window_patch,
    true
  )
  where snapshot.workspace_id = v_workspace_id;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.salon_name, ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_canonical_settings
  );
end;
$$;

revoke all on function public.set_public_booking_window_v1(integer, text)
  from public, anon, service_role;
grant execute on function public.set_public_booking_window_v1(integer, text)
  to authenticated;

comment on function public.set_public_booking_window_v1(integer, text) is
  'Atomically persists the authenticated workspace public booking window with a server timestamp.';

notify pgrst, 'reload schema';
