/* Offline PostgreSQL copy of production definitions; synthetic identities only.
 * No Supabase client, credentials, network transport, cron or push worker.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const out = path.join(root,'work/premium-switch-20261025');
const source = JSON.parse(fs.readFileSync(path.join(out,'isolated-schema.json'),'utf8'));
const modulePath = process.env.PGLITE_MODULE || '/tmp/salonpro-premium-pg-test/node_modules/@electric-sql/pglite';
const { PGlite } = require(modulePath);
const extensions = Object.fromEntries(['citext','pgcrypto','uuid_ossp'].map(name=>[name,require(modulePath+'/dist/contrib/'+name+'.cjs')[name]]));
global.fetch = async()=>{throw new Error('NETWORK_DISABLED_FOR_ISOLATED_COMPATIBILITY');};
const ident = value => '"'+value.replaceAll('"','""')+'"';
const literal = value => "'"+String(value).replaceAll("'","''")+"'";
const fq = item => ident(item.schema)+'.'+ident(item.name);
const results = {at:new Date().toISOString(),schemaAt:source.checkedAt,productionRowsCopied:0,networkEnabled:false,restore:{},reconciliation:[],checks:[]};
let phase='startup';
let db = new PGlite({extensions});
const q=(sql,args=[])=>db.query(sql,args);
const exec=sql=>db.exec(sql);
const row=async(sql,args=[])=>(await q(sql,args)).rows[0];
const check=async(name,run)=>{phase=name;await run();results.checks.push({name,status:'PASS'});};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function restore() {
  phase='restore roles and extensions';
  results.emulatorDefaultTimezone=(await row("select current_setting('TimeZone') value")).value;
  await exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema extensions;create schema salonpro_private;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant usage on schema extensions to anon,authenticated,service_role;
    create extension citext;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;
    set check_function_bodies=off;set search_path=public,extensions;set timezone='UTC';`);
  for(const type of source.enums) await exec(`create type ${fq(type)} as enum (${type.labels.map(literal).join(',')})`);
  for(const sequence of source.sequences) await exec(`create sequence ${fq(sequence)} start ${sequence.start} increment ${sequence.increment} minvalue ${sequence.min} maxvalue ${sequence.max} ${sequence.cycle?'cycle':'no cycle'}`);
  for(const table of source.tables) {
    phase='restore table '+fq(table);
    await exec(`create table ${fq(table)} (${table.columns.map(c=>ident(c.name)+' '+c.type+(c.generated?` generated always as (${c.default}) stored`:'')+(c.notNull?' not null':'')).join(',')})`);
  }
  let routines=0;
  for(const fn of source.functions) {
    if(/LANGUAGE (?:c|internal)\b/i.test(fn.ddl)) continue; // Supplied by installed native extensions.
    const native = await row("select exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=to_regprocedure($1) and d.deptype='e') present",[fn.signature]);
    if(native.present)continue;
    phase='restore function '+fn.signature;
    await exec(fn.ddl);
    await exec(`revoke all on function ${fn.signature} from public,anon,authenticated,service_role`);
    for(const [role,key] of [['anon','anonExecute'],['authenticated','authenticatedExecute'],['service_role','serviceExecute']]) if(fn[key]) await exec(`grant execute on function ${fn.signature} to ${role}`);
    routines++;
  }
  for(const table of source.tables) {
    phase='restore defaults '+fq(table);
    for(const c of table.columns) if(c.default&&!c.generated) await exec(`alter table ${fq(table)} alter column ${ident(c.name)} set default ${c.default}`);
  }
  // Restore PK/unique/check constraints before FKs; these use the real schema definitions.
  for(const foreign of [false,true]) for(const table of source.tables) for(const c of table.constraints) {
    if(c.kind==='t')continue; // Constraint triggers are restored from pg_get_triggerdef below.
    if((c.kind==='f')!==foreign)continue;
    phase='restore constraint '+table.name+'.'+c.name;
    await exec(`alter table ${fq(table)} add constraint ${ident(c.name)} ${c.definition}`);
  }
  for(const ddl of source.indexes) { phase='restore index';await exec(ddl); }
  for(const ddl of source.triggers) { phase='restore trigger';await exec(ddl); }
  for(const p of source.policies) {
    phase='restore policy '+p.policyname;
    await exec(`create policy ${ident(p.policyname)} on ${ident(p.schemaname)}.${ident(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${p.roles.map(ident).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`);
  }
  for(const table of source.tables) {
    if(table.rls)await exec(`alter table ${fq(table)} enable row level security`);
    for(const grant of table.grants) {
      const permissions=['select','insert','update','delete'].filter(key=>grant[key]);
      if(permissions.length)await exec(`grant ${permissions.join(',')} on ${fq(table)} to ${ident(grant.role)}`);
    }
  }
  results.restore={tables:source.tables.length,routines,triggers:source.triggers.length,policies:source.policies.length,constraints:source.tables.reduce((n,t)=>n+t.constraints.length,0)};
}
async function definitions(){return (await q(`select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.prosrc body,p.prosecdef security,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','salonpro_private') order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;}
async function reconcile(){
  const pending=require(path.join(out,'compatibility-audit.json')).pendingMigrations;
  for(const migration of pending.slice(0,6)) {
    phase='reconcile '+migration.version;
    const before=await definitions();
    await exec('begin');
    try {
      const sql=fs.readFileSync(path.join(root,migration.file),'utf8').replace(/^\s*(?:BEGIN|COMMIT);\s*$/gmi,'');
      try { await exec(sql); }
      catch(error) {
        if(migration.version!=='20261015100000'||error.code!=='42701')throw error;
        await exec('rollback;begin');
        await exec(sql.replace(/^alter table public\.salon_benefit_settings add column[^;]+;/mi,'').replace(/create function public\.save_loyalty_earning_rule_v2/i,'create or replace function public.save_loyalty_earning_rule_v2'));
      }
      const after=await definitions();
      const changed=after.filter(f=>{
        const old=before.find(x=>x.schema===f.schema&&x.name===f.name&&x.args===f.args);
        return !old || digest(old)!==digest(f);
      }).map(f=>({schema:f.schema,name:f.name,args:f.args,bodyChanged:before.find(x=>x.schema===f.schema&&x.name===f.name&&x.args===f.args)?.body!==f.body}));
      results.reconciliation.push({version:migration.version,appliedToIsolatedOnly:true,changedFunctions:changed,existingColumnSkippedForComparison:migration.version==='20261015100000'});
    } catch(error){results.reconciliation.push({version:migration.version,error:error.message});}
    await exec('rollback');
  }
}
async function fixtureCase(label,file){
  phase=label;
  await exec('begin');
  try{
    // These retained fixtures predate the global privacy rollout. The private
    // portal suite explicitly enables protection and tests it in the same TX.
    // Normalize their starting configuration in both baseline/upgraded runs.
    await exec("update salonpro_private.portal_read_protection set enabled=false,preview_salons=array[]::text[]");
    const sql=fs.readFileSync(path.join(root,file),'utf8');
    const output=await exec(sql);
    await exec('set constraints all immediate');
    const summary=output.flatMap(item=>item.rows||[]).find(item=>item.passed!==undefined||item.passed_checks!==undefined||item.pricing_checks!==undefined);
    results.checks.push({name:label,status:'PASS',fixture:file,passedCases:summary?.passed??summary?.passed_checks??summary?.pricing_checks});
  }catch(error){results.checks.push({name:label,status:'FAIL',fixture:file,message:error.message,code:error.code,where:error.where});}
  await exec('rollback');
}
async function dataSnapshot(){
 const data=[];
 for(const table of source.tables){
   const value=await row(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${fq(table)} t`);
   data.push({table:fq(table),...value});
 }
 return data;
}
async function schemaSnapshot(){return (await q(`select c.oid::regclass::text name,c.relrowsecurity rls,(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,c.relacl::text acl,
 (select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true)) order by k.conname) from pg_constraint k where k.conrelid=c.oid) constraints,
 (select jsonb_agg(pg_get_triggerdef(t.oid,true) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) triggers,
 (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname) policies
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','salonpro_private','auth') and c.relkind in ('r','p') order by name`)).rows;}
const customer='30000000-0000-4000-8000-000000000001',workspace='10000000-0000-4000-8000-000000000001',owner='20000000-0000-4000-8000-000000000001';
async function asCustomer(){await exec(`reset role;select set_config('request.jwt.claims','{}',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','anon',false),set_config('request.headers','{"x-salonpro-customer-token":"${'a'.repeat(64)}"}',false);set role anon`);}
async function asOwner(){await exec(`reset role;select set_config('request.jwt.claims','{"sub":"${owner}","role":"authenticated"}',false),set_config('request.jwt.claim.sub','${owner}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated`);}
async function snapshot(){return (await row("select get_client_portal_snapshot('isolated-premium-salon') r")).r;}
async function simpleBooking(legacy,days,time){
 const args=['isolated-premium-salon','Fixture Haircut',20,30,days,time,'Existing','Customer','client@isolated.invalid','3331000001',null,'Offline compatibility fixture'];
 const names=['p_salon_code','p_requested_service_name','p_requested_price','p_requested_duration_minutes','p_appointment_date','p_appointment_time','p_customer_name','p_customer_surname','p_customer_email','p_customer_phone','p_customer_instagram','p_notes'];
 args.push('Barber');names.push('p_required_role');
 args.push('50000000-0000-4000-8000-000000000001','Fixture Operator');names.push('p_operator_id','p_operator_name');
 const typeFor={p_requested_price:'numeric',p_requested_duration_minutes:'integer',p_appointment_time:'time',p_customer_email:'citext'};
 // PostgREST extracts JSON fields into typed columns; match that binding here.
 const routine=legacy?'create_public_booking_request_ultralight_v2':'create_public_booking_request_ultralight_v4';
 return (await row(`select to_jsonb(${routine}(${names.map((name,i)=>name+'=>'+(i===4?`current_date+$${i+1}::int`:`$${i+1}::${typeFor[name]||'text'}`)).join(',')})) r`,args)).r;
}
async function statefulUpgrade(){
 phase='seed synthetic existing customers, history and retained session';
 await exec(fs.readFileSync(path.join(root,'scripts/premium-compatibility-fixture.sql'),'utf8'));
 let oldBooking,newBooking;
 await check('Existing customer login and saved proof work before upgrade',async()=>{
   await asCustomer();
   const profile=await row("select find_public_customer_by_password('isolated-premium-salon','client@isolated.invalid','3331000001','Fixture9!Password') r");
   assert.equal(profile.r.customerId,customer);
   assert.equal((await snapshot()).clienti[0].id,customer);
 });
 await check('Retained legacy v2 booking API accepts existing client payload',async()=>{oldBooking=await simpleBooking(true,3,'14:00');assert.ok(oldBooking.id);});
 await exec('reset role');
 const oldData=await dataSnapshot(),oldFunctions=await definitions(),oldSchema=await schemaSnapshot();
 const oldIndexes=(await q("select indexdef from pg_indexes where schemaname='public' and tablename='appointments' order by indexname")).rows;
 results.fixtureBaseline={tables:oldData.length,populatedTables:oldData.filter(x=>x.n>0).length,rows:oldData.reduce((n,t)=>n+t.n,0),dataFingerprint:digest(oldData)};
 await check('Apply only the two additive Premium migrations',async()=>{
   await exec('begin');
   for(const file of ['20261023190000_owner_customer_premium_badge.sql','20261023193000_salon_brand_placements.sql']) await exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/^\s*(?:begin|commit);\s*$/gmi,''));
   await exec('commit');
 });
 await check('Every existing data row, ID, credential and retained session is unchanged',async()=>assert.deepEqual(await dataSnapshot(),oldData));
 await check('Every existing function body, signature, permission and security mode is unchanged',async()=>{
   const upgraded=await definitions();
   assert.deepEqual(upgraded.filter(f=>oldFunctions.some(o=>o.schema===f.schema&&o.name===f.name&&o.args===f.args)),oldFunctions);
   results.addedFunctions=upgraded.length-oldFunctions.length;
 });
 await check('Existing table columns, defaults, RLS and grants are unchanged',async()=>assert.deepEqual((await schemaSnapshot()).filter(t=>oldSchema.some(o=>o.name===t.name)),oldSchema));
 await check('No index is built on the active appointments table',async()=>assert.deepEqual((await q("select indexdef from pg_indexes where schemaname='public' and tablename='appointments' order by indexname")).rows,oldIndexes));
 await check('Retained client proof still reads existing booking after upgrade',async()=>{await asCustomer();assert.ok(JSON.stringify(await snapshot()).includes(oldBooking.id));});
 await check('Premium client books with its preferred v4 booking API',async()=>{newBooking=await simpleBooking(false,4,'15:00');assert.ok(newBooking.id);});
 await check('Old reader sees the booking created by the new client',async()=>{const text=JSON.stringify(await snapshot());assert.ok(text.includes(oldBooking.id));assert.ok(text.includes(newBooking.id));assert.ok(!text.includes('Other private note'));});
 await check('New branding is disabled by default and exposes no owner identity',async()=>{const brand=(await row('select get_salon_brand_placements($1) r',[workspace])).r;assert.equal(brand.ownerEnabled,false);assert.equal(brand.frontendEnabled,false);assert.ok(!JSON.stringify(brand).includes('owner@'));});
 await exec('reset role');
 for(const [label,file] of [
   ['upgraded private portal and history','work/customer-private-access-20261018/test-server.sql'],
   ['upgraded package bookings and idempotency','scripts/test-owner-package-booking.sql'],
   ['upgraded loyalty and package-covered services','scripts/test-loyalty-package-earning.sql'],
   ['upgraded deposits, cancellation, phased and multi-operator bookings','scripts/test-booking-upfront-payment.sql'],
   ['upgraded linked composition payment pricing','scripts/test-booking-composition-payment-pricing.sql'],
 ])await fixtureCase(label,file);
 const afterNewBooking=await dataSnapshot();
 await check('Owner can save badge rules and read recalculated historical receipts',async()=>{
   await asOwner();const initial=(await row('select get_owner_customer_badge_summary($1) r',[workspace])).r;
   assert.equal(initial.enabled,false);assert.equal(initial.customers.length,1);
   const config=initial.config;config.tiers[0].visits=1;
   const saved=(await row('select set_owner_customer_badge_policy($1,true,$2::jsonb) r',[workspace,JSON.stringify(config)])).r;
   assert.equal(saved.enabled,true);assert.equal(saved.customers[0].tier,'frequente');assert.equal(saved.customers[0].spentCents,2000);
 });
 await check('New badge settings remain isolated from another salon',async()=>assert.rejects(()=>q('select get_owner_customer_badge_summary($1)',['10000000-0000-4000-8000-000000000002']),/owner_required/));
 await exec('reset role');
 await check('New settings do not change existing business rows',async()=>assert.deepEqual(await dataSnapshot(),afterNewBooking));
 await check('Owner can save independent branding settings without editing old records',async()=>{
   await exec(`insert into salon_logo_plaques(workspace_id,approved_source,display_mode,approved_path) values('${workspace}','ai','logo','isolated/approved-fixture.png')`);
   await asOwner();const brand=(await row('select set_owner_salon_brand_placements($1,true,true) r',[workspace])).r;
   assert.equal(brand.ownerEnabled,true);assert.equal(brand.frontendEnabled,true);
   await exec('reset role');
 });
 let coldData;
 await check('Create a restorable offline backup including old and new bookings',async()=>{
   coldData=await dataSnapshot();
   const archive=await db.dumpDataDir();
   fs.writeFileSync(path.join(out,'isolated-upgraded-database.tar.gz'),Buffer.from(await archive.arrayBuffer()),{mode:0o600});
   await db.close();db=new PGlite({extensions,loadDataDir:archive});
   await exec("set timezone='UTC';set search_path=public,extensions");
   assert.deepEqual(await dataSnapshot(),coldData);
   results.backupRestore={status:'PASS',bytes:archive.size,productionBackup:false};
 });
 await check('After cold restore the old saved session still sees both bookings',async()=>{await asCustomer();const text=JSON.stringify(await snapshot());assert.ok(text.includes(oldBooking.id));assert.ok(text.includes(newBooking.id));});
 await check('Old cancellation API still cancels the new-client booking',async()=>{
   const response=(await row("select cancel_public_booking_request_or_group_v2('isolated-premium-salon',$1,'client@isolated.invalid','3331000001') r",[newBooking.id])).r;
   assert.ok(response);
   await exec('reset role');
   const status=await row('select status::text status from booking_requests where id=$1',[newBooking.id]);
   assert.equal(status.status,'cancelled');
 });
 await bridgeCompatibility();
}
function clientFixture(versionRoot){
 const file=fs.readFileSync(path.join(root,'work/customer-private-access-20261018/test-client.cjs'),'utf8');
 const prefix=file.slice(0,file.indexOf('const tests=[];'))+'\nexports.makeFixture=fixture;';
 const exports={};
 vm.runInNewContext(prefix,{exports,require:name=>name==='node:fs'?{...fs,readFileSync:(file,...args)=>fs.readFileSync(path.isAbsolute(file)?file:path.join(root,versionRoot,file),...args)}:require(name),Headers,URL,Request,Response,atob,btoa,Promise,Date,Map,Set,JSON,Error,setImmediate,console});
 return exports.makeFixture('ios');
}
async function bridgeCase(versionRoot){
 const f=clientFixture(versionRoot);
 const identity={salonCode:'isolated-premium-salon',email:'client@isolated.invalid',phone:'3331000001'};
 let issued=0;
 f.config.rpc=async(name,args)=>{
   if(name!=='create_customer_portal_session_v1')throw Error('Unexpected issuer '+name);
   issued++;
   await exec('reset role');
   try{return {data:(await row('select create_customer_portal_session_v1($1,$2,$3,$4) r',[args.p_salon_code,args.p_customer_email,args.p_customer_phone,args.p_customer_password])).r,error:null};}
   catch(error){return {data:null,error:{message:error.message,code:error.code}};}
 };
 await exec('reset role');
 const token=await f.api.ensureCustomerPortalSession(identity,'Fixture9!Password',true);
 await q("update customer_payment_sessions set expires_at=now()-interval '1 second' where token_hash=encode(extensions.digest($1,'sha256'),'hex')",[token]);
 const url='https://isolated.invalid/rest/v1/rpc/get_client_portal_snapshot';
 const init={method:'POST',headers:{Authorization:'Bearer x.'+btoa(JSON.stringify({role:'anon'}))+'.x'},body:JSON.stringify({p_salon_code:identity.salonCode})};
 const prepared=await f.transport.withCustomerPortalProof(url,init);
 const read=async request=>{
   await asCustomer();
   await q("select set_config('request.headers',$1,false)",[JSON.stringify({'x-salonpro-customer-token':new Headers(request.headers).get('x-salonpro-customer-token')})]);
   try{return new Response(JSON.stringify(await snapshot()),{status:200});}
   catch(error){return new Response(JSON.stringify({message:error.message,code:error.code}),{status:error.code==='PT403'?403:error.code==='42501'?401:400});}
   finally{await exec('reset role');}
 };
 const rejected=await read(prepared),status=rejected.status;
 const renewed=await f.transport.renewRejectedCustomerPortalProof(url,prepared,rejected);
 const recovered=renewed?await read(renewed):null;
 return {status,recovered:recovered?.status===200,issued,challenge:f.api.currentPortalAccessChallenge()?.kind??null};
}
async function bridgeCompatibility(){
 const cases=require(path.join(out,'legacy-contracts.json')).cases;
 results.legacyDatabaseBridge={before:[],after:[],adapter:'Actual retained transport + actual restored SQL; HTTP status mapped using PostgREST documented SQLSTATE mapping; no live HTTP server or remote calls.'};
 for(const item of cases)results.legacyDatabaseBridge.before.push({version:item.version,...await bridgeCase(item.source)});
 await exec('reset role');
 const beforeData=await dataSnapshot(),beforeFunctions=await definitions();
 await check('Candidate response-compatibility patch changes no data or authorization rules',async()=>{
   await exec(fs.readFileSync(path.join(out,'CANDIDATA-legacy-proof-status.sql'),'utf8'));
   assert.deepEqual(await dataSnapshot(),beforeData);
   const after=await definitions(),changed=after.filter(fn=>{
     const old=beforeFunctions.find(x=>x.schema===fn.schema&&x.name===fn.name&&x.args===fn.args);
     return old&&digest(old)!==digest(fn);
   });
   assert.equal(changed.length,3);
   for(const fn of changed){const old=beforeFunctions.find(x=>x.schema===fn.schema&&x.name===fn.name&&x.args===fn.args);assert.deepEqual({...fn,body:old.body},{...old});assert.equal(fn.body,old.body.replace("RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501'","RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='PT403'"));}
 });
 for(const item of cases)await check('Expired proof recovers with retained '+item.version+' client',async()=>{
   const result=await bridgeCase(item.source);results.legacyDatabaseBridge.after.push({version:item.version,...result});
   assert.equal(result.status,403);assert.equal(result.recovered,true);assert.equal(result.issued,2);assert.equal(result.challenge,null);
 });
 await exec('reset role');
 await fixtureCase('Privacy guards and owner/tenant isolation after compatibility patch','work/customer-private-access-20261018/test-server.sql');
}
async function guardedUpgradeTest(){
 await exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])");
 await q('insert into supabase_migrations.schema_migrations(version,name) select version,name from jsonb_to_recordset($1::jsonb) as x(version text,name text)',[JSON.stringify(source.migrationHistory)]);
 await exec("insert into salonpro_private.portal_read_protection(singleton,enabled) values(true,false)");
 await exec(fs.readFileSync(path.join(root,'scripts/premium-compatibility-fixture.sql'),'utf8'));
 const before=await dataSnapshot(),text=fs.readFileSync(path.join(out,'guarded-upgrade.sql'),'utf8');
 for(const [name,injection,expected] of [
   ['Data mutation aborts and rolls back the entire release',"update public.customers set full_name='Unexpected mutation' where id='30000000-0000-4000-8000-000000000001';",/existing_data_changed/],
   ['Unexpected security change aborts and rolls back the entire release','alter function public.get_client_portal_snapshot(text) security invoker;',/unexpected_existing_function_change/],
 ])await check(name,async()=>{
   await assert.rejects(()=>exec(text.replace('do $invariance$',injection+'\ndo $invariance$')),expected);
   await exec('rollback');assert.deepEqual(await dataSnapshot(),before);
   assert.equal((await row("select to_regclass('public.customer_badge_policies') exists")).exists,null);
 });
 await check('Exact guarded release transaction succeeds without changing saved data',async()=>{
   const output=await exec(text);
   results.guardedRelease=output.flatMap(x=>x.rows||[]).find(x=>x.premium_upgrade_result)?.premium_upgrade_result;
   assert.equal(results.guardedRelease.customerDataUnchanged,true);
   assert.deepEqual(await dataSnapshot(),before);
   assert.equal((await row('select count(*)::int n from supabase_migrations.schema_migrations')).n,source.migrationHistory.length+3);
 });
 for(const item of require(path.join(out,'legacy-contracts.json')).cases)await check('Guarded candidate recovers expired '+item.version+' proof',async()=>{
   const result=await bridgeCase(item.source);assert.equal(result.recovered,true);assert.equal(result.status,403);
 });
}
async function run(){
 try{
  await restore();
  if(process.argv.includes('--guarded')){
    await guardedUpgradeTest();
    fs.writeFileSync(path.join(out,'guarded-upgrade-isolated-results.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify({checks:results.checks,guardedRelease:results.guardedRelease}));return;
  }
  await reconcile();
  await exec("insert into salonpro_private.portal_read_protection(singleton,enabled) values(true,false)");
  for(const [label,file] of [
    ['baseline private portal and legacy history','work/customer-private-access-20261018/test-server.sql'],
    ['baseline package bookings and idempotency','scripts/test-owner-package-booking.sql'],
    ['baseline loyalty and package-covered services','scripts/test-loyalty-package-earning.sql'],
    ['baseline deposits, cancellation, phased and multi-operator bookings','scripts/test-booking-upfront-payment.sql'],
    ['baseline linked composition payment pricing','scripts/test-booking-composition-payment-pricing.sql'],
  ])await fixtureCase(label,file);
  await statefulUpgrade();
  results.baselineFunctionFingerprint=digest(await definitions());
  fs.writeFileSync(path.join(out,'isolated-compatibility-results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({restore:results.restore,reconciliation:results.reconciliation,checks:results.checks},null,2));
  if(results.checks.some(item=>item.status!=='PASS')||results.reconciliation.some(item=>item.error||item.changedFunctions?.length))process.exitCode=1;
 }catch(error){results.failure={phase,message:error.message,code:error.code};fs.writeFileSync(path.join(out,'isolated-compatibility-results.json'),JSON.stringify(results,null,2)+'\n');console.error(JSON.stringify(results.failure));process.exitCode=1;}
 finally{await db.close();}
}
run();
