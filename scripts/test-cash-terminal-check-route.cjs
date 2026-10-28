// Exercise the public Cassa check handler with local adapters, never live Stripe.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const terminal={exports:{}};
vm.runInNewContext(compile('supabase/functions/_shared/cash-terminal.ts'),{module:terminal,exports:terminal.exports,Date});
const movementId='22222222-2222-4222-8222-222222222222';
let payment={id:'11111111-1111-4111-8111-111111111111',channel:'terminal',status:'paid',account_id:'acct_local',payment_intent:'pi_local',amount_cents:2500,currency:'eur'};
let intent={id:'pi_local',livemode:true,status:'succeeded',amount:2500,amount_received:2500,currency:'eur',metadata:{salonpro_cash_payment:payment.id},payment_method_types:['card_present'],latest_charge:{receipt_url:'https://pay.stripe.com/receipt/local'}};
let reads=0,handler;
const query=table=>{const chain={select:()=>chain,eq:()=>chain,neq:()=>chain,maybeSingle:async()=>({data:table==='cash_stripe_accounts'?{account_id:'acct_local',livemode:true}:payment})};return chain;};
const admin={from:query,rpc:()=>{throw Error('A paid check must not mutate the ledger.');}};
const owner={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async name=>({data:name==='current_workspace_id'?'workspace':true})};
class Stripe {constructor(){this.paymentIntents={retrieve:async(id,params,options)=>{reads++;assert.equal(id,'pi_local');assert.equal(options.stripeAccount,'acct_local');assert.equal(params.expand[0],'latest_charge');return intent;}};}static createFetchHttpClient(){return {};}}
const env={SUPABASE_URL:'https://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-service',SUPABASE_ANON_KEY:'local-anon',CASH_STRIPE_SECRET_KEY:'sk_live_local',CASH_STRIPE_CONNECT_CLIENT_ID:'local-client',CASH_STRIPE_WEBHOOK_SECRET:'local-webhook',CASH_STRIPE_RETURN_URL:'https://local.invalid/return',CASH_STRIPE_PUBLIC_ENABLED:'true'};
vm.runInNewContext(compile('supabase/functions/cash-stripe/index.ts'),{
 exports:{},Date,URL,URLSearchParams,Response,Request,crypto,
 Deno:{env:{get:key=>env[key]},serve:job=>{handler=job;}},
 require:name=>name.includes('cash-terminal')?terminal.exports:name.includes('supabase-js')?{createClient:(_url,key)=>key==='local-service'?admin:owner}:name.startsWith('npm:stripe')?{default:Stripe}:{},
});
const check=async()=>{const response=await handler(new Request('https://local.invalid/functions/v1/cash-stripe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'local-session'},body:JSON.stringify({action:'check',movementId})}));return {status:response.status,body:await response.json()};};
(async()=>{
 let result=await check();assert.equal(result.status,200);assert.equal(result.body.status,'paid');assert.equal(result.body.channel,'terminal');assert.equal(result.body.amountCents,2500);assert.match(result.body.receipt,/https:\/\/pay.stripe.com\/receipt\/local/);assert.equal(reads,1);
 payment={...payment,channel:'checkout'};result=await check();assert.equal(result.body.status,'paid');assert.equal(reads,1);assert.equal(result.body.receipt,undefined);
 payment={...payment,channel:'terminal'};intent={...intent,amount:1};result=await check();assert.notEqual(result.status,200);assert.equal(result.body.receipt,undefined);
 console.log('PASS Cassa check retains the Terminal receipt after settlement, preserves QR, rejects mismatched provider data and does not mutate the ledger.');
})().catch(error=>{console.error(error);process.exitCode=1;});
