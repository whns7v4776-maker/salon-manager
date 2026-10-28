-- Resizing one item in a composition must not reposition the other items.
-- The phased appointment RPC still updates its own internal processing/pose
-- window atomically, but every separate composition step keeps its chosen slot.

create or replace function public.resize_owner_linked_appointment_duration_v1(
  p_appointment_id uuid,
  p_next_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.resize_owner_appointment_duration_v3(
    p_appointment_id,
    p_next_duration_minutes,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'shiftedAppointments', '[]'::jsonb
  );
end;
$$;

create or replace function public.update_owner_linked_phased_appointment_times_v1(
  p_appointment_id uuid,
  p_initial_duration_minutes integer,
  p_processing_duration_minutes integer,
  p_final_duration_minutes integer,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.update_owner_phased_appointment_times_v3(
    p_appointment_id,
    p_initial_duration_minutes,
    p_processing_duration_minutes,
    p_final_duration_minutes,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'shiftedAppointments', '[]'::jsonb
  );
end;
$$;

revoke all on function public.resize_owner_linked_appointment_duration_v1(
  uuid, integer, boolean, boolean
) from public;
grant execute on function public.resize_owner_linked_appointment_duration_v1(
  uuid, integer, boolean, boolean
) to authenticated;

revoke all on function public.update_owner_linked_phased_appointment_times_v1(
  uuid, integer, integer, integer, boolean, boolean
) from public;
grant execute on function public.update_owner_linked_phased_appointment_times_v1(
  uuid, integer, integer, integer, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
