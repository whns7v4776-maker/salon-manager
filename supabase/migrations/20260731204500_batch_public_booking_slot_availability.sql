create or replace function public.get_public_booking_slot_availability_batch(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_interval jsonb;
  v_slot_time text;
  v_interval_time text;
  v_interval_duration integer;
  v_available boolean;
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(p_slot_requests) <> 'array'
  then
    return v_result;
  end if;

  for v_slot in
    select value
    from jsonb_array_elements(p_slot_requests)
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    v_available :=
      v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and jsonb_typeof(v_slot -> 'intervals') = 'array'
      and jsonb_array_length(v_slot -> 'intervals') > 0;

    if v_available then
      for v_interval in
        select value
        from jsonb_array_elements(v_slot -> 'intervals')
      loop
        v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
        v_interval_duration := case
          when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
            then (v_interval ->> 'durationMinutes')::integer
          else 0
        end;

        if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
          or v_interval_duration <= 0
          or not public.is_public_booking_slot_available(
            p_workspace_id,
            p_appointment_date,
            v_interval_time::time,
            v_interval_duration,
            p_requested_service_name,
            p_requested_operator_id,
            p_requested_operator_name
          )
        then
          v_available := false;
          exit;
        end if;
      end loop;
    end if;

    if v_slot_time <> '' then
      v_result := v_result || jsonb_build_object(v_slot_time, v_available);
    end if;
  end loop;

  return v_result;
end;
$$;

grant execute on function public.get_public_booking_slot_availability_batch(
  uuid,
  date,
  jsonb,
  text,
  text,
  text
) to anon;

grant execute on function public.get_public_booking_slot_availability_batch(
  uuid,
  date,
  jsonb,
  text,
  text,
  text
) to authenticated;
