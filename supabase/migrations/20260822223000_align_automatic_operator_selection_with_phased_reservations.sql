-- Keep automatic public operator selection aligned with the authoritative
-- phase-aware conflict validator. In particular, accepted requests whose
-- appointment materialization is temporarily missing must still reserve the
-- operator's real working phases.

create or replace function public.is_public_operator_interval_available_v1(
  p_workspace_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_duration_minutes integer,
  p_requested_service_name text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_public_booking_slot_available(
      p_workspace_id,
      p_appointment_date,
      p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 1), 1),
      p_requested_service_name,
      p_requested_operator_id,
      p_requested_operator_name
    )
    and not public.phased_operator_interval_conflicts_v1(
      p_workspace_id,
      p_appointment_date,
      p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 1), 1),
      p_requested_operator_id,
      p_requested_operator_name,
      null,
      null
    );
$$;

revoke all on function public.is_public_operator_interval_available_v1(
  uuid, date, time, integer, text, text, text
) from public;
grant execute on function public.is_public_operator_interval_available_v1(
  uuid, date, time, integer, text, text, text
) to anon, authenticated;

do $$
declare
  v_function record;
  v_definition text;
  v_updated text;
begin
  for v_function in
    select procedure.oid, procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.proname in (
        'create_public_booking_request_ultralight_v3',
        'create_public_phased_booking_request_v4'
      )
  loop
    select pg_get_functiondef(v_function.oid) into v_definition;
    v_updated := replace(
      v_definition,
      'public.is_public_booking_slot_available(',
      'public.is_public_operator_interval_available_v1('
    );

    if v_updated is distinct from v_definition then
      execute v_updated;
    end if;

    select pg_get_functiondef(v_function.oid) into v_definition;
    if position('public.is_public_operator_interval_available_v1(' in v_definition) = 0 then
      raise exception 'phase_aware_operator_selection_not_installed:%', v_function.signature;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
