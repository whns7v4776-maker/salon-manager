-- Keep the current waitlist eligibility and dedupe logic intact while correcting
-- the Italian copy emitted by the canonical server function.
do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_corrected_definition text;
begin
  select procedure.oid
  into v_function_oid
  from pg_proc as procedure
  join pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'process_public_slot_waitlist'
    and procedure.pronargs = 5
  order by procedure.oid desc
  limit 1;

  if v_function_oid is null then
    raise exception 'Canonical process_public_slot_waitlist function not found';
  end if;

  v_definition := pg_get_functiondef(v_function_oid);
  v_corrected_definition := replace(
    replace(
      v_definition,
      'Si e liberato uno slot per ',
      'Si è liberato uno slot per '
    ),
    'lo slot e visibile a tutti.',
    'lo slot è visibile a tutti.'
  );

  if v_corrected_definition <> v_definition then
    execute v_corrected_definition;
  elsif position('Si è liberato uno slot per ' in v_definition) = 0 then
    raise exception 'Expected waitlist push copy not found in canonical function';
  end if;
end;
$migration$;
