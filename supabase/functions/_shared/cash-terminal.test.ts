import {assertEquals,assertRejects,assertThrows} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {validateTerminalIntent,terminalAction,reconcileTerminal,terminalOutcome,terminalReceipt} from './cash-terminal.ts';
const payment={id:'11111111-1111-4111-8111-111111111111',channel:'terminal',account_id:'acct_test',amount_cents:2500,currency:'eur',payment_intent:'pi_test',status:'open'};
const intent:any={id:'pi_test',livemode:false,amount:2500,amount_received:2500,currency:'eur',metadata:{salonpro_cash_payment:payment.id},payment_method_types:['card_present'],status:'succeeded'};
Deno.test('Terminal validates exact amount, mode, intent, channel and ledger reference',()=>{
 validateTerminalIntent(intent,payment,false);
 for(const patch of [{livemode:true},{amount:1},{amount_received:1},{currency:'usd'},{id:'pi_other'},{metadata:{}},{payment_method_types:['card']}])assertThrows(()=>validateTerminalIntent({...intent,...patch},payment,false));
 assertThrows(()=>validateTerminalIntent(intent,{...payment,channel:'checkout'},false));
});
Deno.test('Disabled or sandbox collection cannot create charges or tokens',async()=>{
 for(const action of ['terminal-token','terminal-intent'])await assertRejects(()=>terminalAction({admin:{},stripe:{},account:{account_id:'acct_test'},workspaceId:'w',body:{action},live:true,enabled:false}));
 await assertRejects(()=>terminalAction({admin:{},stripe:{},account:{account_id:'acct_test'},workspaceId:'w',body:{action:'terminal-intent'},live:false,enabled:true}));
});
Deno.test('Only provider success settles; decline or processing leaves Agenda and Cassa unpaid',async()=>{
 let settled=0;
 const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:payment})};
 const admin={from:()=>chain,rpc:async()=>{settled++;return {};}};
 for(const status of ['requires_payment_method','requires_confirmation','processing'])await reconcileTerminal(admin,{...intent,status},'acct_test',false);
 assertEquals(settled,0);
 await assertRejects(()=>reconcileTerminal(admin,intent,'acct_other',false));assertEquals(settled,0);
 await reconcileTerminal(admin,intent,'acct_test',false);assertEquals(settled,1);
});
Deno.test('Receipts report provider outcomes without treating timeouts as declines',()=>{
 assertEquals(terminalOutcome({...intent,status:'processing'}),'pending');
 assertEquals(terminalReceipt(payment,'pending'),undefined);
 assertEquals(terminalOutcome({...intent,status:'requires_payment_method',last_payment_error:null}),'pending');
 assertEquals(terminalOutcome({...intent,status:'requires_payment_method',last_payment_error:{code:'card_declined'}}),'declined');
 assertEquals(terminalReceipt(payment,'declined')?.includes('nessun incasso'),true);
 assertEquals(terminalReceipt(payment,'paid')?.includes('25,00 EUR'),true);
 const receipt=terminalReceipt(payment,'declined',{...intent,latest_charge:{created:1791450000,payment_method_details:{card_present:{brand:'visa',last4:'4242',receipt:{account_type:'credit',application_preferred_name:'VISA',dedicated_file_name:'A0000000031010'}}}}} as any);
 for(const value of ['•••• 4242','credit','VISA','A0000000031010','Data:'])assertEquals(receipt?.includes(value),true);
 assertEquals(terminalReceipt(payment,'paid',{...intent,latest_charge:{receipt_url:'https://pay.stripe.com/receipt/test'}} as any)?.includes('https://pay.stripe.com/receipt/test'),true);
});
Deno.test('Only current verified webhook failures queue durable owner alerts',async()=>{
 const calls:any[]=[];
 const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:payment})};
 const admin={from:()=>chain,rpc:async(name:string,params:any)=>{calls.push([name,params]);return {};}};
 const failed={...intent,status:'requires_payment_method',last_payment_error:{code:'card_declined'}};
 await reconcileTerminal(admin,failed as any,'acct_test',false);assertEquals(calls.length,0);
 await reconcileTerminal(admin,failed as any,'acct_test',false,'evt_1');
 assertEquals(calls[0][0],'record_cash_terminal_decline');
 assertEquals(calls[0][1].p_event,'evt_1');
 await reconcileTerminal(admin,{...intent,status:'processing'},'acct_test',false,'evt_2');assertEquals(calls.length,1);
 await assertRejects(()=>reconcileTerminal(admin,failed as any,'acct_other',false,'evt_bad'));assertEquals(calls.length,1);
});
