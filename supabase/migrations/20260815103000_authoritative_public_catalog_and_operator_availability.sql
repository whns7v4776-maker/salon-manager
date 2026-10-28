-- Public booking must render and validate the same canonical operator policy.
-- Owner snapshots remain a transport/cache layer, never an authority for
-- service eligibility or operator working days.

create or replace function public.get_public_operator_catalog_v1(
  p_salon_code text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_workspace as (
    select workspace.id
    from public.workspaces as workspace
    where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
      and workspace.subscription_status in ('demo', 'active')
    order by
      case when workspace.subscription_status = 'active' then 0 else 1 end,
      workspace.updated_at desc nulls last,
      workspace.created_at desc
    limit 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', operator.id,
        'nome', operator.name,
        'mestiere', coalesce(operator.required_role, ''),
        'fotoUri', nullif(trim(coalesce(operator.photo_uri, '')), ''),
        'availability', coalesce(operator.availability, '{}'::jsonb),
        'publicServiceMode', coalesce(policy.mode, 'all_role'),
        'publicServiceIds', coalesce(
          (
            select jsonb_agg(link.service_id order by link.service_id)
            from public.operator_public_service_links as link
            where link.workspace_id = operator.workspace_id
              and link.operator_id = operator.id
          ),
          '[]'::jsonb
        ),
        'publicServiceKeys', '[]'::jsonb
      )
      order by operator.created_at, operator.name
    ),
    '[]'::jsonb
  )
  from public.operators as operator
  join selected_workspace on selected_workspace.id = operator.workspace_id
  left join public.operator_public_booking_policies as policy
    on policy.workspace_id = operator.workspace_id
    and policy.operator_id = operator.id;
$$;

revoke all on function public.get_public_operator_catalog_v1(text) from public;
grant execute on function public.get_public_operator_catalog_v1(text) to anon, authenticated;

create or replace function public.is_public_operator_available_on_date_v1(
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
  v_operator public.operators%rowtype;
  v_enabled_weekdays jsonb;
  v_date_ranges jsonb;
begin
  if p_workspace_id is null or p_appointment_date is null then
    return false;
  end if;

  select operator.*
  into v_operator
  from public.operators as operator
  where operator.workspace_id = p_workspace_id
    and (
      (
        trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and operator.id = case
          when trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then trim(p_operator_id)::uuid
          else null
        end
      )
      or (
        nullif(lower(trim(coalesce(p_operator_name, ''))), '') is not null
        and lower(trim(operator.name)) = lower(trim(p_operator_name))
      )
    )
  order by case when operator.id::text = trim(coalesce(p_operator_id, '')) then 0 else 1 end
  limit 1;

  if v_operator.id is null then
    return false;
  end if;

  v_enabled_weekdays := coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb);
  if jsonb_typeof(v_enabled_weekdays) = 'array'
    and jsonb_array_length(v_enabled_weekdays) > 0
    and not exists (
      select 1
      from jsonb_array_elements_text(v_enabled_weekdays) as weekday(value)
      where weekday.value ~ '^[0-6]$'
        and weekday.value::integer = extract(dow from p_appointment_date)::integer
    )
  then
    return false;
  end if;

  v_date_ranges := coalesce(v_operator.availability -> 'dateRanges', '[]'::jsonb);
  if jsonb_typeof(v_date_ranges) = 'array'
    and jsonb_array_length(v_date_ranges) > 0
    and not exists (
      select 1
      from jsonb_array_elements(v_date_ranges) as range_item(value)
      where nullif(trim(coalesce(range_item.value ->> 'startDate', '')), '') is not null
        and nullif(trim(coalesce(range_item.value ->> 'endDate', '')), '') is not null
        and trim(range_item.value ->> 'startDate') <= p_appointment_date::text
        and trim(range_item.value ->> 'endDate') >= p_appointment_date::text
    )
  then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_public_operator_available_on_date_v1(uuid, text, text, date)
  from public;
grant execute on function public.is_public_operator_available_on_date_v1(uuid, text, text, date)
  to anon, authenticated;

-- Every public availability path (ordinary, phased and composition batches)
-- eventually calls this exact-slot function with the candidate operator.
-- Inject the canonical working-day guard once at that shared boundary.
do $$
declare
  v_definition text;
  v_anchor text := 'v_owner_payload := public.get_public_portal_owner_payload(p_workspace_id);';
  v_replacement text := E'if (v_requested_operator_id is not null or v_requested_operator_name is not null)\n    and not public.is_public_operator_available_on_date_v1(\n      p_workspace_id,\n      v_requested_operator_id,\n      v_requested_operator_name,\n      p_appointment_date\n    )\n  then\n    return false;\n  end if;\n\n  v_owner_payload := public.get_public_portal_owner_payload(p_workspace_id);';
begin
  select pg_get_functiondef(
    'public.is_public_booking_slot_available(uuid,date,time,integer,text,text,text)'::regprocedure
  ) into v_definition;

  if position('is_public_operator_available_on_date_v1' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'public_slot_operator_availability_anchor_missing';
    end if;
    execute replace(v_definition, v_anchor, v_replacement);
  end if;
end;
$$;

notify pgrst, 'reload schema';
