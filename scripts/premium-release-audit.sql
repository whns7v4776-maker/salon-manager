-- Metadata only. No customer rows, feature writes, migrations, notifications or payments.
begin read only;
set local statement_timeout = '12s';
select jsonb_build_object(
  'checkedAt', now(),
  'databaseVersion', current_setting('server_version'),
  'migrations', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb) from supabase_migrations.schema_migrations),
  'functions', (select coalesce(jsonb_agg(jsonb_build_object(
    'name', p.proname,
    'arguments', pg_get_function_identity_arguments(p.oid),
    'returns', pg_get_function_result(p.oid),
    'securityDefiner', p.prosecdef,
    'anonExecute', has_function_privilege('anon', p.oid, 'execute'),
    'authenticatedExecute', has_function_privilege('authenticated', p.oid, 'execute')
  ) order by p.proname, p.oid), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'),
  'tables', (select coalesce(jsonb_agg(jsonb_build_object(
    'name', c.relname,
    'rls', c.relrowsecurity,
    'anonSelect', has_table_privilege('anon', c.oid, 'select'),
    'authenticatedSelect', has_table_privilege('authenticated', c.oid, 'select'),
    'columns', (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid,a.atttypmod)) order by a.attnum)
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)
  ) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p'))
) as premium_release_audit;
rollback;
