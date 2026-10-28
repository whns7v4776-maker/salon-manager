import { advanceSandboxReceipt, fiscalTester } from './fiscal-sandbox-delivery.ts';
import { createAcubeSandboxClient } from './acube-receipts.ts';
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
function fixture(extra: Record<string,unknown> = {}) {
 let row: any = { id: '12345678-1234-1234-1234-123456789abc', workspace_id: fiscalTester, provider_id: 'test-provider', status: 'ready', email_status: 'not_sent', ...extra };
 const files=new Map<string,Uint8Array>();
 const db = { storage:{from(){return {download:async(path:string)=>files.has(path)?{data:new Blob([new Uint8Array(files.get(path)!)])}:{error:'missing'},upload:async(path:string,bytes:Uint8Array)=>{files.set(path,bytes);return {};}};}}, from() { let values: any, expected: string | undefined, expectedField = 'email_status';
  const query: any = {
   update(v: any) { values = v; return query; },
   eq(k: string, v: string) { if (k === 'email_status' || k === 'void_email_status') {expected = v;expectedField=k;} return query; },
   select() { return query; },
   single() { return Promise.resolve({data: apply()[0]}); },
   then(resolve: any) { return Promise.resolve({data: apply()}).then(resolve); },
  };
  function apply() { if (expected && row[expectedField] !== expected) return []; row = {...row,...values}; return [{...row}]; }
  return query;
 }};
 return {db, row: () => ({...row})};
}
Deno.test('delivery claim, duplicate check and provider-confirmed delivery', async () => {
 Deno.env.set('RESEND_API_KEY','test'); Deno.env.set('EMAIL_FROM','test@example.com');
 const f = fixture(); const original = globalThis.fetch; let sent = 0;
 const client = { pdf: async () => new TextEncoder().encode('%PDF-test') } as unknown as ReturnType<typeof createAcubeSandboxClient>;
 try {
  globalThis.fetch = (async (_url, init) => {
   if (init?.method === 'POST') {
    sent++; const body = JSON.parse(String(init.body));
    assert(body.to[0] === 'salon.pro.app13@gmail.com', 'Only tester mailbox');
    assert(String((init.headers as any)['Idempotency-Key']).startsWith('fiscal-sandbox/'), 'Stable email key');
    return Response.json({id:'email-test'});
   }
   return Response.json({last_event:'delivered'});
  }) as typeof fetch;
  await Promise.all([advanceSandboxReceipt(f.db,client,f.row(),true),advanceSandboxReceipt(f.db,client,f.row(),true)]);
  assert(sent===1,'Parallel checks must send once');
  assert(f.row().email_status==='delivered','Only provider confirms delivery');
  await advanceSandboxReceipt(f.db,client,f.row(),true);
  assert(sent===1,'Delivered receipt must not resend');
 } finally {globalThis.fetch=original;}
});
Deno.test('uncertain email is retained without blind retry; other workspace rejected', async () => {
 const f=fixture(), original=globalThis.fetch; let attempts=0;
 const client={pdf:async()=>new TextEncoder().encode('%PDF-test')} as unknown as ReturnType<typeof createAcubeSandboxClient>;
 try {
  globalThis.fetch=(async()=>{attempts++;throw Error('timeout');}) as typeof fetch;
  await advanceSandboxReceipt(f.db,client,f.row(),true);
  await advanceSandboxReceipt(f.db,client,f.row(),true);
  assert(attempts===1 && f.row().email_status==='uncertain','Uncertain attempt must not duplicate');
  let rejected=false;try{await advanceSandboxReceipt(f.db,client,{...f.row(),workspace_id:'other'},true);}catch{rejected=true;}
  assert(rejected,'Other workspace forbidden');
 } finally {globalThis.fetch=original;}
});

Deno.test('void PDF has separate delivery state and idempotency key', async()=>{
 const f=fixture({archived_at:'2026-09-28T00:00:00Z',email_status:'delivered',void_status:'ready',void_id:'void-test',void_email_status:'not_sent'}),original=globalThis.fetch;let sent=0;
 const client={pdf:async(id:string)=>{assert(id==='void-test','annulment PDF');return new TextEncoder().encode('%PDF-void')}} as unknown as ReturnType<typeof createAcubeSandboxClient>;
 try{globalThis.fetch=(async(_url,init)=>{if(init?.method==='POST'){sent++;const body=JSON.parse(String(init.body));assert(body.attachments[0].filename==='annullamento-collaudo.pdf','void filename');assert(String((init.headers as any)['Idempotency-Key']).endsWith('/void'),'distinct key');return Response.json({id:'void-email'})}return Response.json({last_event:'delivered'})}) as typeof fetch;
 await Promise.all([advanceSandboxReceipt(f.db,client,f.row(),true),advanceSandboxReceipt(f.db,client,f.row(),true)]);
 assert(sent===1&&f.row().void_email_status==='delivered'&&f.row().email_status==='delivered','independent delivery states');
 }finally{globalThis.fetch=original}
});
