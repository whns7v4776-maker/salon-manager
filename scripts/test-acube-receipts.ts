import assert from 'node:assert/strict';
import { buildReceipt, createAcubeSandboxClient, AcubeUncertainSubmission } from '../supabase/functions/_shared/acube-receipts';
const input = { fiscalId: '12345678901', description: 'Servizio di prova', amountCents: 2550, vatCode: '22', method: 'electronic' as const };
assert.equal(buildReceipt(input).electronic_payment_amount, 25.5);
assert.equal(buildReceipt({ ...input, method: 'cash' }).cash_payment_amount, 25.5);
assert.throws(() => buildReceipt({ ...input, amountCents: 0 }));
assert.throws(() => buildReceipt({ ...input, amountCents: 25.5 }));
assert.throws(() => buildReceipt({ ...input, vatCode: '' }));
let calls = 0;
const token = (environment = 'sandbox', exp = Math.floor(Date.now()/1000)+60) => 'test.' + Buffer.from(JSON.stringify({ environment, exp })).toString('base64url') + '.test';
assert.throws(() => createAcubeSandboxClient(token('production')));
assert.throws(() => createAcubeSandboxClient(token('sandbox', 1)));
const client = createAcubeSandboxClient(token(), async (url) => {
  calls++; assert.match(String(url), /^https:\/\/api-sandbox\.acubeapi\.com\//);
  throw new Error('timeout');
});
(async () => {
 await assert.rejects(client.submit(input), AcubeUncertainSubmission);
 assert.equal(calls, 1, 'Uncertain fiscal issuance must never retry automatically');
 const id = '5ee0c497-970b-41d5-bb3e-6fd05022ce76';
 const invalid = createAcubeSandboxClient(token(), async () => new Response(JSON.stringify({ uuid: id, fiscal_id: input.fiscalId, status: 'unexpected' })));
 await assert.rejects(invalid.submit(input), AcubeUncertainSubmission);
 const pdf = createAcubeSandboxClient(token(), async () => new Response('%PDF-1.4 test'));
 assert.equal((await pdf.pdf(id)).length, 13);
 const invalidPdf = createAcubeSandboxClient(token(), async () => new Response('<html>Error</html>'));
 await assert.rejects(invalidPdf.pdf(id), /PDF documento non valido/);
 console.log('PASS: amounts, required fiscal inputs, sandbox-only destination, no blind retry');
})();
