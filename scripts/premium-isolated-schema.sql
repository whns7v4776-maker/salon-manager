-- Export definitions only for offline testing. No production rows or secrets/sessions.
begin read only;
set local statement_timeout='20s';
select jsonb_build_object(
 'checkedAt',now(),
 'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'enums',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'labels',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid))),'[]'::jsonb) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','salonpro_private') and t.typtype='e'),
 'tables',(select jsonb_agg(jsonb_build_object(
   'schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid,true))),'[]'::jsonb) from pg_constraint k where k.conrelid=c.oid),
   'grants',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'select',has_table_privilege(r.oid,c.oid,'select'),'insert',has_table_privilege(r.oid,c.oid,'insert'),'update',has_table_privilege(r.oid,c.oid,'update'),'delete',has_table_privilege(r.oid,c.oid,'delete'))),'[]'::jsonb) from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
 ) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname in ('public','salonpro_private') and c.relkind in ('r','p','c')) or (n.nspname='auth' and c.relname='users' and c.relkind='r')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,'ddl',pg_get_functiondef(p.oid),'body',p.prosrc,'defaults',pg_get_expr(p.proargdefaults,0),'securityDefiner',p.prosecdef,'arguments',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'anonExecute',has_function_privilege('anon',p.oid,'execute'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'execute'),'serviceExecute',has_function_privilege('service_role',p.oid,'execute')) order by n.nspname,p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname in ('public','salonpro_private') or n.nspname='auth' and p.proname in ('uid','role','jwt')) and p.prokind='f'),
 'views',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'ddl',pg_get_viewdef(c.oid,true))),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','salonpro_private') and c.relkind='v'),
 'sequences',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'name',sequencename,'start',start_value::text,'min',min_value::text,'max',max_value::text,'increment',increment_by::text,'cycle',cycle)),'[]'::jsonb) from pg_sequences where schemaname in ('public','salonpro_private')),
 'indexes',(select coalesce(jsonb_agg(indexdef),'[]'::jsonb) from pg_indexes i where i.schemaname in ('public','salonpro_private') and not exists(select 1 from pg_constraint k where k.conindid=to_regclass(quote_ident(i.schemaname)||'.'||quote_ident(i.indexname)))),
 'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid,true)),'[]'::jsonb) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','salonpro_private') and not t.tgisinternal),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from pg_policies p where p.schemaname in ('public','salonpro_private')),
 'migrationHistory',(select jsonb_agg(to_jsonb(m)-'statements' order by m.version) from supabase_migrations.schema_migrations m)
) as isolated_schema;
rollback;
