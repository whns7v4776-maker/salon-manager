const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key,cash_section_disabled boolean default false);create publication supabase_realtime;create function current_workspace_id() returns uuid language sql as $$select nullif(current_setting('test.workspace',true),'')::uuid$$;create function workspace_access_allowed() returns boolean language sql as $$select true$$;`);
 for(const table of ['cash_movements','connected_cards','cash_stripe_accounts','cash_stripe_payments','cash_fiscal_settings','cash_fiscal_sandbox'])await db.exec(`create table ${table}(id uuid primary key,workspace_id uuid references workspaces(id) on delete cascade,value text,updated_at timestamptz);`);
 await db.exec(fs.readFileSync('supabase/migrations/20260928150000_cash_sync_revisions.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260928151000_cash_workspace_revision.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260928153000_cash_revision_cascade_guard.sql','utf8'));
 const w='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 await db.exec(`insert into workspaces(id) values('${w}'),('${other}');`);
 await db.exec(`update workspaces set cash_section_disabled=true where id='${w}';`);
 let n=1;const scalar=async sql=>Object.values((await db.query(sql)).rows[0]||{})[0];
 for(const table of ['cash_movements','connected_cards','cash_stripe_accounts','cash_stripe_payments','cash_fiscal_settings','cash_fiscal_sandbox']){
  await db.exec(`insert into ${table} values('${w}','${w}','old',now());`);n++;assert.equal(Number(await scalar(`select revision from cash_sync_revisions where workspace_id='${w}'`)),n);
  await db.exec(`update ${table} set updated_at=clock_timestamp() where id='${w}';`);assert.equal(Number(await scalar(`select revision from cash_sync_revisions where workspace_id='${w}'`)),n);
  await db.exec(`update ${table} set value='new' where id='${w}';`);n++;
  await db.exec(`delete from ${table} where id='${w}';`);n++;
 }
 assert.equal(Number(await scalar(`select revision from cash_sync_revisions where workspace_id='${w}'`)),n);
 await db.exec(`set role authenticated;set test.workspace='${other}';`);assert.equal(await scalar('select count(*)::int from cash_sync_revisions'),0);
 await db.exec(`set test.workspace='${w}';`);assert.equal(await scalar('select count(*)::int from cash_sync_revisions'),1);
 await assert.rejects(db.exec(`update cash_sync_revisions set revision=0`),/permission denied/);
 await db.exec(`reset role;insert into cash_movements values('${w}','${w}','cascade',now());delete from workspaces where id='${w}';`);assert.equal(await scalar('select count(*)::int from cash_sync_revisions'),0);
 await db.close();console.log('PASS cash revision insert/update/delete, no-op suppression, owner isolation, read-only client permissions.');
})().catch(e=>{console.error(e);process.exit(1)});
