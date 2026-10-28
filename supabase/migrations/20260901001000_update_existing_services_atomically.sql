-- Update an exact set of existing canonical services in one transaction.
-- This RPC deliberately has no INSERT branch: a stale owner payload can never
-- recreate a service that another device deleted before or during the write.

create or replace function public.update_existing_services_v1(
  p_services jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_requested_count integer;
  v_unique_count integer;
  v_locked_count integer := 0;
  v_updated_count integer := 0;
  v_locked_id uuid;
  v_updated_ids uuid[] := '{}'::uuid[];
  v_canonical_services jsonb := '[]'::jsonb;
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

  if jsonb_typeof(coalesce(p_services, 'null'::jsonb)) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'service_updates_array_required';
  end if;

  v_requested_count := jsonb_array_length(p_services);
  if v_requested_count < 1 or v_requested_count > 500 then
    raise exception using
      errcode = '22023',
      message = 'service_updates_count_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_services) as requested(item)
    where jsonb_typeof(requested.item) <> 'object'
      or coalesce(requested.item ->> 'id', '') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'service_update_id_invalid';
  end if;

  select count(distinct lower(requested.item ->> 'id'))
  into v_unique_count
  from jsonb_array_elements(p_services) as requested(item);

  if v_unique_count <> v_requested_count then
    raise exception using
      errcode = '22023',
      message = 'service_update_ids_not_unique';
  end if;

  -- Existing service writes already use this workspace advisory lock in the
  -- normalization trigger. Acquiring it first serializes this transaction with
  -- legacy clients, then row locks make the complete preflight authoritative.
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  for v_locked_id in
    select service.id
    from public.services as service
    join jsonb_array_elements(p_services) as requested(item)
      on service.id = (requested.item ->> 'id')::uuid
    where service.workspace_id = v_workspace_id
      and service.superseded_by_composition_id is null
    order by service.id
    for update of service
  loop
    v_locked_count := v_locked_count + 1;
  end loop;

  if v_locked_count <> v_requested_count then
    raise exception using
      errcode = 'P0001',
      message = 'service_update_target_changed',
      detail = format(
        'Expected %s existing services in workspace %s, locked %s.',
        v_requested_count,
        v_workspace_id,
        v_locked_count
      );
  end if;

  with requested as (
    select
      (entry.item ->> 'id')::uuid as id,
      entry.item
    from jsonb_array_elements(p_services) as entry(item)
  ),
  updated as (
    update public.services as service
    set
      name = case
        when requested.item ? 'name' then requested.item ->> 'name'
        else service.name
      end,
      description = case
        when requested.item ? 'description'
          then nullif(btrim(coalesce(requested.item ->> 'description', '')), '')
        else service.description
      end,
      price = case
        when requested.item ? 'price'
          then (requested.item ->> 'price')::numeric
        else service.price
      end,
      original_price = case
        when requested.item ? 'original_price'
          then (requested.item ->> 'original_price')::numeric
        else service.original_price
      end,
      discount_enabled = case
        when requested.item ? 'discount_enabled'
          then (requested.item ->> 'discount_enabled')::boolean
        else service.discount_enabled
      end,
      discount_valid_from = case
        when requested.item ? 'discount_valid_from'
          then (requested.item ->> 'discount_valid_from')::date
        else service.discount_valid_from
      end,
      discount_valid_to = case
        when requested.item ? 'discount_valid_to'
          then (requested.item ->> 'discount_valid_to')::date
        else service.discount_valid_to
      end,
      discount_start_time = case
        when requested.item ? 'discount_start_time'
          then (requested.item ->> 'discount_start_time')::time without time zone
        else service.discount_start_time
      end,
      discount_end_time = case
        when requested.item ? 'discount_end_time'
          then (requested.item ->> 'discount_end_time')::time without time zone
        else service.discount_end_time
      end,
      discount_weekdays = case
        when not (requested.item ? 'discount_weekdays')
          then service.discount_weekdays
        when jsonb_typeof(requested.item -> 'discount_weekdays') = 'array'
          then array(
            select weekday.value::smallint
            from jsonb_array_elements_text(
              requested.item -> 'discount_weekdays'
            ) as weekday(value)
          )
        else null
      end,
      duration_minutes = case
        when requested.item ? 'duration_minutes'
          then (requested.item ->> 'duration_minutes')::integer
        else service.duration_minutes
      end,
      required_role = case
        when requested.item ? 'required_role'
          then nullif(btrim(coalesce(requested.item ->> 'required_role', '')), '')
        else service.required_role
      end,
      client_badge = case
        when requested.item ? 'client_badge'
          then nullif(btrim(coalesce(requested.item ->> 'client_badge', '')), '')
        else service.client_badge
      end,
      client_role_display_order = case
        when requested.item ? 'client_role_display_order'
          then (requested.item ->> 'client_role_display_order')::integer
        else service.client_role_display_order
      end,
      client_display_order = case
        when requested.item ? 'client_display_order'
          then (requested.item ->> 'client_display_order')::integer
        else service.client_display_order
      end,
      is_online = case
        when requested.item ? 'is_online'
          then (requested.item ->> 'is_online')::boolean
        else service.is_online
      end,
      composition_only = case
        when requested.item ? 'composition_only'
          then (requested.item ->> 'composition_only')::boolean
        else service.composition_only
      end,
      composition_source_kind = case
        when requested.item ? 'composition_source_kind'
          then nullif(
            btrim(coalesce(requested.item ->> 'composition_source_kind', '')),
            ''
          )
        else service.composition_source_kind
      end,
      composition_source_service_id = case
        when requested.item ? 'composition_source_service_id'
          then (requested.item ->> 'composition_source_service_id')::uuid
        else service.composition_source_service_id
      end,
      composition_source_phase = case
        when requested.item ? 'composition_source_phase'
          then nullif(
            btrim(coalesce(requested.item ->> 'composition_source_phase', '')),
            ''
          )
        else service.composition_source_phase
      end,
      phase_config = case
        when requested.item ? 'phase_config'
          then coalesce(requested.item -> 'phase_config', '{}'::jsonb)
        else service.phase_config
      end,
      linked_service_config = case
        when requested.item ? 'linked_service_config'
          then coalesce(
            requested.item -> 'linked_service_config',
            '{}'::jsonb
          )
        else service.linked_service_config
      end
    from requested
    where service.id = requested.id
      and service.workspace_id = v_workspace_id
      and service.superseded_by_composition_id is null
    returning service.id
  )
  select
    count(*),
    coalesce(array_agg(updated.id order by updated.id), '{}'::uuid[])
  into v_updated_count, v_updated_ids
  from updated;

  if v_updated_count <> v_requested_count then
    raise exception using
      errcode = 'P0001',
      message = 'service_update_count_mismatch';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(service) order by service.id),
    '[]'::jsonb
  )
  into v_canonical_services
  from public.services as service
  where service.workspace_id = v_workspace_id
    and service.superseded_by_composition_id is null;

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'updatedIds', to_jsonb(v_updated_ids),
    'services', v_canonical_services
  );
end;
$$;

revoke all on function public.update_existing_services_v1(jsonb)
  from public, anon, service_role;
grant execute on function public.update_existing_services_v1(jsonb)
  to authenticated;

comment on function public.update_existing_services_v1(jsonb) is
  'Atomically updates only an exact locked set of existing nonsuperseded services in the authenticated workspace; never inserts.';

notify pgrst, 'reload schema';
