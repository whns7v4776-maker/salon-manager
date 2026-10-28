-- The owner payload also contains customers, appointments and request history.
-- Exact availability needs only services, operators and availability settings;
-- repeatedly decoding the full payload dominated phased 15-minute batches.
-- Keep a compact transaction-local read context for planners only.

create or replace function public.get_public_booking_context_cached_read_v1(
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
    current_setting('salonpro.public_booking_context_workspace_id', true),
    ''
  );
  v_cached_context_text text := nullif(
    current_setting('salonpro.public_booking_context_json', true),
    ''
  );
  v_payload jsonb;
  v_context jsonb;
begin
  if p_workspace_id is null then
    return '{}'::jsonb;
  end if;

  if v_cached_workspace_id = p_workspace_id::text
    and v_cached_context_text is not null
  then
    begin
      return v_cached_context_text::jsonb;
    exception when others then
      null;
    end;
  end if;

  v_payload := public.get_public_portal_owner_payload_cached_v1(p_workspace_id);
  v_context := jsonb_build_object(
    'servizi', coalesce(v_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_payload -> 'operatori', '[]'::jsonb),
    'availabilitySettings', coalesce(v_payload -> 'availabilitySettings', '{}'::jsonb)
  );

  perform set_config(
    'salonpro.public_booking_context_workspace_id',
    p_workspace_id::text,
    true
  );
  perform set_config(
    'salonpro.public_booking_context_json',
    v_context::text,
    true
  );
  return v_context;
end;
$$;

revoke all on function public.get_public_booking_context_cached_read_v1(uuid)
  from public, anon, authenticated;

create or replace function public.is_public_operator_available_on_date_cached_read_v1(
  p_workspace_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_appointment_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cache jsonb;
  v_cache_key text := md5(concat_ws(
    ':',
    coalesce(p_workspace_id::text, ''),
    coalesce(p_appointment_date::text, ''),
    coalesce(trim(p_operator_id), ''),
    coalesce(lower(trim(p_operator_name)), '')
  ));
  v_result boolean;
begin
  begin
    v_cache := coalesce(
      nullif(current_setting('salonpro.public_booking_operator_dates', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_cache := '{}'::jsonb;
  end;

  if jsonb_typeof(v_cache -> v_cache_key) = 'boolean' then
    return (v_cache ->> v_cache_key)::boolean;
  end if;

  v_result := public.is_public_operator_available_on_date_v1(
    p_workspace_id,
    p_operator_id,
    p_operator_name,
    p_appointment_date
  );
  v_cache := v_cache || jsonb_build_object(v_cache_key, v_result);
  perform set_config(
    'salonpro.public_booking_operator_dates',
    v_cache::text,
    true
  );
  return v_result;
end;
$$;

revoke all on function public.is_public_operator_available_on_date_cached_read_v1(
  uuid, text, text, date
) from public, anon, authenticated;

do $install_compact_exact_read_validator$
declare
  v_signature regprocedure :=
    'public.is_public_booking_slot_available_cached_read_v1(uuid,date,time without time zone,integer,text,text,text)'::regprocedure;
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_updated := replace(
    v_definition,
    'public.get_public_portal_owner_payload_cached_v1(p_workspace_id)',
    'public.get_public_booking_context_cached_read_v1(p_workspace_id)'
  );
  v_updated := replace(
    v_updated,
    'public.get_public_portal_owner_payload(p_workspace_id)',
    'public.get_public_booking_context_cached_read_v1(p_workspace_id)'
  );
  v_updated := replace(
    v_updated,
    'get_public_portal_owner_payload_cached_v1(p_workspace_id)',
    'public.get_public_booking_context_cached_read_v1(p_workspace_id)'
  );
  v_updated := replace(
    v_updated,
    'get_public_portal_owner_payload(p_workspace_id)',
    'public.get_public_booking_context_cached_read_v1(p_workspace_id)'
  );
  v_updated := replace(
    v_updated,
    'public.is_public_operator_available_on_date_v1(',
    'public.is_public_operator_available_on_date_cached_read_v1('
  );
  v_updated := replace(
    v_updated,
    'is_public_operator_available_on_date_v1(',
    'public.is_public_operator_available_on_date_cached_read_v1('
  );

  if v_updated = v_definition
    or position('get_public_booking_context_cached_read_v1' in v_updated) = 0
    or position('is_public_operator_available_on_date_cached_read_v1' in v_updated) = 0
  then
    raise exception 'compact_exact_read_validator_anchor_missing';
  end if;
  execute v_updated;
end;
$install_compact_exact_read_validator$;

notify pgrst, 'reload schema';
