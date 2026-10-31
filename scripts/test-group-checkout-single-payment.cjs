// One owner checkout settles every service of a booking group; single appointments are unchanged.
// Uses the real functions from the migrations on a minimal PGlite schema.
// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/test-group-checkout-single-payment.cjs
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const read = f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
const fn = (sql, name) => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const head = sql.lastIndexOf('create', start);
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2) + 3;
  return sql.slice(head, end).replace(/^create function/, 'create or replace function');
};
const fullBalance = read('20261006200000_checkout_full_balance.sql');
const group = read('20261031120000_group_checkout_single_payment.sql');

(async () => {
  const db = new PGlite();
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
  create table appointments(id uuid primary key default gen_random_uuid(),workspace_id uuid,appointment_group_id uuid,appointment_date date default current_date,
   price numeric,no_show boolean default false,cashed_in boolean default false,completed boolean default false,updated_at timestamptz);
  create type payment_method as enum('cash','card','bank_transfer');
  create table cash_movements(id uuid primary key default gen_random_uuid(),workspace_id uuid,appointment_id uuid,amount numeric,
   payment_method payment_method,card_label text,booking_voided boolean default false,updated_at timestamptz);
  create table appointment_checkout_completions(movement_id uuid primary key,workspace_id uuid,appointment_id uuid);
  create table booking_payment_orders(appointment_id uuid,workspace_id uuid,request_id uuid,total_cents bigint,upfront_movement_id uuid,balance_movement_id uuid);
  create table appointment_revision_receipts(movement_id uuid,appointment_id uuid,workspace_id uuid);
  create function workspace_access_allowed() returns boolean language sql as $$ select true $$;
  create function current_workspace_id() returns uuid language sql as $$ select current_setting('test.ws')::uuid $$;
  create function appointment_revision_payment_state(uuid) returns jsonb language sql as $$ select null::jsonb $$;
  create function booking_payment_received_cents(uuid) returns bigint language sql as $$ select 0::bigint $$;
  -- Simplified prepare: one unpaid movement per appointment (idempotent), like the real one.
  create function prepare_cash_appointment(p_workspace uuid,p_appointment uuid) returns jsonb language plpgsql as $$
  declare m cash_movements; begin
   select * into m from cash_movements where appointment_id=p_appointment and workspace_id=p_workspace and payment_method is null;
   if not found then insert into cash_movements(workspace_id,appointment_id,amount) select p_workspace,id,price from appointments where id=p_appointment returning * into m; end if;
   return jsonb_build_object('id',m.id,'importo',m.amount); end $$;
  -- Same trigger as 20260928010000_cash_terminal.sql: a paid movement marks its appointment cashed in.
  create function sync_cash_appointment_payment() returns trigger language plpgsql as $$ begin
   if new.appointment_id is not null and (tg_op='UPDATE' or new.payment_method is not null) then
    update appointments a set cashed_in=exists(select 1 from cash_movements m where m.appointment_id=a.id and m.payment_method is not null) where a.id=new.appointment_id;
   end if; return new; end $$;
  create trigger cash_appointment_payment_sync after insert or update of payment_method on cash_movements for each row execute function sync_cash_appointment_payment();
  `);
  await db.exec(fn(fullBalance, 'finish_appointment_checkout_v1'));
  await db.exec(fn(fullBalance, 'collect_owner_appointment_checkout_v1'));
  await db.exec(fn(group, 'appointment_checkout_pending_ids'));
  await db.exec(fn(group, 'prepare_owner_appointment_checkout_v1'));

  const ws = '11111111-1111-4111-8111-111111111111';
  await db.exec(`select set_config('test.ws','${ws}',false)`);
  const one = async q => (await db.query(q)).rows[0];

  // Group of three services: one payment settles and completes all of them.
  const g = '22222222-2222-4222-8222-222222222222';
  await db.exec(`insert into appointments(id,workspace_id,appointment_group_id,price) values
   ('a0000000-0000-4000-8000-000000000001','${ws}','${g}',20),('a0000000-0000-4000-8000-000000000002','${ws}','${g}',15),('a0000000-0000-4000-8000-000000000003','${ws}','${g}',10)`);
  const prepared = (await one(`select prepare_owner_appointment_checkout_v1('a0000000-0000-4000-8000-000000000002','${ws}') r`)).r;
  assert.equal(Number(prepared.importo), 45, 'checkout shows the whole group total');
  assert.equal(prepared.groupServices, 3);
  assert.equal(prepared.digitalAvailable, false, 'digital stays per-movement until it can charge a group');
  await db.query(`select collect_owner_appointment_checkout_v1('${prepared.id}','${ws}','cash')`);
  const after = await db.query(`select cashed_in,completed from appointments where appointment_group_id='${g}'`);
  assert.ok(after.rows.every(r => r.cashed_in && r.completed), 'every service of the group is cashed in and completed');
  assert.equal(Number((await one(`select count(*) c from cash_movements where appointment_id in (select id from appointments where appointment_group_id='${g}')`)).c), 3, 'no duplicate movements');
  // Repeating the checkout does not create new income.
  await db.query(`select collect_owner_appointment_checkout_v1('${prepared.id}','${ws}','cash')`);
  assert.equal(Number((await one(`select count(*) c from cash_movements where appointment_id in (select id from appointments where appointment_group_id='${g}')`)).c), 3);

  // A no-show or future member is not charged with the others.
  const g2 = '33333333-3333-4333-8333-333333333333';
  await db.exec(`insert into appointments(id,workspace_id,appointment_group_id,price,no_show,appointment_date) values
   ('b0000000-0000-4000-8000-000000000001','${ws}','${g2}',20,false,current_date),('b0000000-0000-4000-8000-000000000002','${ws}','${g2}',15,true,current_date),('b0000000-0000-4000-8000-000000000003','${ws}','${g2}',10,false,current_date+1)`);
  const p2 = (await one(`select prepare_owner_appointment_checkout_v1('b0000000-0000-4000-8000-000000000001','${ws}') r`)).r;
  assert.equal(Number(p2.importo), 20, 'no-show and future services are excluded from the total');

  // Single appointment: unchanged behaviour.
  await db.exec(`insert into appointments(id,workspace_id,price) values('c0000000-0000-4000-8000-000000000001','${ws}',30)`);
  const p3 = (await one(`select prepare_owner_appointment_checkout_v1('c0000000-0000-4000-8000-000000000001','${ws}') r`)).r;
  assert.equal(Number(p3.importo), 30); assert.equal(p3.digitalAvailable, true); assert.equal(p3.groupServices, 1);
  await db.query(`select collect_owner_appointment_checkout_v1('${p3.id}','${ws}','card')`);
  const single = await one(`select cashed_in,completed from appointments where id='c0000000-0000-4000-8000-000000000001'`);
  assert.ok(single.cashed_in && single.completed, 'single appointment cashed in and completed');

  console.log('PASS group checkout: one payment settles and completes every service; no-show/future excluded; no duplicates; single appointments unchanged.');
})().catch(e => { console.error(e); process.exitCode = 1; });
