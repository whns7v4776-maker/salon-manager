/* Execute the real Edge handler with database/provider boundaries isolated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'supabase/functions/_shared/booking-payment.ts');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const handlerExports = {};
let holderReads = 0;
const sandbox = {
  exports: handlerExports,
  module: { exports: handlerExports },
  require(name) {
    assert.equal(name, './booking-payment-hold.ts');
    return {
      refreshCustomerBookingPaymentHolds: async () => { holderReads++; },
      publicBookingPaymentHold: async () => { throw new Error('Unexpected hold access'); },
    };
  },
};
vm.runInNewContext(compiled.outputText, sandbox, { filename: file });
const { publicBookingPayment, BookingPaymentAuthenticationRequiredError } = handlerExports;
const requestId = '01234567-1234-1234-1234-0123456789ab';
const identity = { salonCode: 'fixture-salon', email: 'fixture@example.invalid', phone: '0000000000' };
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({ policy = { mode: 'salon', percent: 0 }, verified = false, allowed = true,
  scopeError = null, verifiedError = null, scopeFound = true, noticeItems = [] } = {}) {
  const calls = [];
  const context = { workspaceId: 'fixture-workspace', customerId: 'fixture-customer', policy,
    privateCustomerDetail: 'must-not-leave-server', totalCents: 9900 };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'booking_payment_customer_context') return { data: scopeFound ? context : null, error: scopeError };
      if (name === 'verified_booking_payment_context') return { data: verified ? context : null, error: verifiedError };
      if (name === 'customer_booking_payment_notices') return { data: noticeItems, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(name) { throw new Error(`Unexpected table read: ${name}`); },
  };
  const invoke = (operation = 'quote', extra = {}) => publicBookingPayment({
    admin, stripe: null, live: true, enabled: true, allowed: () => allowed,
    body: { ...identity, operation, paymentToken: '', ...extra },
  });
  return { invoke, calls };
}

const completed = [];
const test = async (name, run) => { await run(); completed.push(name); };
const requiresAuth = async promise => assert.rejects(promise, error => {
  assert(error instanceof BookingPaymentAuthenticationRequiredError);
  assert.equal(error.code, 'auth_required');
  assert.equal(error.message, 'Verifica la password per accedere ai pagamenti.');
  return true;
});

(async () => {
  await test('legacy salon quote returns only the safe policy without token or data access', async () => {
    const f = fixture();
    assert.deepEqual(plain(await f.invoke()), { enabled: true, policy: { mode: 'salon', percent: 0 } });
    assert.deepEqual(f.calls.map(c => c.name), ['booking_payment_customer_context']);
    assert.equal(holderReads, 0);
  });
  await test('public salon quote ignores caller money and policy values', async () => {
    const f = fixture();
    assert.deepEqual(plain(await f.invoke('quote', { totalCents: 1, mode: 'full', percent: 100 })),
      { enabled: true, policy: { mode: 'salon', percent: 0 } });
  });
  for (const policy of [{ mode: 'full', percent: 100 }, { mode: 'deposit', percent: 50 }]) {
    await test(`${policy.mode} quote stays protected`, async () => {
      const f = fixture({ policy });
      await requiresAuth(f.invoke());
      assert.deepEqual(f.calls.map(c => c.name), ['booking_payment_customer_context', 'verified_booking_payment_context']);
    });
    await test(`${policy.mode} customer override cannot be bypassed by a caller salon policy`, async () => {
      const f = fixture({ policy });
      await requiresAuth(f.invoke('quote', { mode: 'salon', percent: 0, policy: { mode: 'salon', percent: 0 } }));
    });
    await test(`${policy.mode} authenticated quote preserves the effective policy`, async () => {
      const f = fixture({ policy, verified: true });
      assert.deepEqual(plain(await f.invoke('quote', { paymentToken: 'fixture-token' })), { enabled: true, policy });
    });
  }
  for (const operation of ['summary', 'check', 'checkout', 'cancel']) {
    await test(`${operation} without a request stays protected for salon policy`, async () => {
      const f = fixture();
      await requiresAuth(f.invoke(operation));
      assert.equal(f.calls.length, 2);
    });
    await test(`${operation} with a request stays protected for salon policy`, async () => {
      const f = fixture();
      await requiresAuth(f.invoke(operation, { requestId }));
      assert.equal(f.calls.length, 2);
    });
  }
  await test('salon quote for a specific request stays protected', async () => {
    const f = fixture();
    await requiresAuth(f.invoke('quote', { requestId }));
  });
  await test('present but empty requestId cannot enter the anonymous quote branch', async () => {
    const f = fixture();
    await requiresAuth(f.invoke('quote', { requestId: '' }));
  });
  await test('pending registration is blocked by authoritative scope before quote or token', async () => {
    const f = fixture({ scopeError: { message: 'customer_registration_pending' } });
    await assert.rejects(f.invoke(), /customer_registration_pending/);
    assert.deepEqual(f.calls.map(c => c.name), ['booking_payment_customer_context']);
  });
  await test('disabled workspace remains disabled before any public quote', async () => {
    const f = fixture({ allowed: false });
    assert.deepEqual(plain(await f.invoke()), { enabled: false });
    assert.equal(f.calls.length, 1);
  });
  await test('missing customer scope never receives an enabled quote', async () => {
    const f = fixture({ scopeFound: false });
    assert.deepEqual(plain(await f.invoke()), { enabled: false });
    assert.equal(f.calls.length, 1);
  });
  for (const policy of [{ mode: 'salon', percent: 1 }, { mode: 'salon', percent: '0' }, null, {}]) {
    await test(`invalid or nonzero salon policy ${JSON.stringify(policy)} stays protected`, async () => {
      const f = fixture({ policy });
      await requiresAuth(f.invoke());
    });
  }
  await test('verification transport failures are not reclassified as auth_required', async () => {
    const f = fixture({ policy: { mode: 'deposit', percent: 50 }, verifiedError: { message: 'fixture-transport-failure' } });
    await assert.rejects(f.invoke(), error => error.message === 'fixture-transport-failure' && error.code !== 'auth_required');
  });
  await test('authenticated summary still reads authoritative notices', async () => {
    const f = fixture({ verified: true, noticeItems: [{ requestId, dueCents: 500 }] });
    assert.deepEqual(plain(await f.invoke('summary', { paymentToken: 'fixture-token' })),
      { enabled: true, items: [{ requestId, dueCents: 500 }] });
    assert.deepEqual(f.calls.map(c => c.name), ['booking_payment_customer_context', 'verified_booking_payment_context', 'customer_booking_payment_notices']);
    assert.equal(holderReads, 1);
  });
  process.stdout.write(JSON.stringify({ passed: completed.length, tests: completed }, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
