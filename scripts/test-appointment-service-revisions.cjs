const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const { pgcrypto } = require((process.env.PGLITE_MODULE || '@electric-sql/pglite') + '/dist/contrib/pgcrypto.cjs');
 const db = new PGlite({extensions:{pgcrypto}});
 const w='11111111-1111-4111-8111-111111111111', other='11111111-1111-4111-8111-111111111112';
 const customer='22222222-2222-4222-8222-222222222222';
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table workspaces(id uuid primary key,slug text,subscription_status text);
 create table customers(id uuid primary key,workspace_id uuid,email text,phone text,is_active boolean default true);
 create table booking_requests(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid,requested_price numeric,origin text,status text,customer_email text,customer_phone text);
 create table appointments(id uuid primary key default gen_random_uuid(),workspace_id uuid,booking_request_id uuid,customer_id uuid,no_show boolean default false,cashed_in boolean default false,price numeric,service_name text,customer_name text,updated_at timestamptz);
 create table cash_movements(id uuid primary key default gen_random_uuid(),workspace_id uuid,appointment_id uuid unique references appointments(id) on delete set null,description text,amount numeric,payment_method text,card_label text,updated_at timestamptz);
 create function current_workspace_id() returns uuid language sql as $$ select '${w}'::uuid $$;
 create function workspace_access_allowed() returns boolean language sql as $$ select true $$;
 create function touch_cash_sync_revision() returns trigger language plpgsql as $$ begin return new; end $$;
 insert into workspaces values('${w}','tester','active'),('${other}','other','active');
 insert into customers(id,workspace_id,email,phone) values('${customer}','${w}','client@example.test','333 1234567');`);
 for(const name of ['20260925160000_cash_stripe','20260925160100_cash_stripe_validation','20260927211000_cash_stripe_modes','20260927233000_cash_appointment_checkout','20260927235000_cash_payment_receipt_email','20260927235900_cash_payment_appointment_guard','20260928010000_cash_terminal','20260930140000_booking_payment_policies','20260930141000_booking_payment_ledger']) {
   await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
 }
 await db.exec(`create domain citext as text; create type push_event_type as enum ('booking_request_created','booking_request_status_changed','appointment_cancelled','custom');
 create table test_payment_pushes(payload jsonb,body text);
 create function queue_public_customer_push(uuid,push_event_type,text,text,jsonb,citext,text) returns integer language plpgsql as $$
 begin insert into test_payment_pushes values($5,$4); return 1; end $$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260930170000_booking_payment_notices.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260930183000_appointment_service_revisions.sql','utf8').split('create function public.get_owner_appointment_revision_v1')[0]);
 const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
 await db.exec(`insert into cash_stripe_accounts(workspace_id,account_id,livemode)values('${w}','acct_test',false);`);
 const save=(who,mode,percent,revision)=>scalar('select save_booking_payment_policy($1,$2,$3,$4,$5)',[w,who,mode,percent,revision]);
 const resolve=()=>scalar('select resolve_booking_payment_policy($1,$2)',[w,customer]);
 assert.deepEqual(await resolve(),{mode:'salon',percent:0});
 await assert.rejects(save(null,'deposit',101,0),/non valida/);
 await assert.rejects(save(null,'deposit',null,0),/non valida/);
 await save(null,'deposit',30,0);
 await assert.rejects(save(null,'full',100,0),/altro dispositivo/);
 assert.deepEqual(await resolve(),{mode:'deposit',percent:30});
 await save(customer,'salon',0,0);
 assert.deepEqual(await resolve(),{mode:'salon',percent:0});
 await save(customer,'inherit',0,1);
 assert.deepEqual(await resolve(),{mode:'deposit',percent:30});
 await assert.rejects(save(customer,'full',100,1),/altro dispositivo/);
 await assert.rejects(scalar('select save_booking_payment_policy($1,$2,$3,$4,$5)',[other,customer,'full',100,0]),/Cliente/);
 const context=await scalar('select booking_payment_customer_context($1,$2,$3)',['tester','CLIENT@example.test','3331234567']);
 assert.equal(context.customerId,customer);
 assert.equal(await scalar('select booking_payment_customer_context($1,$2,$3)',['other','client@example.test','3331234567']),null);
 assert.equal(await scalar('select booking_payment_customer_context($1,$2,$3)',['tester','client@example.test','']),null);
 async function booking(price,status='accepted',origin='frontend') {
  const r=await scalar('insert into booking_requests(workspace_id,customer_id,requested_price,origin,status,customer_email) values($1,$2,$3,$4,$5,$6) returning id',[w,customer,price,origin,status,'client@example.test']);
  const a=await scalar('insert into appointments(workspace_id,booking_request_id,customer_id,price,service_name,customer_name) values($1,$2,$3,$4,$5,$6) returning id',[w,r,customer,price,'Servizio','Cliente']);
  return {r,a};
 }
 const prepare=(a)=>scalar('select to_jsonb(prepare_booking_payment_ledger($1,$2))',[w,a]);
 const pending=await booking(25.5,'pending');
 await assert.rejects(prepare(pending.a),/approvazione/);
 const {r,a}=await booking(25.5);
 await save(null,'full',100,1);
 const terms=await scalar('select to_jsonb(t) from booking_payment_terms t where request_id=$1',[r]);
 assert.equal(terms.due_cents,765,'A changed salon policy must not alter an existing agreement');
 const order=await prepare(a);
 assert.equal(order.upfront_movement_id,(await prepare(a)).upfront_movement_id);
 assert.equal(Number(await scalar('select sum(amount) from cash_movements')),25.5);
 assert.equal(Number(await scalar('select amount from cash_movements where id=$1',[order.balance_movement_id])),17.85);
 assert.equal((await scalar('select prepare_cash_appointment($1,$2)',[w,a])).id,order.upfront_movement_id);
 await assert.rejects(db.query('update appointments set cashed_in=true where id=$1',[a]),/Acconto/);
 await assert.rejects(db.query('update cash_movements set amount=1 where id=$1',[order.upfront_movement_id]),/accordo/);
 const payment=await scalar('select to_jsonb(reserve_cash_stripe($1,$2,false))',[w,order.upfront_movement_id]);
 assert.equal(payment.amount_cents,765);assert.equal(payment.receipt_email,'client@example.test');assert.equal(payment.booking_request_id,r);
 const settle=()=>db.query('select settle_cash_stripe($1,$2,$3,$4,$5,$6)',[payment.id,'acct_test','cs_test',765,'eur','pi_test']);
 await settle();await settle();
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[a]),false,'Deposit alone must not close the appointment');
 assert.equal(Number(await scalar('select booking_payment_paid_cents($1)',[r])),765);
 assert.equal((await scalar('select prepare_cash_appointment($1,$2)',[w,a])).id,order.balance_movement_id);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[order.balance_movement_id]);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[a]),true,'Deposit + balance closes the appointment');
 await db.query('update cash_stripe_payments set refunded_cents=100 where id=$1',[payment.id]);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[a]),true,'Refund must not automatically create a new customer debt');
 const full=await booking(20);
 const fullOrder=await prepare(full.a);assert.equal(fullOrder.balance_movement_id,null);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[fullOrder.upfront_movement_id]);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[full.a]),true);
 const old=await booking(40,'accepted','backoffice');
 const legacy=await scalar('select prepare_cash_appointment($1,$2)',[w,old.a]);assert.equal(Number(legacy.importo),40);
 assert.equal(await scalar('select count(*)::int from booking_payment_orders where appointment_id=$1',[old.a]),0);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[legacy.id]);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[old.a]),true,'Legacy cash flow stays unchanged');
 assert.equal(await scalar("select has_function_privilege('authenticated','save_booking_payment_policy(uuid,uuid,text,integer,bigint)','execute')"),false);
 assert.equal(await scalar("select has_table_privilege('anon','booking_payment_orders','select')"),false);
 // Cancellation preserves receipt records while removing unpaid amounts from totals.
 await db.query("update booking_requests set status='cancelled' where id=$1",[r]);
 await db.query('delete from appointments where id=$1',[a]);
 assert.equal(await scalar('select appointment_id from cash_movements where id=$1',[order.balance_movement_id]),null);
 assert.equal(await scalar('select count(*)::int from cash_movements where id in($1,$2)',[order.balance_movement_id,order.upfront_movement_id]),2);
 const cancelled=await booking(30);
 const cancelledOrder=await prepare(cancelled.a);
 await db.query("update booking_requests set status='cancelled' where id=$1",[cancelled.r]);
 assert.equal(await scalar('select booking_voided from cash_movements where id=$1',[cancelledOrder.upfront_movement_id]),true);
 await assert.rejects(db.query("update cash_movements set payment_method='cash' where id=$1",[cancelledOrder.upfront_movement_id]),/annullata/);
 await assert.rejects(scalar('select reserve_cash_stripe($1,$2,false)',[w,cancelledOrder.upfront_movement_id]),/non confermata/);
 await db.query('delete from appointments where id=$1',[cancelled.a]);
 const tiny=await booking(0.20);
 assert.equal(await scalar('select count(*)::int from booking_payment_terms where request_id=$1',[tiny.r]),0);

 // Endpoint integration against this real SQL fixture; only the Stripe network is stubbed.
 const { publicBookingPayment, saveBookingPaymentPolicy } = await import('../supabase/functions/_shared/booking-payment.ts');
 const admin = {
  rpc: async(name,args)=>{try {
   const keys=Object.keys(args); const q=`select to_jsonb(${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')}))`;
   return {data:await scalar(q,Object.values(args)),error:null};
  } catch(error) {return {data:null,error};}},
  from: table=>{
   let columns='*',patch=null; const filters=[];const params=[];
   const builder={
    select(value){columns=value;return builder;},
    update(value){patch=value;return builder;},
    eq(key,value){params.push(value);filters.push(`${key}=$${params.length}`);return builder;},
    neq(key,value){params.push(value);filters.push(`${key}<>$${params.length}`);return builder;},
    async execute(single){try {
     let sql=`select ${columns} from ${table}`;
     if(patch){const assignments=Object.entries(patch).map(([key,value])=>{params.push(value);return `${key}=$${params.length}`;});sql=`update ${table} set ${assignments.join(',')}`;}
     if(filters.length)sql+=` where ${filters.join(' and ')}`;
     if(patch)sql+=' returning *';
     const rows=(await db.query(sql,params)).rows;
     return {data:single?(rows[0]??null):rows,error:null};
    }catch(error){return {data:null,error};}},
    maybeSingle(){return builder.execute(true);},single(){return builder.execute(true);},
    then(resolve,reject){return builder.execute(false).then(resolve,reject);},
   };return builder;
  },
 };
 await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
 create table customer_login_credentials(customer_id uuid primary key,password_hash text);
 insert into customer_login_credentials values('${customer}',extensions.crypt('test-password',extensions.gen_salt('bf')));`);
 await db.exec(fs.readFileSync('supabase/migrations/20260930223000_customer_payment_sessions.sql','utf8'));
 await db.exec(`alter table workspaces add column is_internal_tester boolean not null default false; update workspaces set is_internal_tester=true,subscription_status='expired' where id='${w}';`);
 await db.exec(fs.readFileSync('supabase/migrations/20260930223100_booking_payment_tester_access.sql','utf8'));
 const paymentSession=await scalar("select create_customer_payment_session('tester','client@example.test','3331234567','test-password')");
 let ready=true; const sessions=new Map();const creates=[];
 const stripe={accounts:{retrieve:async()=>({charges_enabled:ready,payouts_enabled:ready})},checkout:{sessions:{
  create:async(params,options)=>{
   creates.push({params,options});
   const previous=[...sessions.values()].find(s=>s.key===options.idempotencyKey);
   if(previous){assert.deepEqual(previous.params,params);return previous;}
   const session={id:`cs_${sessions.size+1}`,key:options.idempotencyKey,params,status:'open',payment_status:'unpaid',amount_total:params.line_items[0].price_data.unit_amount,currency:'eur',metadata:params.metadata,url:'https://checkout.stripe.com/test'};
   sessions.set(session.id,session);return session;
  },retrieve:async(id)=>sessions.get(id),
 }}};
 ready=false;
 await assert.rejects(saveBookingPaymentPolicy({admin,stripe,workspaceId:w,account:{account_id:'acct_test'},body:{mode:'deposit',percent:30,expectedRevision:2},enabled:true}),/attivazione/);
 ready=true;
 await saveBookingPaymentPolicy({admin,stripe,workspaceId:w,account:{account_id:'acct_test'},body:{mode:'deposit',percent:30,expectedRevision:2},enabled:true});
 const online=await booking(60);
 const baseBody={paymentToken:paymentSession.token,salonCode:'tester',email:'client@example.test',phone:'3331234567',requestId:online.r};
 const options={admin,stripe,live:false,enabled:true,allowed:id=>id===w,base:'https://example.test/cash-stripe',reconcile:async(session,account)=>{
  if(session.payment_status==='paid')await db.query('select settle_cash_stripe($1,$2,$3,$4,$5,$6)',[session.metadata.salonpro_cash_payment,account,session.id,session.amount_total,'eur',`pi_${session.id}`]);
 }};
 await assert.rejects(publicBookingPayment({...options,body:{...baseBody,paymentToken:'',operation:'summary'}}),/password/);
 await assert.rejects(publicBookingPayment({...options,body:{...baseBody,paymentToken:'a'.repeat(64),operation:'checkout'}}),/password/);
 assert.equal((await publicBookingPayment({...options,enabled:false,body:{}})).enabled,false);
 assert.equal((await publicBookingPayment({...options,body:{...baseBody,phone:'wrong',operation:'checkout'}})).enabled,false);
 assert.equal((await publicBookingPayment({...options,body:{...baseBody,requestId:pending.r,operation:'checkout'}})).status,'awaiting_approval');
 assert.equal(creates.length,0,'A pending request must not create a Stripe session');
 const first=await publicBookingPayment({...options,body:{...baseBody,operation:'checkout',amountCents:1,percent:1}});
 assert.equal(first.dueCents,1800,'Caller-provided prices/percentages must be ignored');assert.equal(first.status,'open');
 assert.equal(creates[0].params.line_items[0].price_data.unit_amount,1800);
 const second=await publicBookingPayment({...options,body:{...baseBody,operation:'checkout'}});
 assert.equal(second.url,first.url);assert.equal(creates.length,1,'Retries must reuse the same checkout');
 const active=[...sessions.values()][0];active.status='complete';active.payment_status='paid';
 const afterPayment=await publicBookingPayment({...options,body:{...baseBody,operation:'check'}});
 assert.equal(afterPayment.status,'deposit_paid');assert.equal(afterPayment.balanceCents,4200);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[online.a]),false);
 await db.query("update booking_requests set status='cancelled' where id=$1",[online.r]);
 assert.equal((await publicBookingPayment({...options,body:{...baseBody,operation:'checkout'}})).status,'cancelled');
 assert.equal(creates.length,1,'Cancelled bookings cannot create another payment');
 const late=await booking(10);
 const lateOrder=await prepare(late.a);
 const latePayment=await scalar('select to_jsonb(reserve_cash_stripe($1,$2,false))',[w,lateOrder.upfront_movement_id]);
 await db.query("update booking_requests set status='cancelled' where id=$1",[late.r]);
 await db.query('delete from appointments where id=$1',[late.a]);
 await db.query('select settle_cash_stripe($1,$2,$3,$4,$5,$6)',[latePayment.id,'acct_test','cs_late',300,'eur','pi_late']);
 assert.equal(await scalar('select booking_voided from cash_movements where id=$1',[lateOrder.upfront_movement_id]),false,'A real late payment must remain visible for the salon refund decision');
 assert.equal(await scalar('select booking_voided from cash_movements where id=$1',[lateOrder.balance_movement_id]),true,'Cancelled unpaid balance must remain excluded');
 const terminal=await booking(18,'accepted','backoffice');
 const terminalMovement=await scalar('select prepare_cash_appointment($1,$2)',[w,terminal.a]);
 const terminalPayment=await scalar("select to_jsonb(reserve_cash_stripe($1,$2,false,'terminal'))",[w,terminalMovement.id]);
 await db.query('select settle_cash_terminal($1,$2,$3,$4,$5)',[terminalPayment.id,'acct_test',1800,'eur','pi_legacy_terminal']);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[terminal.a]),true,'Existing contactless settlement stays functional');
 // Payment notice lifecycle uses the real ledger and SQL triggers.
 const notice=await booking(40);
 const noticeOrder=await prepare(notice.a);
 await prepare(notice.a);
 assert.equal(Number(await scalar("select count(*) from test_payment_pushes where payload->>'requestId'=$1",[notice.r])),1,'One push despite retries');
 assert.equal(await scalar('select booking_payment_notice_is_due($1)',[pending.r]),false,'No payment reminder before approval');
 const summary=await publicBookingPayment({...options,body:{...baseBody,operation:'summary'}});
 assert.ok(summary.items.some(item=>item.requestId===notice.r && item.dueCents===1200));
 assert.deepEqual(await scalar('select customer_booking_payment_notices($1,$2)',[other,customer]),[],'No cross-workspace notices');
 assert.equal((await publicBookingPayment({...options,body:{...baseBody,phone:'wrong',operation:'summary'}})).enabled,false);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[noticeOrder.upfront_movement_id]);
 assert.equal(await scalar('select booking_payment_notice_is_due($1)',[notice.r]),false,'Deposit paid in salon clears online reminder');
 assert.ok(!(await scalar('select customer_booking_payment_notices($1,$2)',[w,customer])).some(item=>item.requestId===notice.r));
 const cancelledNotice=await booking(40);
 await db.query("update booking_requests set status='cancelled' where id=$1",[cancelledNotice.r]);
 assert.equal(await scalar('select booking_payment_notice_is_due($1)',[cancelledNotice.r]),false,'Cancelled requests suppress queued reminders');
 await db.query("update booking_requests set status='accepted' where id=$1",[pending.r]);
 assert.equal(await scalar('select booking_payment_notice_is_due($1)',[pending.r]),true,'Approval activates reminder');
 assert.equal(Number(await scalar("select count(*) from test_payment_pushes where payload->>'requestId'=$1",[pending.r])),1);
 await db.query("update appointments set no_show=true where id=$1",[pending.a]);
 assert.equal(await scalar('select booking_payment_notice_is_due($1)',[pending.r]),false,'No-show suppresses reminder');
 const revision=await scalar('select revision from booking_payment_policies where workspace_id=$1 and customer_id is null',[w]);
 await save(null,'full',100,Number(revision));
 const fullNotice=await booking(20);
 const fullItems=await scalar('select customer_booking_payment_notices($1,$2)',[w,customer]);
 assert.ok(fullItems.some(item=>item.requestId===fullNotice.r && item.mode==='full' && item.dueCents===2000));


 const revised=await booking(30);const before=await prepare(revised.a);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[before.upfront_movement_id]);
 const adjust=(total)=>scalar('select revise_appointment_payment($1,$2)',[revised.a,total]);
 let state=await adjust(4000);
 assert.equal(state.receivedCents,3000);assert.equal(state.balanceCents,1000);
 assert.equal(Number(await scalar('select amount from cash_movements where id=$1',[before.upfront_movement_id])),30);
 await db.query('update appointments set price=40,cashed_in=false where id=$1',[revised.a]);
 await db.query("update cash_movements set payment_method='cash' where id=$1",[state.movementId]);
 assert.equal(await scalar('select cashed_in from appointments where id=$1',[revised.a]),true);
 state=await adjust(2000);assert.equal(state.refundDueCents,2000);assert.equal(state.balanceCents,0);
 assert.equal(Number(await scalar('select booking_payment_received_cents($1)',[revised.r])),4000);
 const unpaid=await booking(50);const unpaidOrder=await prepare(unpaid.a);
 await scalar('select reserve_cash_stripe($1,$2,false)',[w,unpaidOrder.upfront_movement_id]);
 await assert.rejects(scalar('select revise_appointment_payment($1,$2)',[unpaid.a,4000]),/Stripe aperto/);
 assert.equal(await scalar('select count(*)::int from appointment_payment_revisions where appointment_id=$1',[unpaid.a]),0);
 await db.exec(`
 create schema auth;create function auth.uid() returns uuid language sql as $$select '${customer}'::uuid$$;
 alter table appointments add column appointment_date date default '2099-01-01',add column appointment_time time default '09:00',add column duration_minutes integer default 30,add column required_role text,add column phase_snapshot jsonb,add column phase_operator_assignments jsonb,add column operator_id text,add column operator_name text;
 alter table booking_requests add column appointment_date date,add column appointment_time time,add column requested_service_name text,add column requested_duration_minutes integer,add column required_role text,add column phase_snapshot jsonb,add column phase_operator_assignments jsonb,add column requested_operator_id text,add column requested_operator_name text,add column viewed_by_customer boolean,add column updated_at timestamptz;
 create table services(id uuid primary key,workspace_id uuid,name text,price numeric,duration_minutes integer,required_role text,phase_config jsonb,linked_service_config jsonb,composition_only boolean default false,superseded_by_composition_id uuid);
 create function get_public_portal_owner_payload_cached_v1(uuid) returns jsonb language sql as $$ select '{"operatori":[{"id":"op1","nome":"Operatore"},{"id":"op2","nome":"Finale"}]}'::jsonb $$;
 create function public_operator_can_book_service_v1(uuid,text,text,text,text) returns boolean language sql as $$select $2 in('op1','op2')$$;
 create function is_public_booking_time_allowed_by_availability(uuid,date,time,integer) returns boolean language sql as $$ select $3 >= '08:00'::time and $3+make_interval(mins=>$4)<='18:00'::time $$;
 create function is_public_booking_slot_available(uuid,date,time,integer,text,text,text) returns boolean language sql as $$select coalesce(current_setting('test.slot_free',true),'yes')<>'no'$$;
 create function phased_operator_interval_conflicts_v1(uuid,date,time,integer,text,text,uuid,uuid) returns boolean language sql as $$ select false $$;
 create function refresh_workspace_agenda_state(uuid) returns void language plpgsql as $$begin return;end$$;
 update appointments set appointment_date='2098-01-01';
 insert into services values('33333333-3333-4333-8333-333333333331','${w}','Capelli',40,45,'Hair',null,null,false,null),
 ('33333333-3333-4333-8333-333333333332','${w}','Colore',60,90,'Hair','{"mode":"phased","initialDurationMinutes":30,"processingDurationMinutes":30,"finalDurationMinutes":30,"finalPhaseEnabled":true,"sameOperator":false,"finalServiceId":"33333333-3333-4333-8333-333333333331","finalServiceName":"Capelli"}',null,false,null);
 `);
 await db.exec('create function public.get_owner_appointment_revision_v1'+fs.readFileSync('supabase/migrations/20260930183000_appointment_service_revisions.sql','utf8').split('create function public.get_owner_appointment_revision_v1')[1]);
 await db.exec(fs.readFileSync('supabase/migrations/20260930235000_fix_revision_push_event_type.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260930235500_revision_push_payment_wording.sql','utf8'));
 const revisionCheckout=await booking(20); const revisionCheckoutOrder=await prepare(revisionCheckout.a);
 const checkoutState=await scalar('select revise_appointment_payment($1,$2)',[revisionCheckout.a,2500]);
 const updatedCheckout=await publicBookingPayment({...options,body:{...baseBody,requestId:revisionCheckout.r,operation:'checkout'}});
 assert.equal(updatedCheckout.dueCents,2500);
 await assert.rejects(scalar('select reserve_cash_stripe($1,$2,false)',[w,revisionCheckoutOrder.upfront_movement_id]),/superato|aggiornato/);
 await db.query("update booking_requests set status='cancelled' where id=$1",[revisionCheckout.r]);
 assert.equal(await scalar('select booking_voided from cash_movements where id=$1',[checkoutState.movementId]),true);
 await db.query('delete from appointments where id=$1',[revisionCheckout.a]);
 assert.equal(Number(await scalar('select count(*) from appointment_revision_receipts where appointment_id=$1',[revisionCheckout.a])),2);
  const target=await booking(30);
 await db.query("update appointments set appointment_date='2099-01-01',updated_at=now() where id=$1",[target.a]);
 const expected=await scalar('select updated_at::text from appointments where id=$1',[target.a]);
 const change=(stamp=expected,service='33333333-3333-4333-8333-333333333331',price=40,initial=45,pose=0,last=0)=>scalar('select revise_owner_appointment_service_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)',[target.a,stamp,service,price,initial,pose,last,'op1','op2']);
 const changed=await change();assert.equal(changed.appointment.id,target.a);assert.equal(changed.appointment.service_name,'Capelli');assert.equal(changed.appointment.duration_minutes,45);assert.equal(changed.payment.balanceCents,4000);
 assert.equal(await scalar('select requested_service_name from booking_requests where id=$1',[target.r]),'Capelli');
 assert.equal(Number(await scalar("select count(*) from test_payment_pushes where payload->>'_serviceRevision'='true' and payload->>'requestId'=$1",[target.r])),1);
 const unchanged=await change(changed.appointment.updated_at);
 assert.equal(unchanged.unchanged,true);
 assert.equal(Number(await scalar('select revision from appointment_payment_revisions where appointment_id=$1',[target.a])),1);
 assert.equal(Number(await scalar("select count(*) from test_payment_pushes where payload->>'_serviceRevision'='true' and payload->>'requestId'=$1",[target.r])),1,'No duplicate push for unchanged save');
 await assert.rejects(change(),/altro dispositivo/);
 let stamp=changed.appointment.updated_at;
 await db.exec("select set_config('test.slot_free','no',false)");
 await assert.rejects(change(stamp),/non entra/);
 assert.equal(Number(await scalar('select revision from appointment_payment_revisions where appointment_id=$1',[target.a])),1,'Conflict must rollback all money changes');
 await db.exec("select set_config('test.slot_free','yes',false)");
 const phased=await change(stamp,'33333333-3333-4333-8333-333333333332',60,20,30,25);
 assert.equal(phased.appointment.duration_minutes,75);assert.equal(phased.appointment.phase_snapshot.finalDurationMinutes,25);assert.equal(phased.appointment.phase_operator_assignments.final.id,'op2');
 const back=await change(phased.appointment.updated_at);
 assert.equal(back.appointment.phase_snapshot,null);assert.equal(back.appointment.phase_operator_assignments,null);
 await assert.rejects(change(back.appointment.updated_at,'33333333-3333-4333-8333-333333333331',-1),/Prezzo/);
 await assert.rejects(change(back.appointment.updated_at,'33333333-3333-4333-8333-333333333331',40,17),/Tempi/);
 const overlapping=await booking(10);await db.query("update appointments set appointment_date='2099-01-01',appointment_time='09:40' where id=$1",[overlapping.a]);
 await assert.rejects(change(back.appointment.updated_at),/sovrappone/);
 await db.query('delete from appointments where id=$1',[overlapping.a]);
 await db.query("update appointments set appointment_date='2020-01-01' where id=$1",[target.a]);
 await assert.rejects(change(back.appointment.updated_at),/futuri/);
 const ownerOnly=await booking(30);
 await db.query("update appointments set booking_request_id=null,appointment_date='2099-02-01',updated_at=now() where id=$1",[ownerOnly.a]);
 const ownerStamp=await scalar('select updated_at::text from appointments where id=$1',[ownerOnly.a]);
 await scalar('select revise_owner_appointment_service_v1($1,$2,$3,40,45,0,0,$4,null)',[ownerOnly.a,ownerStamp,'33333333-3333-4333-8333-333333333331','op1']);
 assert.equal(Number(await scalar("select count(*) from test_payment_pushes where payload->>'appointmentId'=$1 and payload->>'_serviceRevision'='true'",[ownerOnly.a])),1,'Owner-created appointment notifies linked customer');
 assert.match(await scalar("select body from test_payment_pushes where payload->>'appointmentId'=$1 and payload->>'_serviceRevision'='true' limit 1",[ownerOnly.a]),/Da pagare in salone:/);
 console.log('PASS revision CAS, stable appointment ID, request/push update, phase conversion and atomic conflict rollback');

 await db.close();
 console.log('PASS policies, customer override/inherit, stale saves, workspace isolation, approval, snapshot, rounding, deposit/balance, idempotency, refunds, legacy cash and payment notice lifecycle.');
})().catch(e=>{console.error(e);process.exitCode=1;});
