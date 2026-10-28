-- Temporary service-role-only diagnostic used to verify the effective remote
-- definitions after dynamic CREATE OR REPLACE patches. It is removed by the
-- follow-up repair migration once the exact remaining gate is known.

create or replace function public.get_internal_public_booking_function_defs_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(procedure.oid::regprocedure::text, pg_get_functiondef(procedure.oid)),
    '{}'::jsonb
  )
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and procedure.proname = any(array[
      'create_public_booking_request',
      'create_public_booking_request_lightweight_v1',
      'create_public_booking_request_ultralight_v1',
      'create_public_booking_request_ultralight_v2',
      'create_public_booking_request_ultralight_v3',
      'create_public_booking_request_ultralight_v4',
      'create_public_phased_booking_request_v1',
      'create_public_phased_booking_request_v2',
      'create_public_phased_booking_request_v3',
      'create_public_phased_booking_request_v4',
      'create_public_phased_booking_request_v5',
      'create_public_phased_booking_request_with_assignments_v1',
      'create_public_phased_booking_request_with_assignments_v1_with_final'
    ]);
$$;

revoke all on function public.get_internal_public_booking_function_defs_v1()
  from public;
grant execute on function public.get_internal_public_booking_function_defs_v1()
  to service_role;

notify pgrst, 'reload schema';
