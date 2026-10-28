// Disposable in-memory PostgreSQL tests. Business RPC bodies come from the
// migrations; availability and push delivery are intentionally isolated stubs.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = require(modulePath);
const { citext } = require(modulePath + '/dist/contrib/citext.cjs');
const { pgcrypto } = require(modulePath + '/dist/contrib/pgcrypto.cjs');
const admission = 'supabase/migrations/20261009130000_customer_registration_approval.sql';
const readonlyGate = 'supabase/migrations/20261009134500_registration_payment_readonly.sql';
const waitlistGate = 'supabase/migrations/20261009210000_customer_registration_waitlist_gate.sql';
function routine(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const match = new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?' + name + '\\s*\\(', 'i').exec(source);
  assert.ok(match, name + ' exists in actual migration');
  const tail = source.slice(match.index);
  const tag = /\bas\s+(\$[\w]*\$)/i.exec(tail);
  assert.ok(tag, name + ' has SQL body');
  const end = tail.indexOf(tag[1], tag.index + tag[0].length) + tag[1].length;
  return tail.slice(0, end) + ';';
}
const w = '11111111-1111-4111-8111-111111111111';
const other = '11111111-1111-4111-8111-111111111112';
const owner = '99999999-9999-4999-8999-999999999999';
const results = [];
(async () => {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  try {
    const q = (sql, params = []) => db.query(sql, params);
    const row = async (sql, params = []) => (await q(sql, params)).rows[0];
    const check = async (name, run) => { await run(); results.push(name); };
    const fails = (sql, params, error) => assert.rejects(q(sql, params), error);
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions; create extension citext; create extension pgcrypto with schema extensions;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('audit.owner',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('audit.role',true)$$;
      create function current_workspace_id() returns uuid language sql stable as $$select nullif(current_setting('audit.workspace',true),'')::uuid$$;
      create function workspace_access_allowed() returns boolean language sql stable as $$select coalesce(current_setting('audit.access',true),'true')<>'false'$$;
      create table workspaces(id uuid primary key, slug text, is_internal_tester boolean, subscription_status text);
      create table client_portals(workspace_id uuid primary key, availability_settings jsonb default '{}', clienti jsonb default '[]');
      create table owner_app_snapshots(workspace_id uuid primary key, payload jsonb default '{}');
      create table customers(id uuid primary key default gen_random_uuid(),workspace_id uuid,full_name text,email citext,phone text,source text default 'salon',registration_status text default 'approved',viewed_by_salon boolean default false,is_active boolean default true,updated_at timestamptz default now(),created_at timestamptz default now());
      create table customer_registration_rejections(workspace_id uuid, customer_id uuid, primary key(workspace_id,customer_id));
      create table customer_deletion_tombstones(workspace_id uuid,customer_id uuid,normalized_name text);
      create table customer_login_credentials(customer_id uuid references customers(id) on delete cascade,password_hash text);
      create table customer_payment_sessions(token_hash text,customer_id uuid references customers(id) on delete cascade,credential_hash text,expires_at timestamptz);
      create table customer_benefit_notifications(workspace_id uuid,customer_id uuid references customers(id),title text);
      create table isolated_push_calls(workspace_id uuid,title text,payload jsonb);
      create function queue_public_customer_push(uuid,text,text,text,jsonb,citext,text) returns void language sql as $$insert into isolated_push_calls values($1,$3,$5)$$;
      create function resolve_booking_payment_policy(uuid,uuid) returns jsonb language sql stable as $$select '{"mode":"salon"}'::jsonb$$;
      create table appointments(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid references customers(id));
      create table appointment_groups(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid references customers(id));
      create table booking_requests(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid references customers(id),customer_email citext,customer_phone text,origin text,status text,requested_service_name text,appointment_date date,appointment_time time,viewed_by_salon boolean);
      create table future_business_ledger(customer_id uuid references customers(id) on delete cascade,amount integer);
      create table booking_slot_waitlist(id uuid primary key default gen_random_uuid(),workspace_id uuid,appointment_date date,appointment_time time,requested_service_name text,requested_duration_minutes integer,requested_operator_id text,requested_operator_name text,customer_name text,customer_surname text,customer_email citext,customer_phone text,customer_instagram text,notes text,status text,notified_at timestamptz,expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),booking_plan jsonb,range_available_times jsonb,range_resolved boolean);
      create function is_waitlist_plan_available_v1(booking_slot_waitlist) returns boolean language sql as $$select coalesce(current_setting('audit.slot_available',true),'false')='true'$$;
      create function is_public_booking_slot_available(uuid,date,time,integer,text,text,text) returns boolean language sql as $$select coalesce(current_setting('audit.slot_available',true),'false')='true'$$;
      create function waitlist_range_available_times_v1(booking_slot_waitlist) returns jsonb language sql as $$select '[]'::jsonb$$;`);
    await db.exec(`alter table workspaces add column owner_email text,add column salon_name text,add column auto_accept_booking_requests boolean default true;
      alter table customers add column instagram text,add column note text,add column max_future_appointments integer,add column max_future_appointments_mode text,add column max_daily_appointments integer;
      create table email_otp_verifications(email citext,purpose text,salon_code text,consumed_at timestamptz);
      create table isolated_owner_push_calls(workspace_id uuid,title text,payload jsonb);
      create table customer_online_booking_policies(workspace_id uuid,customer_id uuid unique references customers(id) on delete cascade,acceptance_mode text);
      create function ensure_client_portal_workspace(text) returns uuid language sql as $$select id from workspaces where slug=lower(trim($1))$$;
      create function resolve_public_portal_availability_settings(uuid) returns jsonb language sql stable as $$select availability_settings from client_portals where workspace_id=$1$$;
      create function check_public_customer_registration_duplicate(text,text,text) returns jsonb language sql stable as $$select jsonb_build_object('emailTaken',exists(select 1 from customers c join workspaces w on w.id=c.workspace_id where w.slug=lower(trim($1)) and lower(trim(c.email::text))=lower(trim($2))),'phoneTaken',exists(select 1 from customers c join workspaces w on w.id=c.workspace_id where w.slug=lower(trim($1)) and right(regexp_replace(c.phone,'\\D+','','g'),10)=right(regexp_replace($3,'\\D+','','g'),10)))$$;
      create function sync_client_portal_customers(uuid) returns void language plpgsql as $$begin return;end$$;
      create function queue_public_owner_push(uuid,text,text,text,jsonb) returns void language sql as $$insert into isolated_owner_push_calls values($1,$3,$5)$$;`);
    await q("select set_config('audit.workspace',$1,false),set_config('audit.owner',$2,false),set_config('audit.role','authenticated',false)",[w,owner]);
    await q("insert into workspaces(id,slug,is_internal_tester,subscription_status) values($1,'audit',true,'active'),($2,'elsewhere',true,'active')",[w,other]);
    for (const workspace of [w,other]) {
      await q("insert into client_portals values($1,'{\"unrelatedSetting\":17}','[]')",[workspace]);
      await q("insert into owner_app_snapshots values($1,'{\"availabilitySettings\":{\"unrelatedSetting\":17},\"clienti\":[]}')",[workspace]);
    }
    for (const name of ['merge_customer_registration_settings_v1','protect_owner_customer_registration_settings_v1','protect_portal_customer_registration_settings_v1','set_customer_registration_approval_v1','classify_new_frontend_customer_registration_v1','preserve_customer_registration_decision_v1','keep_pending_customer_registration_unread_v1','get_public_customer_registration_status_v1','overlay_customer_registration_status_v1','filter_deleted_snapshot_customers','booking_payment_customer_context','decide_customer_registration']) await db.exec(routine(admission,name));
    await db.exec(fs.readFileSync(readonlyGate,'utf8'));
    await db.exec(`create trigger registration_settings_snapshot before insert or update of payload on owner_app_snapshots for each row execute function protect_owner_customer_registration_settings_v1();
      create trigger registration_settings_portal before insert or update of availability_settings on client_portals for each row execute function protect_portal_customer_registration_settings_v1();
      create trigger aa_registration_classify before insert on customers for each row execute function classify_new_frontend_customer_registration_v1();
      create trigger ab_registration_preserve before update of registration_status on customers for each row execute function preserve_customer_registration_decision_v1();
      create trigger registration_unread before insert or update of registration_status,viewed_by_salon on customers for each row execute function keep_pending_customer_registration_unread_v1();
      create trigger registration_booking before insert or update on booking_requests for each row execute function enforce_customer_registration_booking_v1();`);
    await db.exec(routine('supabase/migrations/20260930223000_customer_payment_sessions.sql','verified_booking_payment_context'));
    await db.exec(routine('supabase/migrations/20260813113000_customer_online_booking_policies.sql','resolve_customer_online_auto_accept_v1'));
    for (const name of ['register_public_customer_legacy_impl','register_public_customer_with_password']) await db.exec(routine(admission,name));
    for (const [file,name] of [
      ['supabase/migrations/20261002010000_shop_pickup_orders.sql','customer_shop_state'],
      ['supabase/migrations/20261001220000_benefit_notifications.sql','customer_benefits_wallet'],
      ['supabase/migrations/20261001190000_customer_service_packages.sql','customer_package_wallet'],
    ]) await db.exec(routine(file,name));
    await db.exec(fs.readFileSync(waitlistGate,'utf8'));
    const add = async (status, workspace=w, source='salon', email) => {
      const id = (await row('select gen_random_uuid() id')).id;
      await q('insert into customers(id,workspace_id,full_name,email,phone,source,registration_status) values($1,$2,$3,$4,$5,$6,$7)',[id,workspace,'Cliente Audit',email || id+'@example.invalid','3331234567',source,status]);
      return {id,workspace,email:email||id+'@example.invalid',phone:'3331234567',code:workspace===w?'audit':'elsewhere'};
    };
    const setRequired = async required => (await row('select set_customer_registration_approval_v1($1) r',[required])).r;
    const gate = (name,c) => q('select '+name+'($1,$2,$3)',[c.workspace,c.email,c.phone]);
    const wait = (version,c,time='10:00',plan={version:1}) => {
      const args=[c.code,'Taglio',30,'2026-12-20',time,'Cliente','Audit',c.email,c.phone,null,null,null,null];
      return row('select '+(version===2?'join_public_slot_waitlist_v2':'join_public_slot_waitlist')+'('+args.map((_,i)=>'$'+(i+1)).join(',')+(version===2?',$14':'')+') r',version===2?[...args,plan]:args).then(r=>r.r);
    };
    const decide = (id,value) => row('select decide_customer_registration($1,$2) r',[id,value]).then(r=>r.r);
    for (const required of [false,true]) {
      await setRequired(required);
      for (const status of ['approved','pending']) {
        const c=await add(status);
        const suffix=status+'/'+required;
        for (const name of ['assert_customer_registration_approved_v1','assert_customer_registration_approved_for_write_v1']) await check(name+' '+suffix,async()=>status==='pending'?assert.rejects(gate(name,c),/customer_registration_pending/):gate(name,c));
        await check('payment context '+suffix,async()=>status==='pending'?fails('select booking_payment_customer_context($1,$2,$3)',[c.code,c.email,c.phone],/customer_registration_pending/):assert.equal((await row('select booking_payment_customer_context($1,$2,$3) r',[c.code,c.email,c.phone])).r.customerId,c.id));
        await q("insert into customer_login_credentials values($1,'fixture')",[c.id]);
        await q("insert into customer_payment_sessions values(encode(extensions.digest(repeat('a',64),'sha256'),'hex'),$1,'fixture',now()+interval '1 hour')",[c.id]);
        await check('verified token '+suffix,async()=>status==='pending'?fails('select verified_booking_payment_context($1,$2,$3,$4)',[c.code,c.email,c.phone,'a'.repeat(64)],/customer_registration_pending/):assert.equal((await row('select verified_booking_payment_context($1,$2,$3,$4) r',[c.code,c.email,c.phone,'a'.repeat(64)])).r.customerId,c.id));
        if (status==='pending') for (const rpc of ['customer_shop_state','customer_benefits_wallet','customer_package_wallet']) await check(rpc+' pending/'+required,()=>fails('select '+rpc+'($1,$2,$3,$4)',[c.code,c.email,c.phone,'a'.repeat(64)],/customer_registration_pending/));
        for (const version of [1,2]) await check('waitlist v'+version+' '+suffix,async()=>status==='pending'?assert.rejects(wait(version,c),/customer_registration_pending/):assert.equal((await wait(version,c,version===1?'10:00':'11:00')).status,'waiting'));
        await db.exec('begin read only');
        try {await check('PostgREST read-only admission '+suffix,async()=>status==='pending'?assert.rejects(gate('assert_customer_registration_approved_v1',c),/customer_registration_pending/):gate('assert_customer_registration_approved_v1',c));} finally {await db.exec('rollback');}
      }
      const unknown={workspace:w,email:'unknown@example.invalid',phone:'3339000000',code:'audit'};
      await check('unknown admission '+required,async()=>required?assert.rejects(gate('assert_customer_registration_approved_for_write_v1',unknown),/customer_registration_required/):gate('assert_customer_registration_approved_for_write_v1',unknown));
      await check('unknown waitlist '+required,async()=>required?assert.rejects(wait(2,unknown),/customer_registration_required/):assert.equal((await wait(2,unknown)).status,'waiting'));
      const settings=(await row('select availability_settings s from client_portals where workspace_id=$1',[w])).s;
      await check('admission setting does not change booking autoaccept '+required,async()=>{assert.equal((await row('select auto_accept_booking_requests a from workspaces where id=$1',[w])).a,true);assert.equal(settings.unrelatedSetting,17);});
    }
    const approved=await add('approved'); const pending=await add('pending');
    for (const required of [false,true]) {
      await setRequired(required);
      for (const salonAuto of [false,true]) {
        await q('update workspaces set auto_accept_booking_requests=$1 where id=$2',[salonAuto,w]);
        for (const mode of ['inherit','auto','manual']) for (const [status,c] of [['approved',approved],['pending',pending]]) {
          await q('insert into customer_online_booking_policies values($1,$2,$3) on conflict(customer_id) do update set acceptance_mode=excluded.acceptance_mode',[w,c.id,mode]);
          await check('admission/autoaccept independence '+[required,salonAuto,mode,status].join('/'),async()=>{
            assert.equal((await row('select resolve_customer_online_auto_accept_v1($1,$2) a',[w,c.id])).a,mode==='auto'||(mode==='inherit'&&salonAuto));
            if(status==='pending')await assert.rejects(gate('assert_customer_registration_approved_for_write_v1',c),/customer_registration_pending/);
            else await gate('assert_customer_registration_approved_for_write_v1',c);
          });
        }
      }
    }
    await setRequired(false);
    for (const version of [1,2]) {
      const result=await wait(version,approved,version===1?'12:00':'13:00');
      await check('waitlist repeat v'+version,async()=>{const replay=await wait(version,approved,version===1?'12:00':'13:00');assert.equal(replay.alreadyJoined,true);assert.equal(replay.waitlistEntryId,result.waitlistEntryId);});
      await q('update booking_slot_waitlist set status=\'cancelled\' where id=$1',[result.waitlistEntryId]);
      await check('waitlist reopen v'+version,async()=>assert.equal((await wait(version,approved,version===1?'12:00':'13:00')).waitlistEntryId,result.waitlistEntryId));
      await q("select set_config('audit.slot_available','true',false)");
      await check('already-available branch still blocks pending v'+version,()=>assert.rejects(wait(version,pending),/customer_registration_pending/));
      await check('already-available branch approved v'+version,async()=>assert.equal((await wait(version,approved,version===1?'14:00':'15:00')).status,'available'));
      await q("select set_config('audit.slot_available','false',false)");
    }
    await check('range plan pending gate',()=>assert.rejects(wait(2,pending,'18:00',{version:1,range:{key:'day',startMinute:540,endMinute:1080,stepMinutes:30}}),/customer_registration_pending/));
    await check('range plan approved preserved',async()=>assert.equal((await wait(2,approved,'18:00',{version:1,range:{key:'day',startMinute:540,endMinute:1080,stepMinutes:30}})).status,'waiting'));
    await setRequired(true);
    await q("select set_config('audit.role','anon',false),set_config('audit.owner','',false)");
    const frontend=await add('approved',w,'frontend');
    await check('new frontend moderated registration classified pending',async()=>assert.equal((await row('select registration_status s from customers where id=$1',[frontend.id])).s,'pending'));
    await check('anonymous decision denied',()=>assert.rejects(decide(frontend.id,'approved'),/owner_session_required/));
    await q("select set_config('audit.role','authenticated',false),set_config('audit.owner',$1,false)",[owner]);
    const ownerCreated=await add('approved',w,'frontend');
    await check('owner-created customer stays approved',async()=>assert.equal((await row('select registration_status s from customers where id=$1',[ownerCreated.id])).s,'approved'));
    await q('update customers set registration_status=\'approved\',viewed_by_salon=true where id=$1',[frontend.id]);
    await check('stale full upsert cannot approve pending',async()=>{const r=await row('select registration_status s,viewed_by_salon v from customers where id=$1',[frontend.id]);assert.equal(r.s,'pending');assert.equal(r.v,false);});
    await check('owner approval',async()=>assert.equal((await decide(frontend.id,'approved')).replayed,false));
    await check('owner approval retry is idempotent',async()=>{assert.equal((await decide(frontend.id,'approved')).replayed,true);assert.equal((await row('select count(*)::int n from isolated_push_calls')).n,1);});
    await q('update customers set registration_status=\'pending\' where id=$1',[frontend.id]);
    await check('approved customer cannot be downgraded by stale snapshot',async()=>assert.equal((await row('select registration_status s from customers where id=$1',[frontend.id])).s,'approved'));
    await check('approved customer rejection denied',()=>assert.rejects(decide(frontend.id,'rejected'),/customer_registration_not_pending/));
    await check('invalid owner decision denied',()=>assert.rejects(decide(pending.id,'approve'),/customer_registration_decision_invalid/));
    await check('null customer denied',()=>assert.rejects(decide(null,'approved'),/customer_id_invalid/));
    const elsewhere=await add('pending',other);
    await check('other salon decision denied',()=>assert.rejects(decide(elsewhere.id,'approved'),/customer_not_found/));
    await q("select set_config('audit.access','false',false)");
    await check('owner without workspace access denied',()=>assert.rejects(decide(pending.id,'approved'),/workspace_access_denied/));
    await q("select set_config('audit.access','true',false)");
    const rejectable=await add('pending');
    await q("insert into customer_login_credentials values($1,'fixture')",[rejectable.id]);
    await q("insert into customer_payment_sessions values('fixture',$1,'fixture',now()+interval '1 hour')",[rejectable.id]);
    await check('pending rejection succeeds',async()=>assert.equal((await decide(rejectable.id,'rejected')).decision,'rejected'));
    await check('rejection removes only scoped credentials and customer',async()=>{assert.equal((await row('select count(*)::int n from customers where id=$1',[rejectable.id])).n,0);assert.equal((await row('select count(*)::int n from customer_payment_sessions where customer_id=$1',[rejectable.id])).n,0);assert.equal((await row('select count(*)::int n from customers where id=$1',[elsewhere.id])).n,1);});
    await check('rejection retry is idempotent',async()=>assert.equal((await decide(rejectable.id,'rejected')).replayed,true));
    await check('rejected identity reports removed',async()=>assert.equal((await row('select get_public_customer_registration_status_v1($1,$2,$3) r',[rejectable.code,rejectable.email,rejectable.phone])).r.found,false));
    await check('rejected identity cannot join moderated waitlist',()=>assert.rejects(wait(2,rejectable),/customer_registration_required/));
    const business=await add('pending');
    await q('insert into future_business_ledger values($1,25)',[business.id]);
    await check('future cascade business ledger prevents rejection',()=>assert.rejects(decide(business.id,'rejected'),/pending_customer_has_history/));
    await check('rejection failure preserves ledger',async()=>assert.equal((await row('select count(*)::int n from future_business_ledger where customer_id=$1',[business.id])).n,1));
    const booked=await add('pending'); await q('insert into appointments(workspace_id,customer_id) values($1,$2)',[w,booked.id]);
    await check('owner appointment prevents destructive pending rejection',()=>assert.rejects(decide(booked.id,'rejected'),/pending_customer_has_history/));
    const insertBooking=c=>q("insert into booking_requests(workspace_id,customer_id,customer_email,customer_phone,origin,status,requested_service_name,appointment_date,appointment_time) values($1,$2,$3,$4,'frontend','pending','Taglio','2026-12-20','16:00') returning id",[c.workspace,c.id,c.email,c.phone]);
    await check('pending cannot create frontend booking',()=>assert.rejects(insertBooking(pending),/customer_registration_pending/));
    await check('pending customer ID blocks mismatched contacts',()=>assert.rejects(insertBooking({...pending,email:approved.email,phone:approved.phone}),/customer_registration_pending/));
    await check('approved creates frontend booking',async()=>assert.equal((await insertBooking(approved)).rows.length,1));
    await db.exec('alter table booking_requests disable trigger registration_booking');
    const historical=(await insertBooking(pending)).rows[0].id;
    await db.exec('alter table booking_requests enable trigger registration_booking');
    await check('read marker does not invoke admission lock',()=>q('update booking_requests set viewed_by_salon=true where id=$1',[historical]));
    await check('pending rescheduling remains denied',()=>fails('update booking_requests set appointment_time=\'17:00\' where id=$1',[historical],/customer_registration_pending/));
    await check('pending cancellation remains allowed',()=>q("update booking_requests set status='cancelled' where id=$1",[historical]));
    await check('new waitlist RPC remains granted to frontend roles',async()=>{for(const role of ['anon','authenticated'])assert.equal((await row("select has_function_privilege($1,'public.join_public_slot_waitlist_v2(text,text,integer,date,time,text,text,citext,text,text,text,text,text,jsonb)','execute') ok",[role])).ok,true);});
    let phone=3338000000;
    const signup = (email,code='audit',password='Audit-Only123!')=>row('select register_public_customer_with_password($1,$2,$3,$4,$5,$6) r',[code,'Cliente Registrazione',String(phone),email,null,password]).then(r=>r.r);
    const otp = email=>q("insert into email_otp_verifications values($1,'client_registration','audit',now())",[email]);
    for (const required of [false,true]) {
      await setRequired(required);
      await q("select set_config('audit.role','anon',false),set_config('audit.owner','',false)");
      const email='signup-'+required+'@example.invalid'; await otp(email);phone++;
      let registered;
      await check('real signup RPC classifies admission '+required,async()=>{registered=await signup(email);assert.equal(registered.registrationStatus,required?'pending':'approved');assert.ok(registered.customerId);assert.equal(registered.ownerNotificationQueued,true);});
      await check('real signup stores password only as hash '+required,async()=>{const stored=await row('select password_hash h from customer_login_credentials where customer_id=$1',[registered.customerId]);assert.notEqual(stored.h,'Audit-Only123!');assert.equal((await row("select extensions.crypt('Audit-Only123!',$1)=$1 ok",[stored.h])).ok,true);});
      const pushes=(await row('select count(*)::int n from isolated_owner_push_calls')).n;
      await check('real signup duplicate retry does not create another client or notification '+required,async()=>{await assert.rejects(signup(email),/duplicate_email_phone/);assert.equal((await row('select count(*)::int n from isolated_owner_push_calls')).n,pushes);});
      phone++;
      await check('real signup requires salon-scoped recent OTP '+required,()=>assert.rejects(signup('no-otp-'+required+'@example.invalid'),/customer_email_not_verified/));
      await q("select set_config('audit.role','authenticated',false),set_config('audit.owner',$1,false)",[owner]);
    }
    await check('real signup rejects weak password before account creation',()=>assert.rejects(signup('weak@example.invalid','audit','weak'),/customer_password_weak/));
    const signupPending=(await row("select id,email from customers where email='signup-true@example.invalid'"));
    await decide(signupPending.id,'rejected');
    await q("select set_config('audit.role','anon',false),set_config('audit.owner','',false)");
    phone--;
    await check('rejected customer can legitimately register again with new UUID and OTP',async()=>{const fresh=await signup(signupPending.email);assert.notEqual(fresh.customerId,signupPending.id);assert.equal(fresh.registrationStatus,'pending');});
    for (const rpc of ['customer_shop_state','customer_benefits_wallet','customer_package_wallet']) await check(rpc+' refuses removed payment identity',()=>fails('select '+rpc+'($1,$2,$3,$4)',['audit',rejectable.email,rejectable.phone,'a'.repeat(64)],/Verifica la password/));
    console.log(JSON.stringify({passed:results.length,failed:0,checks:results,limitations:['In-memory PGlite serializes operations; this does not prove concurrent lock scheduling in remote PostgreSQL.','Availability predicates, push delivery and payment policy resolution are fixture stubs.','No remote migration, real account, email, push, checkout or device flow executed.']},null,2));
  } finally {await db.close();}
})().catch(error=>{console.error(error);console.error('Passed before failure: '+results.length);process.exitCode=1;});
