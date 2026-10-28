import fs from 'node:fs';import os from 'node:os';import crypto from 'node:crypto';
const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();const token=fs.readFileSync(os.homedir()+'/.supabase/access-token','utf8').trim();
const w=crypto.randomUUID(),u=crypto.randomUUID(),p=crypto.randomUUID();
async function query(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});return {ok:r.ok,text:await r.text()};}
const auth=`select set_config('request.jwt.claim.sub','${u}',true);`;
try {
 const setup=await query(`BEGIN;insert into auth.users(id,email) values('${u}','${u}@example.invalid');insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values('${w}','Disposable shop concurrency test','test-${w}','${u}@example.invalid','active',now()+interval '1 year');insert into workspace_members(workspace_id,user_id,email) values('${w}','${u}','${u}@example.invalid');insert into shop_settings(workspace_id,enabled) values('${w}',true);insert into shop_products(id,workspace_id,name,sku,purpose,unit,pack_size,price_cents,cost_cents,retail_qty) values('${p}','${w}','Disposable fixture','TEST','retail','piece',1,100,50,1);COMMIT;`);
 if(!setup.ok)throw new Error(setup.text);
 const sell=(delay)=>`BEGIN;${auth}${delay?"select shop_workspace();select pg_sleep(1);":""} select shop_checkout('${crypto.randomUUID()}',null,'cash','[{"id":"${p}","quantity":1,"revision":1}]'::jsonb);COMMIT;`;
 const results=await Promise.all([query(sell(true)),query(sell(false))]);
 if(results.filter(r=>r.ok).length!==1||!results.some(r=>!r.ok&&r.text.includes('Scorta insufficiente')))throw new Error('Concurrent last-unit sale did not produce exactly one winner: '+JSON.stringify(results));
 const check=await query(`do $$ begin if (select retail_qty from shop_products where id='${p}')<>0 or (select count(*) from shop_sales where workspace_id='${w}')<>1 or (select count(*) from cash_movements where workspace_id='${w}')<>1 then raise exception 'Concurrency state mismatch';end if;end $$;`);if(!check.ok)throw new Error(check.text);
 console.log('Two concurrent sales: one confirmed, one rejected; one cash receipt and no negative stock.');
}finally{
 const clean=await query(`BEGIN;delete from shop_sale_lines where workspace_id='${w}';delete from shop_stock_movements where workspace_id='${w}';delete from shop_returns where workspace_id='${w}';delete from shop_sales where workspace_id='${w}';delete from cash_movements where workspace_id='${w}';delete from shop_operations where workspace_id='${w}';delete from shop_products where workspace_id='${w}';delete from shop_settings where workspace_id='${w}';delete from shop_sync_revisions where workspace_id='${w}';delete from workspace_members where workspace_id='${w}';delete from workspaces where id='${w}';delete from auth.users where id='${u}';COMMIT;`);
 if(!clean.ok)throw new Error('Fixture cleanup failed for '+w+': '+clean.text);console.log('Isolated test workspace removed.');
}
