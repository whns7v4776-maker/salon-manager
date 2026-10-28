const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.workspaces(id uuid primary key);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261023235000_cash_owner_passkeys.sql', 'utf8'));
  const user = '11111111-1111-4111-8111-111111111111';
  const workspace = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values ($1)', [user]);
  await db.query('insert into public.workspaces values ($1)', [workspace]);
  await db.exec('set role service_role');
  await db.query(`insert into cash_owner_passkeys(credential_id,user_id,workspace_id,rp_id,public_key) values ('fixture',$1,$2,'example.test','AQI')`, [user, workspace]);
  await db.query(`insert into cash_owner_passkey_challenges(user_id,workspace_id,kind,challenge,origin,rp_id) values ($1,$2,'authenticate','fixture','https://example.test','example.test')`, [user, workspace]);
  const ttl = (await db.query('select extract(epoch from expires_at-created_at) as ttl from cash_owner_passkey_challenges')).rows[0].ttl;
  assert.equal(Number(ttl), 300);
  await assert.rejects(db.query('update cash_owner_passkeys set counter=-1'), /check constraint/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query('select * from cash_owner_passkeys'), /permission denied/);
  await assert.rejects(db.query('select * from cash_owner_passkey_challenges'), /permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from cash_owner_passkeys'), /permission denied/);
  await db.exec('reset role');
  const rls = await db.query("select relrowsecurity from pg_class where relname in ('cash_owner_passkeys','cash_owner_passkey_challenges')");
  assert.equal(rls.rows.length, 2);
  assert.ok(rls.rows.every(row => row.relrowsecurity));
  await db.query('delete from public.workspaces where id=$1', [workspace]);
  assert.equal((await db.query('select count(*)::int as n from cash_owner_passkeys')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from cash_owner_passkey_challenges')).rows[0].n, 0);
  await db.close();
  console.log('PASS: passkey SQL migration, restricted table grants, RLS, five-minute TTL, counter constraint and workspace cleanup. Isolated database only.');
})().catch(error => {console.error(error); process.exitCode = 1;});
