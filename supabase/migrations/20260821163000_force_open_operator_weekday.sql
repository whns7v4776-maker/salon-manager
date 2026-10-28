-- An explicit one-day reopening is a real public opening, not just a visual
-- salon override. It bypasses the operators' ordinary weekday pattern for that
-- date while preserving operator-scoped absences and explicit date ranges.

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
  v_settings jsonb := '{}'::jsonb;
  v_enabled_weekdays jsonb;
  v_date_ranges jsonb;
  v_force_open boolean := false;
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

  v_settings := public.resolve_public_portal_availability_settings(p_workspace_id);

  select coalesce((item ->> 'forceOpen')::boolean, false)
  into v_force_open
  from jsonb_array_elements(coalesce(v_settings -> 'dateOverrides', '[]'::jsonb)) as item
  where item ->> 'date' = p_appointment_date::text
  limit 1;

  v_enabled_weekdays := coalesce(v_operator.availability -> 'enabledWeekdays', '[]'::jsonb);
  if not coalesce(v_force_open, false)
    and jsonb_typeof(v_enabled_weekdays) = 'array'
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
