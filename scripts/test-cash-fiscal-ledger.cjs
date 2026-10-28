const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create table workspaces(id uuid primary key);');
 for(const name of ['20260927230000_cash_fiscal_sandbox','20260927234000_cash_fiscal_email','20260928001000_cash_sandbox_payment_flow','20260928002000_cash_sandbox_refund','20260928003000_cash_sandbox_void_email'])await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
 const w='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
 await db.exec(`insert into workspaces values('${w}');insert into cash_fiscal_sandbox(id,workspace_id,status,payment_status) values('${a}','${w}','waiting_payment','pending');`);
 await assert.rejects(db.exec(`insert into cash_fiscal_sandbox(id,workspace_id) values('${b}','${w}')`),/duplicate key/);
 await db.exec(`update cash_fiscal_sandbox set status='uncertain' where id='${a}'`);
 await assert.rejects(db.exec(`insert into cash_fiscal_sandbox(id,workspace_id,status) values('${b}','${w}','waiting_payment')`),/duplicate key/);
 await db.exec(`update cash_fiscal_sandbox set status='ready' where id='${a}';insert into cash_fiscal_sandbox(id,workspace_id,status) values('${b}','${w}','waiting_payment');`);
 const permissions=(await db.query("select has_table_privilege('authenticated','cash_fiscal_sandbox','SELECT') as readable,has_table_privilege('anon','cash_fiscal_settings','UPDATE') as writable")).rows[0];assert.equal(permissions.readable,false);assert.equal(permissions.writable,false);
 const row=(await db.query(`select email_status,void_email_status from cash_fiscal_sandbox where id='${a}'`)).rows[0];assert.deepEqual(row,{email_status:'not_sent',void_email_status:'not_sent'});
 await db.close();console.log('PASS fiscal ledger: one unresolved attempt, independent email states, restricted access');
})().catch(e=>{console.error(e.message);process.exit(1)});
