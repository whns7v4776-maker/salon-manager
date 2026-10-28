-- Create or update a reusable composition without changing its stable id.
-- Existing appointments keep their original composition reference while the
-- listino editor can persist reordered items and per-item overrides.

create or replace function public.save_service_composition_v3(
  p_name text,
  p_visibility text,
  p_items jsonb,
  p_allow_split_operators boolean default false,
  p_composition_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_visibility text := lower(btrim(coalesce(p_visibility, 'salon_only')));
  v_service_ids uuid[];
  v_pause_after_minutes integer[];
  v_duration_override_minutes integer[];
  v_price_overrides numeric(10, 2)[];
  v_service_count integer;
  v_matching_count integer;
  v_role_count integer;
  v_blank_role_count integer;
  v_public_invalid_count integer;
  v_composition_id uuid := p_composition_id;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception using errcode = '42501', message = 'workspace_access_denied';
  end if;

  if v_name = '' then
    raise exception using errcode = '22023', message = 'composition_name_required';
  end if;
  if char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'composition_name_too_long';
  end if;
  if v_visibility not in ('salon_only', 'public') then
    raise exception using errcode = '22023', message = 'invalid_composition_visibility';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_composition_services';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or coalesce(entry.value ->> 'serviceId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(entry.value ->> 'pauseAfterMinutes', '0') !~ '^[0-9]+$'
      or case
        when coalesce(entry.value ->> 'pauseAfterMinutes', '0') ~ '^[0-9]+$'
          then (coalesce(entry.value ->> 'pauseAfterMinutes', '0'))::integer > 180
            or (coalesce(entry.value ->> 'pauseAfterMinutes', '0'))::integer % 5 <> 0
        else false
      end
      or (
        entry.value -> 'durationOverrideMinutes' is not null
        and jsonb_typeof(entry.value -> 'durationOverrideMinutes') <> 'null'
        and case
          when coalesce(entry.value ->> 'durationOverrideMinutes', '') ~ '^[0-9]+$'
            then (entry.value ->> 'durationOverrideMinutes')::integer not between 5 and 480
              or (entry.value ->> 'durationOverrideMinutes')::integer % 5 <> 0
          else true
        end
      )
      or (
        entry.value -> 'priceOverride' is not null
        and jsonb_typeof(entry.value -> 'priceOverride') <> 'null'
        and case
          when coalesce(entry.value ->> 'priceOverride', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
            then (entry.value ->> 'priceOverride')::numeric > 9999
          else true
        end
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid_composition_item';
  end if;

  select
    array_agg((entry.value ->> 'serviceId')::uuid order by entry.position),
    array_agg(
      (coalesce(entry.value ->> 'pauseAfterMinutes', '0'))::integer
      order by entry.position
    ),
    array_agg(
      case
        when jsonb_typeof(entry.value -> 'durationOverrideMinutes') = 'number'
          then (entry.value ->> 'durationOverrideMinutes')::integer
        else null
      end
      order by entry.position
    ),
    array_agg(
      case
        when jsonb_typeof(entry.value -> 'priceOverride') = 'number'
          then round((entry.value ->> 'priceOverride')::numeric, 2)
        else null
      end
      order by entry.position
    )
  into
    v_service_ids,
    v_pause_after_minutes,
    v_duration_override_minutes,
    v_price_overrides
  from jsonb_array_elements(p_items) with ordinality as entry(value, position);

  v_service_count := coalesce(cardinality(v_service_ids), 0);
  if v_service_count < 2 or v_service_count > 20 then
    raise exception using errcode = '22023', message = 'invalid_composition_service_count';
  end if;
  if (select count(distinct service_id) from unnest(v_service_ids) as selected(service_id))
    <> v_service_count
  then
    raise exception using errcode = '22023', message = 'duplicate_composition_service';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('service-composition:' || v_workspace_id::text, 0)
  );

  if v_composition_id is not null and not exists (
    select 1
    from public.service_compositions as composition
    where composition.id = v_composition_id
      and composition.workspace_id = v_workspace_id
  ) then
    raise exception using errcode = '22023', message = 'composition_not_found';
  end if;

  if exists (
    select 1
    from public.service_compositions as composition
    where composition.workspace_id = v_workspace_id
      and lower(btrim(composition.name)) = lower(v_name)
      and (v_composition_id is null or composition.id <> v_composition_id)
  ) then
    raise exception using errcode = '23505', message = 'composition_name_exists';
  end if;

  select
    count(*),
    count(distinct lower(btrim(coalesce(service.required_role, '')))),
    count(*) filter (where nullif(btrim(coalesce(service.required_role, '')), '') is null),
    count(*) filter (
      where service.is_online is false
        or (
          service.phase_config is not null
          and coalesce(service.phase_config ->> 'mode', '') = 'phased'
        )
    )
  into
    v_matching_count,
    v_role_count,
    v_blank_role_count,
    v_public_invalid_count
  from public.services as service
  join unnest(v_service_ids) as selected(service_id)
    on selected.service_id = service.id
  where service.workspace_id = v_workspace_id
    and service.superseded_by_composition_id is null;

  if v_matching_count <> v_service_count then
    raise exception using errcode = '22023', message = 'composition_service_not_available';
  end if;
  if v_blank_role_count > 0 or v_role_count <> 1 then
    raise exception using errcode = '22023', message = 'composition_services_must_share_role';
  end if;
  if v_visibility = 'public' and v_public_invalid_count > 0 then
    raise exception using errcode = '22023', message = 'public_composition_service_not_eligible';
  end if;
  if v_visibility = 'public' and exists (
    select 1
    from unnest(v_pause_after_minutes) as pause(minutes)
    where pause.minutes > 0
  ) then
    raise exception using errcode = '22023', message = 'public_composition_pause_not_supported';
  end if;

  if v_composition_id is null then
    insert into public.service_compositions (
      workspace_id,
      name,
      visibility,
      is_active,
      allow_split_operators
    ) values (
      v_workspace_id,
      v_name,
      v_visibility,
      true,
      v_visibility = 'public' and coalesce(p_allow_split_operators, false)
    )
    returning id into v_composition_id;
  else
    update public.service_compositions
    set
      name = v_name,
      visibility = v_visibility,
      is_active = true,
      allow_split_operators =
        v_visibility = 'public' and coalesce(p_allow_split_operators, false),
      updated_at = now()
    where id = v_composition_id
      and workspace_id = v_workspace_id;

    delete from public.service_composition_items
    where composition_id = v_composition_id
      and workspace_id = v_workspace_id;
  end if;

  insert into public.service_composition_items (
    workspace_id,
    composition_id,
    service_id,
    position,
    link_type,
    pause_after_minutes,
    duration_override_minutes,
    price_override
  )
  select
    v_workspace_id,
    v_composition_id,
    ordered.service_id,
    (ordered.position - 1)::integer,
    'required',
    ordered.pause_minutes,
    ordered.duration_minutes,
    ordered.price_override
  from unnest(
    v_service_ids,
    v_pause_after_minutes,
    v_duration_override_minutes,
    v_price_overrides
  ) with ordinality as ordered(
    service_id,
    pause_minutes,
    duration_minutes,
    price_override,
    position
  )
  order by ordered.position;

  return jsonb_build_object(
    'id', v_composition_id,
    'name', v_name,
    'visibility', v_visibility,
    'allowSplitOperators',
      v_visibility = 'public' and coalesce(p_allow_split_operators, false),
    'itemCount', v_service_count,
    'updated', p_composition_id is not null
  );
end;
$$;

revoke all on function public.save_service_composition_v3(text, text, jsonb, boolean, uuid)
  from public;
grant execute on function public.save_service_composition_v3(text, text, jsonb, boolean, uuid)
  to authenticated;

notify pgrst, 'reload schema';
