/* Build a reviewable transaction from the exact tested additions. Never executes remote SQL. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/premium-switch-20261025');
const schema=require(path.join(out,'isolated-schema.json'));
const plan=require(path.join(out,'release-plan.json'));
const sourceFiles=plan.applyCandidates;
for(const item of sourceFiles)if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,item.file))).digest('hex')!==item.sha256)throw Error('Reviewed SQL changed: '+item.file);
const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(/\D/g,'');
const compatibilityName=parts+'_customer_portal_legacy_http_compat.sql';
const canonical=path.join(root,'supabase/migrations',compatibilityName);
if(fs.existsSync(path.join(out,'guarded-upgrade.sql')))throw Error('Guarded candidate already exists; inspect it before replacing');
fs.copyFileSync(path.join(root,sourceFiles[2].file),canonical,fs.constants.COPYFILE_EXCL);
const q=s=>"'"+s.replaceAll("'","''")+"'";
const names=['find_public_customer_by_password','get_client_portal_snapshot','portal_assert'];
const oldRaise="RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501'";
const newRaise="RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='PT403'";
const affected=names.map(name=>{const fn=schema.functions.find(f=>f.name===name);if(!fn||!fn.body.includes(oldRaise))throw Error('Unexpected baseline '+name);return fn;});
const checks=affected.map(fn=>`if (select md5(prosrc) from pg_proc where oid=${q(fn.signature)}::regprocedure) is distinct from ${q(crypto.createHash('md5').update(fn.body).digest('hex'))} then raise exception 'baseline_function_changed: ${fn.name}';end if;`).join('\n');
let sql=`-- Verified Premium cutover: additive features + exact HTTP error compatibility only.
-- New customer activity is not restored/replaced by this transaction.
begin isolation level repeatable read;
set local lock_timeout='1s';
set local statement_timeout='15s';
set local search_path=public,extensions,pg_temp;
do $preflight$ begin
 if to_regclass('public.customer_badge_policies') is not null or to_regclass('public.salon_brand_placements') is not null then raise exception 'premium_additions_already_present';end if;
 ${checks}
end $preflight$;
create temporary table premium_existing_rows(schema_name text,table_name text,n bigint,digest text) on commit drop;
create temporary table premium_existing_functions on commit drop as
 select p.oid,p.oid::regprocedure::text signature,p.proname,p.prosrc,p.prosecdef,p.proacl,p.proconfig,p.proowner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','salonpro_private','auth');
do $baseline$ declare r record;c bigint;h text;begin
 for r in select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and (n.nspname in ('public','salonpro_private') or n.nspname='auth' and c.relname in ('users','identities','sessions','refresh_tokens')) loop
  execute format('select count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %I.%I t',r.schema_name,r.table_name) into c,h;
  insert into premium_existing_rows values(r.schema_name,r.table_name,c,h);
 end loop;
end $baseline$;
`;
for(const item of sourceFiles){const content=fs.readFileSync(path.join(root,item.file),'utf8');sql+='\n-- '+item.file+'\n'+content.replace(/^\s*(?:begin|commit);\s*$/gmi,'')+'\n';}
sql+=`do $invariance$ declare r record;c bigint;h text;expected text;begin
 for r in select * from premium_existing_rows loop
  execute format('select count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %I.%I t',r.schema_name,r.table_name) into c,h;
  if c is distinct from r.n or h is distinct from r.digest then raise exception 'existing_data_changed: %.%',r.schema_name,r.table_name;end if;
 end loop;
 for r in select * from premium_existing_functions loop
  expected:=case when r.signature=any(array[${affected.map(f=>q(f.signature)).join(',')}]) then replace(r.prosrc,${q(oldRaise)},${q(newRaise)}) else r.prosrc end;
  if not exists(select 1 from pg_proc p where p.oid=r.oid and p.prosrc=expected and p.prosecdef=r.prosecdef and p.proacl is not distinct from r.proacl and p.proconfig is not distinct from r.proconfig and p.proowner=r.proowner) then raise exception 'unexpected_existing_function_change: %',r.signature;end if;
 end loop;
end $invariance$;
`;
const migrations=[sourceFiles[0].file,sourceFiles[1].file,path.relative(root,canonical)];
for(const file of migrations){const name=path.basename(file,'.sql'),version=name.split('_')[0],label=name.slice(version.length+1);const content=fs.readFileSync(path.join(root,file),'utf8');sql+=`insert into supabase_migrations.schema_migrations(version,name,statements) values(${q(version)},${q(label)},array[${q(content)}]);\n`;}
sql+=`select jsonb_build_object('existingTablesVerified',(select count(*) from premium_existing_rows),'existingFunctionsVerified',(select count(*) from premium_existing_functions),'migrations',jsonb_build_array(${migrations.map(file=>q(path.basename(file).split('_')[0])).join(',')}),'customerDataUnchanged',true,'ownerAndCustomerAccessUnchanged',true) as premium_upgrade_result;
commit;\n`;
fs.writeFileSync(path.join(out,'guarded-upgrade.sql'),sql,{mode:0o600});
fs.writeFileSync(path.join(out,'rollback-response-only.sql'),'-- Only if the response adaptation itself must be reverted; retain all data/new tables.\nbegin;\nset local lock_timeout=\'1s\';\n'+affected.map(f=>f.ddl+';').join('\n')+'\nnotify pgrst,\'reload schema\';\ncommit;\n',{mode:0o600});
fs.writeFileSync(path.join(out,'guarded-upgrade-manifest.json'),JSON.stringify({at:new Date().toISOString(),productionProject:'mlzrtpqphsdfgsklacmu',migrations:migrations.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),transactionSha256:crypto.createHash('sha256').update(sql).digest('hex'),atomic:true,repeatableRead:true,existingDataGuard:true,existingFunctionAndGrantGuard:true,lockTimeout:'1s',productionExecuted:false},null,2));
console.log(JSON.stringify({migrations,bytes:sql.length,productionExecuted:false}));
