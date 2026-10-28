const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const moduleName = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = require(moduleName);
const { citext } = require(moduleName.startsWith('/')
  ? path.join(moduleName, 'dist/contrib/citext.cjs')
  : '@electric-sql/pglite/contrib/citext');
const root = path.resolve(__dirname, '..');
const readMigration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const extractFunction = (source, name) => {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as\\s+(\\$[a-z_0-9]*\\$)[\\s\\S]*?\\1;`, 'i');
  const match = source.match(pattern);
  assert.ok(match, `Actual SQL definition exists: ${name}`);
  return match[0];
};
const W = '20000000-0000-0000-0000-000000000001';
const OTHER = '20000000-0000-0000-0000-000000000002';
const UID = '10000000-0000-0000-0000-000000000001';
const CURRENT_CLOCK = '2026-10-09T18:25:13Z';
const OLD_CLOCK = '2026-10-09T18:24:50Z';
const beforeSql = process.env.LIVE_PORTAL_SNAPSHOT_SQL
  ? fs.readFileSync(process.env.LIVE_PORTAL_SNAPSHOT_SQL, 'utf8')
  : extractFunction(readMigration('20260519191000_avoid_noop_workspace_and_portal_updates.sql'), 'upsert_client_portal_snapshot');
const fixSql = readMigration('20261009213000_prevent_snapshot_auto_accept_overwrite.sql');
const authoritySql = readMigration('20260826033000_owner_auto_accept_server_authority.sql');
const passed = [];

(async () => {
  // No connection string/data directory: all data, audit logs and helper effects stay in memory.
  const db = new PGlite({ extensions: { citext } });
  try {
    await db.exec(`
      SET TIME ZONE 'UTC';
      create extension citext;
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create type subscription_plan as enum ('pro');
      create type subscription_status as enum ('demo', 'active');
      create table workspaces (
        id uuid primary key, slug text, salon_name text, owner_email citext, owner_phone text,
        subscription_plan subscription_plan default 'pro', subscription_status subscription_status default 'active',
        is_internal_tester boolean default true, subscription_ends_at timestamptz,
        auto_accept_booking_requests boolean, auto_accept_booking_requests_updated_at timestamptz,
        customer_reminder_hours_before integer default 24, updated_at timestamptz default now(), created_at timestamptz default now(),
        street_line text, city text, postal_code text, client_welcome_enabled boolean default true, client_welcome_title text, client_welcome_message text
      );
      create table workspace_members(workspace_id uuid, user_id uuid);
      create table client_portals (
        workspace_id uuid primary key, owner_email citext, salon_code text, salon_name text,
        salon_name_display_style text, salon_name_font_variant text, business_phone text, activity_category text,
        salon_address text, street_type text, street_name text, street_number text, city text, postal_code text,
        subscription_plan subscription_plan, subscription_status subscription_status,
        customer_reminder_hours_before integer, clienti jsonb, appuntamenti jsonb, servizi jsonb,
        operatori jsonb, richieste_prenotazione jsonb, availability_settings jsonb,
        updated_at timestamptz default now()
      );
      create table owner_app_snapshots(workspace_id uuid primary key,payload jsonb);
      create function get_public_portal_owner_payload(uuid) returns jsonb language sql stable as $$
        select payload from owner_app_snapshots where workspace_id=$1 $$;
      create table audit_fixture(id bigint generated always as identity, action text, details jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('fixture.uid',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email',current_setting('fixture.email',true)) $$;
      create function current_workspace_id() returns uuid language sql stable as $$
        select nullif(current_setting('fixture.workspace',true),'')::uuid $$;
      create function workspace_access_allowed() returns boolean language sql stable as $$
        select current_setting('fixture.access',true)='yes' $$;
      -- Transport/access and unrelated availability merge are fixture boundaries, not provider proof.
      create function merge_client_portal_availability_settings(jsonb,jsonb) returns jsonb language sql as $$
        select $1||$2 $$;
      create function log_workspace_audit_event(uuid,text,text,text,jsonb) returns void language sql as $$
        insert into audit_fixture(action,details) values($2,$5) $$;
    `);
    const q = (sql, values = []) => db.query(sql, values);
    const one = async (sql, values = []) => (await q(sql, values)).rows[0];
    await q("select set_config('fixture.uid',$1,false),set_config('fixture.workspace',$2,false),set_config('fixture.email','owner@isolated.test',false),set_config('fixture.access','yes',false)", [UID,W]);
    await q(`insert into workspaces(id,slug,salon_name,owner_email,owner_phone,auto_accept_booking_requests,auto_accept_booking_requests_updated_at)
      values($1,'isolated','Isolated','owner@isolated.test','3331234567',true,$3),
            ($2,'other','Other','other@isolated.test','3332222222',false,$3)`, [W,OTHER,CURRENT_CLOCK]);
    await db.exec(beforeSql);
    await db.exec(extractFunction(authoritySql, 'get_owner_workspace_auto_accept_booking_requests_v1'));
    await db.exec(extractFunction(authoritySql, 'set_owner_workspace_auto_accept_booking_requests_v1'));
    await db.exec('grant execute on function upsert_client_portal_snapshot(jsonb) to authenticated,service_role;');
    await db.exec(extractFunction(readMigration('20260911180000_public_salon_address_fallback.sql'), 'get_client_portal_catalog'));
    let fixtureId = 0;
    const payload = (preference = {}, profile = {}) => ({
      workspace: { ...profile, ...preference },
      clienti: [{ fixture: ++fixtureId }], appuntamenti: [{ fixture: 'appointment' }],
      servizi: [{ fixture: 'service' }], operatori: [{ fixture: 'operator' }],
      richiestePrenotazione: [{ fixture: 'request' }], availabilitySettings: { fixtureSetting: 17 },
    });
    const publish = async (value) => (await one('select upsert_client_portal_snapshot($1::jsonb) as id', [JSON.stringify(value)])).id;
    const state = async (workspace = W) => one('select auto_accept_booking_requests as enabled, auto_accept_booking_requests_updated_at::text as clock, to_jsonb(w) as full from workspaces w where id=$1', [workspace]);
    const reset = async (enabled, clock = CURRENT_CLOCK) => q(`update workspaces set auto_accept_booking_requests=$2,
      auto_accept_booking_requests_updated_at=$3,updated_at=$4 where id=$1`, [W,enabled,clock,CURRENT_CLOCK]);
    const check = async (name, callback) => { await callback(); passed.push(name); };
    const otherBefore = (await state(OTHER)).full;

    // Preserve a concrete before proof: actual deployed body, both directions, older clock wins wrongly.
    for (const expected of [true,false]) {
      await reset(expected);
      await publish(payload({ autoAcceptBookingRequests: !expected, autoAcceptBookingRequestsUpdatedAt: OLD_CLOCK }));
      const result = await state();
      assert.equal(result.enabled, !expected, 'Original snapshot body overwrites an explicit setting');
      assert.equal(Date.parse(result.clock), Date.parse(OLD_CLOCK));
    }
    const metadataBefore = await one("select proacl::text as acl,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='upsert_client_portal_snapshot(jsonb)'::regprocedure");
    await db.exec(fixSql);
    await check('CREATE OR REPLACE preserves owner/security/config/ACL', async () => {
      const metadata = await one("select proacl::text as acl,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='upsert_client_portal_snapshot(jsonb)'::regprocedure");
      assert.deepEqual(metadata, metadataBefore);
    });
    await check('Authoritative row is locked; neither preference column is assigned', async () => {
      const body = (await one("select prosrc from pg_proc where oid='upsert_client_portal_snapshot(jsonb)'::regprocedure")).prosrc;
      assert.match(body, /where w\.id = v_workspace_id\s+limit 1\s+for update;/i);
      const update = body.slice(body.indexOf('  update public.workspaces'), body.indexOf('  insert into public.client_portals'));
      assert.doesNotMatch(update, /auto_accept_booking_requests(?:_updated_at)?\s*=/);
    });

    for (const expected of [true,false]) {
      const variants = [
        ['older', { autoAcceptBookingRequests: !expected, autoAcceptBookingRequestsUpdatedAt: OLD_CLOCK }],
        ['same clock', { autoAcceptBookingRequests: !expected, autoAcceptBookingRequestsUpdatedAt: CURRENT_CLOCK }],
        ['future clock', { autoAcceptBookingRequests: !expected, autoAcceptBookingRequestsUpdatedAt: '2099-01-01T00:00:00Z' }],
        ['missing', {}],
        ['null', { autoAcceptBookingRequests: null, autoAcceptBookingRequestsUpdatedAt: null }],
        ['invalid', { autoAcceptBookingRequests: 'invalid boolean', autoAcceptBookingRequestsUpdatedAt: 'invalid timestamp' }],
      ];
      for (const [kind,echo] of variants) await check(`${expected}: ${kind} snapshot keeps authoritative value/clock/audit`, async () => {
        await reset(expected);
        const input = payload(echo);
        assert.equal(await publish(input), W);
        const result = await state();
        assert.equal(result.enabled,expected);
        assert.equal(Date.parse(result.clock),Date.parse(CURRENT_CLOCK));
        const audit = await one('select details from audit_fixture order by id desc limit 1');
        assert.equal(audit.details.autoAcceptBookingRequests,expected);
        assert.equal(Date.parse(audit.details.autoAcceptBookingRequestsUpdatedAt),Date.parse(CURRENT_CLOCK));
        const portal = await one('select clienti,appuntamenti,servizi,operatori,richieste_prenotazione,availability_settings from client_portals where workspace_id=$1',[W]);
        assert.deepEqual(portal,{clienti:input.clienti,appuntamenti:input.appuntamenti,servizi:input.servizi,operatori:input.operatori,richieste_prenotazione:input.richiestePrenotazione,availability_settings:input.availabilitySettings});
      });
    }
    await check('First publication does not manufacture a missing preference clock', async () => {
      await reset(false,null);await q('delete from client_portals where workspace_id=$1',[W]);
      await publish(payload({autoAcceptBookingRequests:true,autoAcceptBookingRequestsUpdatedAt:'2099-01-01T00:00:00Z'}));
      const result=await state();assert.equal(result.enabled,false);assert.equal(result.clock,null);
    });
    for (const enabled of [true,false]) await check(`Public catalogue uses authority despite stale owner snapshot ${enabled}`,async()=>{
      await reset(enabled);const input=payload({autoAcceptBookingRequests:!enabled,autoAcceptBookingRequestsUpdatedAt:OLD_CLOCK});
      await q('insert into owner_app_snapshots values($1,$2::jsonb) on conflict(workspace_id) do update set payload=excluded.payload',[W,JSON.stringify(input)]);
      await publish(input);
      const catalog=(await one("select get_client_portal_catalog('isolated') as result")).result;
      assert.equal(catalog.workspace.autoAcceptBookingRequests,enabled);assert.equal(Date.parse(catalog.workspace.autoAcceptBookingRequestsUpdatedAt),Date.parse(CURRENT_CLOCK));
      assert.deepEqual(catalog.servizi,input.servizi);assert.deepEqual(catalog.operatori,input.operatori);
    });
    await check('Profile edits and server reminder retain their existing contract', async () => {
      await reset(true);await q('update workspaces set customer_reminder_hours_before=48 where id=$1',[W]);
      await publish(payload({autoAcceptBookingRequests:false,autoAcceptBookingRequestsUpdatedAt:OLD_CLOCK},{salonName:'Renamed',businessPhone:'3337654321'}));
      const result=await state();assert.equal(result.enabled,true);assert.equal(result.full.salon_name,'Renamed');assert.equal(result.full.owner_phone,'3337654321');assert.equal(result.full.customer_reminder_hours_before,48);
      assert.equal((await one('select customer_reminder_hours_before from client_portals where workspace_id=$1',[W])).customer_reminder_hours_before,48);
    });
    await check('Preference-only stale echo does not update workspace/profile timestamp', async () => {
      await reset(true);const before=await state();
      await publish(payload({autoAcceptBookingRequests:false,autoAcceptBookingRequestsUpdatedAt:OLD_CLOCK}));
      assert.deepEqual((await state()).full,before.full);
    });
    await check('Canonical repeat is idempotent for profile/portal and preference', async () => {
      await reset(true);const input=payload({autoAcceptBookingRequests:true,autoAcceptBookingRequestsUpdatedAt:CURRENT_CLOCK});
      await publish(input);const before=await state();const portalBefore=await one('select to_jsonb(p) as full from client_portals p where workspace_id=$1',[W]);const auditCount=(await one('select count(*)::int n from audit_fixture')).n;
      await publish(input);assert.deepEqual(await state(),before);assert.deepEqual(await one('select to_jsonb(p) as full from client_portals p where workspace_id=$1',[W]),portalBefore);assert.equal((await one('select count(*)::int n from audit_fixture')).n,auditCount);
    });

    // PGlite serializes submitted queries: cover both ordered interleavings, not multi-session concurrency.
    for (const requested of [true,false]) for (const setterFirst of [true,false]) await check(`ordered publish/toggle ${requested}, setterFirst=${setterFirst}`, async () => {
      await reset(!requested);const stale=payload({autoAcceptBookingRequests:!requested,autoAcceptBookingRequestsUpdatedAt:OLD_CLOCK});
      const toggle=()=>one("select set_owner_workspace_auto_accept_booking_requests_v1($1,'isolated',$2) as result",[W,requested]);
      const tasks=setterFirst?[toggle(),publish(stale)]:[publish(stale),toggle()];
      const responses=await Promise.all(tasks);const response=responses[setterFirst?0:1].result;
      assert.equal(response.autoAcceptBookingRequests,requested);
      const authoritative=(await one("select get_owner_workspace_auto_accept_booking_requests_v1($1,'isolated') as result",[W])).result;
      assert.equal(authoritative.autoAcceptBookingRequests,requested);
      assert.equal(Date.parse(authoritative.autoAcceptBookingRequestsUpdatedAt),Date.parse(response.autoAcceptBookingRequestsUpdatedAt));
      await publish(stale);const final=await state();assert.equal(final.enabled,requested);assert.equal(Date.parse(final.clock),Date.parse(response.autoAcceptBookingRequestsUpdatedAt));
    });
    for (const [setting,value,error] of [
      ['fixture.uid','','auth_required'],['fixture.access','no','workspace_access_denied'],
    ]) await check(`Access guard ${error} preserves state`,async()=>{
      const before=await state();await q('select set_config($1,$2,false)',[setting,value]);
      await assert.rejects(publish(payload()),new RegExp(error));
      await q('select set_config($1,$2,false)',[setting,setting==='fixture.uid'?UID:'yes']);
      assert.deepEqual(await state(),before);
    });
    for (const [profile,error] of [[{ownerEmail:'other@isolated.test'},'owner_email_mismatch'],[{salonCode:'other'},'salon_code_mismatch']]) await check(`Identity guard ${error}`,async()=>{
      const before=await state();await assert.rejects(publish(payload({},profile)),new RegExp(error));assert.deepEqual(await state(),before);
    });
    await check('Other workspace is unchanged',async()=>assert.deepEqual((await state(OTHER)).full,otherBefore));
    const summary={beforeDefectsReproduced:2,isolatedCasesPassed:passed.length,failed:0,realMultiSessionConcurrencyTested:false,remoteWrites:false};
    if(process.env.AUDIT_SQL_METADATA_PATH){const metadata=await one("select pg_get_functiondef(oid) as definition,prosrc as body,proacl::text as acl,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid='upsert_client_portal_snapshot(jsonb)'::regprocedure");fs.writeFileSync(process.env.AUDIT_SQL_METADATA_PATH,JSON.stringify(metadata,null,2)+'\n');}
    if(process.env.AUDIT_RESULT_PATH)fs.writeFileSync(process.env.AUDIT_RESULT_PATH,JSON.stringify({...summary,passed},null,2)+'\n');
    console.log(JSON.stringify(summary));
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
