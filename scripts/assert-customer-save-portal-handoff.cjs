const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const save = source.split('const updateClientePersisted = async (')[1]
  .split('const saveCustomerServiceDurationOverride')[0];
const start = save.indexOf('void enqueuePortalPublish(');
assert.ok(start > save.indexOf('if (!serverDidConfirmCustomerFields)'));
assert.ok(start > save.indexOf('setRichiestePrenotazione(nextRichieste)'));
assert.ok(!save.includes('await enqueuePortalPublish('));
const end = save.indexOf('return { ok: true as const };', start);
assert.ok(end > start);
const body = ts.transpile(save.slice(start, end) + 'return { ok: true };');
const refs = ['salonWorkspaceRef', 'clientiRef', 'appuntamentiRef', 'serviziRef',
  'operatoriRef', 'richiestePrenotazioneRef', 'availabilitySettingsRef',
  'serviceCardColorOverridesRef', 'roleCardColorOverridesRef'];
const run = new Function('enqueuePortalPublish', ...refs, body);
let calls = 0;
const result = run(() => { calls++; return new Promise(() => {}); },
  ...refs.map(() => ({ current: {} })));
assert.equal(calls, 1);
assert.equal(result.ok, true, 'A pending portal publication must not hold the editor open');
console.log('PASS customer save: server guards retained, pending portal queue does not block completion');
