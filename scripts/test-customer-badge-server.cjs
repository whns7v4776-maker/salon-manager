// Run against an isolated embedded PostgreSQL. Never connects to Supabase.
// PGLITE_MODULE may point to a temporary @electric-sql/pglite installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 grant usage on schema auth to authenticated;
 create table workspaces(id uuid primary key);
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table customers(id uuid primary key,workspace_id uuid);
 create table appointment_groups(id uuid primary key,workspace_id uuid,status text);
 create table booking_requests(id uuid primary key,workspace_id uuid,customer_id uuid,appointment_group_id uuid,appointment_date date,status text,cancellation_source text);
 create table appointments(id uuid primary key,workspace_id uuid,customer_id uuid,appointment_group_id uuid,booking_request_id uuid,appointment_date date,completed boolean,no_show boolean,price numeric);
 create table appointment_payment_revisions(appointment_id uuid primary key,workspace_id uuid,paid_cents bigint);
 create function appointment_revision_payment_state(p uuid) returns jsonb language sql stable as $$ select jsonb_build_object('paidCents',paid_cents) from appointment_payment_revisions where appointment_id=p $$;
 create table booking_payment_orders(request_id uuid primary key,workspace_id uuid,appointment_id uuid,paid_cents bigint);
 create function booking_payment_paid_cents(p uuid) returns bigint language sql stable as $$ select paid_cents from booking_payment_orders where request_id=p $$;
 create table cash_movements(id uuid primary key,workspace_id uuid,appointment_id uuid,payment_method text,booking_voided boolean default false,amount numeric);
 create table cash_stripe_payments(id uuid primary key,workspace_id uuid,movement_id uuid,status text,amount_cents bigint,refunded_cents bigint);
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261023190000_owner_customer_premium_badge.sql'),'utf8'));
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const w=id(1),other=id(2),owner=id(3),customer=id(4),foreignCustomer=id(5);
 await db.query('insert into workspaces values ($1),($2)',[w,other]);
 await db.query("insert into workspace_members values ($1,$2,'owner')",[w,owner]);
 await db.query('insert into customers values ($1,$2),($3,$4)',[customer,w,foreignCustomer,other]);
 await db.query("select set_config('test.user',$1,false)",[owner]);
 const summary=async()=> (await db.query('select get_owner_customer_badge_summary($1) as value',[w])).rows[0].value;
 const save=async(config,enabled=true)=> (await db.query('select set_owner_customer_badge_policy($1,$2,$3::jsonb) as value',[w,enabled,JSON.stringify(config)])).rows[0].value;
 const reject=async(fn,pattern)=>{let rejected=false;try{await fn();}catch(e){rejected=true;assert.match(String(e.message),pattern);}assert.ok(rejected,'expected PostgreSQL rejection');};
 let initial=await summary();assert.equal(initial.enabled,false);assert.equal(initial.customers[0].tier,null);
 const group=async n=>{await db.query("insert into appointment_groups values($1,$2,'active')",[id(n),w]);return id(n);};
 let seq=100;
 const appointment=async({group=null,done=true,noShow=false,price=100,date='today',request=null,workspace=w,who=customer,paid=price}={})=>{
  const a=id(seq++),m=id(seq++);
  await db.query('insert into appointments values($1,$2,$3,$4,$5,$6::date,$7,$8,$9)',[a,workspace,who,group,request,date,done,noShow,price]);
  if(paid!==null)await db.query("insert into cash_movements values($1,$2,$3,'cash',false,$4)",[m,workspace,a,paid]);
  return {a,m};
 };
 const request=async({group=null,status='cancelled',source='cliente'}={})=>{
  const r=id(seq++);await db.query('insert into booking_requests values($1,$2,$3,$4,current_date,$5,$6)',[r,w,customer,group,status,source]);return r;
 };
 await appointment();
 const linked=await group(20);await appointment({group:linked,price:50});await appointment({group:linked,price:50});
 const partial=await group(21);await appointment({group:partial,price:30});const unfinished=await appointment({group:partial,done:false,price:30});
 await appointment({done:false,noShow:true,paid:null});
 const cancelledGroup=await group(22);const r1=await request({group:cancelledGroup});await request({group:cancelledGroup});await appointment({request:r1,price:300});
 const salonCancelled=await request({source:'salone'});await appointment({request:salonCancelled,price:300});
 await appointment({price:500,paid:null});
 const refunded=await appointment({price:100});await db.query("insert into cash_stripe_payments values($1,$2,$3,'paid',10000,2000)",[id(seq++),w,refunded.m]);
 const pending=await appointment({price:100});await db.query("insert into cash_stripe_payments values($1,$2,$3,'pending',10000,0)",[id(seq++),w,pending.m]);
 const revised=await appointment({price:150});await db.query('insert into appointment_payment_revisions values($1,$2,7000)',[revised.a,w]);
 const online=await appointment({price:120});const onlineRequest=await request({status:'accepted'});await db.query('insert into booking_payment_orders values($1,$2,$3,6000)',[onlineRequest,w,online.a]);
 await appointment({date:'2099-01-01'});await appointment({date:'2020-01-01'});
 await appointment({workspace:other,who:foreignCustomer,price:90000});
 let config=initial.config;
 config.tiers[0]={...config.tiers[0],visits:2};config.tiers[1]={...config.tiers[1],visits:5,spendCents:40000};config.tiers[2]={...config.tiers[2],visits:7,spendCents:45000};
 config.cancellationThreshold=1;config.noShowThreshold=1;
 let result=await save(config),row=result.customers[0];
 assert.equal(result.customers.length,1);assert.equal(row.completedVisits,7);assert.equal(row.spentCents,41000);assert.equal(row.cancellations,1);assert.equal(row.noShows,1);assert.equal(row.tier,'premium');assert.equal(row.cancellationAlert,true);assert.equal(row.noShowAlert,true);
 await db.query('update cash_stripe_payments set refunded_cents=8000 where movement_id=$1',[refunded.m]);
 row=(await summary()).customers[0];assert.equal(row.spentCents,35000);assert.equal(row.tier,'frequente');
 await db.query('update cash_stripe_payments set refunded_cents=2000 where movement_id=$1',[refunded.m]);
 await db.query('update appointments set completed=true where id=$1',[unfinished.a]);
 row=(await summary()).customers[0];assert.equal(row.completedVisits,8);assert.equal(row.spentCents,47000);assert.equal(row.tier,'top_premium');
 // Server recalculates a lower tier after undoing completion; no stale badge.
 await db.query('update appointments set completed=false where id=$1',[unfinished.a]);assert.equal((await summary()).customers[0].tier,'premium');
 const allTime=structuredClone(config);allTime.windowMonths=0;assert.equal((await save(allTime)).customers[0].completedVisits,8);
 const disabled=await save(config,false);assert.equal(disabled.customers[0].tier,null);assert.equal(disabled.customers[0].cancellationAlert,false);
 for(const mode of ['visits','spend','both','either','bookings']){
  const policy=structuredClone(config);policy.tiers.forEach(t=>{t.mode=mode;t.visits=999;t.bookings=999;t.spendCents=99999999;});
  assert.equal((await save(policy)).customers[0].tier,'standard');
 }
 for(const patch of [{windowMonths:1},{noShowThreshold:0},{cancellationThreshold:-1},{tiers:[]}])await reject(()=>save({...config,...patch}),/invalid_badge_policy/);
 const bad=structuredClone(config);bad.tiers[0].spendCents=1.5;await reject(()=>save(bad),/invalid_badge_policy/);
 await reject(()=>db.query('select get_owner_customer_badge_summary($1)',[other]),/owner_required/);
 await reject(()=>db.query('select set_owner_customer_badge_policy($1,true,$2::jsonb)',[other,JSON.stringify(config)]),/owner_required/);
 await db.exec('grant select on workspace_members to authenticated;set role authenticated');
 assert.equal((await db.query('select count(*)::int as n from customer_badge_policies')).rows[0].n,1);
 await reject(()=>db.query("update customer_badge_policies set enabled=true"),/permission denied/);
 await db.exec('reset role');
 await db.query("select set_config('test.user','',false)");await reject(summary,/owner_required/);
 assert.equal((await db.query("select has_function_privilege('anon','get_owner_customer_badge_summary(uuid)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','set_owner_customer_badge_policy(uuid,boolean,jsonb)','execute') as allowed")).rows[0].allowed,false);
 console.log('PASS: PostgreSQL migration, grouped/partial visits, actual net receipts/refunds, unpaid/pending/future exclusions, tier transitions, disable, all five criteria, period, cancellation actor, tenant boundaries, invalid settings, RPC permissions and RLS.');
 await db.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
