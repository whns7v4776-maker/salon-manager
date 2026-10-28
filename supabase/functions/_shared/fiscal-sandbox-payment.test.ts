import { advanceSandboxPayment, advanceSandboxRefund, sandboxStripe, verifySandboxPayment } from './fiscal-sandbox-payment.ts';
import { fiscalTester } from './fiscal-sandbox-delivery.ts';
const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
function setup(scenario='success') {
 let row:any={id:'22222222-2222-4222-8222-222222222222',workspace_id:fiscalTester,status:'waiting_payment',payment_status:'pending',payment_scenario:scenario,stripe_account:'acct_test',created_at:new Date().toISOString()};
 const db={from(){let values:any,expected:string|undefined,nullKey:string|undefined;const q:any={update(v:any){values=v;return q},eq(k:string,v:string){if(k==='status')expected=v;return q},is(k:string,_v:null){nullKey=k;return q},select(){return q},single(){return Promise.resolve({data:apply()[0]})},maybeSingle(){return Promise.resolve({data:apply()[0]||null})},then(resolve:any){return Promise.resolve({data:apply()}).then(resolve)}};function apply(){if(expected&&row.status!==expected)return [];if(nullKey&&row[nullKey]!=null)return [];if(values)row={...row,...values};return [{...row}]}return q;}};
 let emits=0;const client:any={submit:async()=>{emits++;return {uuid:'receipt',status:'new',document_number:null}}};
 const intent:any={id:'pi_test',livemode:false,amount:2550,currency:'eur',metadata:{salonpro_fiscal_test:row.id,workspace:fiscalTester},status:scenario==='success'?'succeeded':'requires_payment_method'};
 const stripe:any={paymentIntents:{create:async(_v:any,options:any)=>{assert(options.idempotencyKey.endsWith(row.id),'idempotent');return intent},retrieve:async()=>intent}};
 return {db,client,stripe,intent,row:()=>({...row}),set:(v:any)=>{row={...row,...v}},emits:()=>emits};
}
Deno.test('confirmed test payment emits once under concurrent retries',async()=>{
 const f=setup();await Promise.all([advanceSandboxPayment(f.db,f.client,f.row(),f.stripe),advanceSandboxPayment(f.db,f.client,f.row(),f.stripe)]);
 assert(f.emits()===1,'single fiscal submission');assert(f.row().payment_status==='succeeded'&&f.row().provider_id==='receipt','linked result');
 await advanceSandboxPayment(f.db,f.client,f.row(),f.stripe);assert(f.emits()===1,'no duplicate');
});
Deno.test('declined payment never emits; live or mismatched intent rejected',async()=>{
 const f=setup('declined');await advanceSandboxPayment(f.db,f.client,f.row(),f.stripe);assert(f.emits()===0&&f.row().payment_status==='failed','decline');
 for(const patch of [{livemode:true},{amount:1},{currency:'usd'},{metadata:{}},{id:'pi_other'}]){
 let rejected=false;try{verifySandboxPayment({...f.intent,...patch},{...f.row(),stripe_intent:'pi_test'});}catch{rejected=true}assert(rejected,'mismatch rejected');
 }
 let rejected=false;try{sandboxStripe('sk_live_never');}catch{rejected=true}assert(rejected,'live key forbidden');
});
Deno.test('uncertain fiscal submission stays blocked, stale Stripe retry refused',async()=>{
 const f=setup();f.client.submit=async()=>{throw Error('timeout')};await advanceSandboxPayment(f.db,f.client,f.row(),f.stripe);assert(f.row().status==='uncertain','uncertain retained');
 const stale=setup();stale.set({created_at:'2020-01-01T00:00:00Z'});let rejected=false;try{await advanceSandboxPayment(stale.db,stale.client,stale.row(),stale.stripe)}catch{rejected=true}assert(rejected&&stale.emits()===0,'no stale retry');
});

Deno.test('refund is idempotent and voiding is claimed once without deleting the sale',async()=>{
 const f=setup();f.set({status:'ready',payment_status:'succeeded',stripe_intent:'pi_test',provider_id:'sale',refund_status:'pending',refund_requested_at:new Date().toISOString()});
 let voids=0;f.stripe.refunds={create:async()=>({id:'re_test',payment_intent:'pi_test',amount:2550,currency:'eur',status:'succeeded'}),retrieve:async()=>({id:'re_test',payment_intent:'pi_test',amount:2550,currency:'eur',status:'succeeded'})};
 f.client.void=async()=>{voids++;return {uuid:'void',status:'new'}};
 f.client.read=async()=>({uuid:'void',type:'void',voided_receipt:null,fiscal_id:'99926092711',total_amount:25.5,status:'ready',document_number:'VOID-TEST'});
 await Promise.all([advanceSandboxRefund(f.db,f.client,f.row(),f.stripe),advanceSandboxRefund(f.db,f.client,f.row(),f.stripe)]);
 await advanceSandboxRefund(f.db,f.client,f.row(),f.stripe);
 assert(voids===1&&f.row().void_status==='ready','one confirmed void');assert(f.row().provider_id==='sale'&&f.row().refund_status==='succeeded','original retained');
 await advanceSandboxRefund(f.db,f.client,f.row(),f.stripe);assert(voids===1,'no repeated void');
});
