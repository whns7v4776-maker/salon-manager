// Isolated PostgreSQL only; synthetic profiles and tokens, no remote connection.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const modulePath = process.env.PGLITE_MODULE || '/tmp/salonpro-appearance-test/node_modules/@electric-sql/pglite';
const { PGlite } = require(modulePath);
const { pgcrypto } = require(modulePath + '/dist/contrib/pgcrypto.cjs');
(async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA salonpro_private;
    CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE public.workspaces(id uuid PRIMARY KEY,slug text);
    CREATE TABLE public.customers(id uuid PRIMARY KEY,workspace_id uuid REFERENCES public.workspaces(id),email text,phone text,is_active boolean);
    CREATE TABLE public.customer_login_credentials(customer_id uuid,password_hash text);
    CREATE TABLE public.customer_payment_sessions(customer_id uuid,token_hash text,credential_hash text,expires_at timestamptz);
    INSERT INTO workspaces VALUES('10000000-0000-0000-0000-000000000001','salone-a'),('10000000-0000-0000-0000-000000000002','salone-b');
    INSERT INTO customers VALUES
      ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a@example.test','3330000001',true),
      ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b@example.test','3330000002',true),
      ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','c@example.test','3330000003',true);
    INSERT INTO customer_login_credentials SELECT id,'synthetic-credential' FROM customers;
    INSERT INTO customer_payment_sessions SELECT id,encode(extensions.digest(repeat(CASE right(id::text,1) WHEN '1' THEN 'a' WHEN '2' THEN 'b' ELSE 'c' END,64),'sha256'),'hex'),'synthetic-credential',now()+interval '1 day' FROM customers;`);
  const protection = fs.readFileSync('supabase/migrations/20261018113000_customer_private_portal_access.sql', 'utf8');
  const definition = protection.match(/CREATE OR REPLACE FUNCTION salonpro_private\.portal_customer\([\s\S]*?END \$\$;/)[0];
  await db.exec(definition);
  if (process.env.TRANSACTION_SQL) {
    await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text primary key,name text,statements text[]); CREATE TABLE public.appointments(id uuid); CREATE TABLE public.booking_requests(id uuid);');
    const actualHash=(await query("select md5(prosrc) hash from pg_proc where oid=to_regprocedure('salonpro_private.portal_customer(text)')"))[0].hash;
    let transaction=fs.readFileSync(process.env.TRANSACTION_SQL,'utf8');
    transaction=transaction.replace(/is distinct from '[a-f0-9]{32}' then raise exception 'portal_baseline_changed'/,"is distinct from '"+actualHash+"' then raise exception 'portal_baseline_changed'");
    await db.exec(transaction);
    assert.equal((await query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261026103000'"))[0].n,1);
  } else {
    await db.exec(fs.readFileSync('supabase/migrations/20261026103000_customer_appearance_preference.sql', 'utf8'));
  }
  const a = ['salone-a', 'a@example.test', '3330000001'];
  const b = ['salone-a', 'b@example.test', '3330000002'];
  const c = ['salone-b', 'c@example.test', '3330000003'];
  const proof = async token => query("select set_config('request.headers',$1,false)", [JSON.stringify(token ? { 'x-salonpro-customer-token': token.repeat(64) } : {})]);
  const read = async identity => (await query('select get_customer_appearance_preference_v1($1,$2,$3) mode', identity))[0].mode;
  const write = async (identity, mode) => (await query('select set_customer_appearance_preference_v1($1,$2,$3,$4) mode', [...identity, mode]))[0].mode;
  let checks = 0;
  const rejects = async (run, code) => { await assert.rejects(run, error => error.code === code); checks++; };
  await db.exec('SET ROLE anon');
  await proof(null); await rejects(() => read(a), 'PT403'); await rejects(() => write(a, 'night'), 'PT403');
  await proof('a'); assert.equal(await read(a), 'system'); checks++;
  for (const mode of ['night','day','system','night']) { assert.equal(await write(a, mode), mode); assert.equal(await read(a), mode); checks += 2; }
  await rejects(() => read(b), 'PT403'); await rejects(() => write(b, 'day'), 'PT403');
  await rejects(() => read(c), 'PT403'); await rejects(() => write(a, 'invalid'), '22023');
  await rejects(() => write(a, null), '22023');
  await rejects(() => query('select * from salonpro_private.customer_appearance_preferences'), '42501');
  await proof('b'); assert.equal(await read(b), 'system'); await write(b, 'day'); checks += 2;
  await proof('c'); assert.equal(await read(c), 'system'); await write(c, 'system'); checks += 2;
  // A new verified session/device retrieves the stored choice, without changing credentials.
  await db.exec(`RESET ROLE; INSERT INTO customer_payment_sessions VALUES ('20000000-0000-0000-0000-000000000001',encode(extensions.digest(repeat('d',64),'sha256'),'hex'),'synthetic-credential',now()+interval '1 day'); SET ROLE anon;`);
  await proof('d'); assert.equal(await read(a), 'night'); checks++;
  await db.exec(`RESET ROLE; UPDATE customer_payment_sessions SET expires_at=now()-interval '1 day' WHERE token_hash=encode(extensions.digest(repeat('d',64),'sha256'),'hex'); SET ROLE anon;`);
  await rejects(() => read(a), 'PT403');
  await proof('a'); await db.exec(`RESET ROLE; UPDATE customer_login_credentials SET password_hash='changed' WHERE customer_id='20000000-0000-0000-0000-000000000001'; SET ROLE anon;`);
  await rejects(() => read(a), 'PT403');
  await db.exec('RESET ROLE');
  assert.equal((await query('select count(*)::int n from salonpro_private.customer_appearance_preferences'))[0].n, 3); checks++;
  await db.close();
  console.log(`PASS ${checks} isolated PostgreSQL assertions: theme roundtrip, new session, tenant/customer isolation, expired/revoked proofs, invalid modes, denied direct access. No production writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
