import assert from 'node:assert/strict';
import { cashAccountStatus } from '../supabase/functions/_shared/cash-account-status';
(async () => {
const calls: unknown[] = [];
let failure = false;
const query: any = {select(v: unknown){ calls.push(['select',v]); return this; },eq(k: string,v: unknown){calls.push([k,v]);return this;},gt(k: string,v: unknown){calls.push([k,v]);return this;},limit(v: number){calls.push(['limit',v]);return Promise.resolve({data:[],error:failure ? new Error('offline') : null});}};
const admin = {from: () => query};
const account = {account_id:'acct_test',livemode:false};
for (const charges of [false,true]) for (const payouts of [false,true]) {
 const status=await cashAccountStatus(admin,{accounts:{retrieve:async()=>({charges_enabled:charges,payouts_enabled:payouts})}},'salon',account,false);
 assert.equal(status.ready,charges && payouts);
}
assert(calls.some(c=>JSON.stringify(c)==='["limit",1]'));
assert(calls.some(c=>JSON.stringify(c)==='["refunded_cents",0]'));
assert(calls.some(c=>JSON.stringify(c)==='["workspace_id","salon"]'));
failure=true;
await assert.rejects(cashAccountStatus(admin,{accounts:{retrieve:async()=>({})}},'salon',account,false),/database/);
assert.equal((await cashAccountStatus(null,null,'salon',null,true)).connected,false);
console.log('PASS: readiness, bounded refund query, workspace scope and offline handling');

})().catch(error => { console.error(error); process.exitCode=1; });
