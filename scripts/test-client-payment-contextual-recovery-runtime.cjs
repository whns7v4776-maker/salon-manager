const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/cliente-password.tsx'), 'utf8');
const ast = ts.createSourceFile('cliente-password.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['navigateAfterPasswordSuccess', 'handleSavePassword'];
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    declarations.set(node.name.text, node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
names.forEach(name => assert.ok(declarations.has(name), `${name} must be extracted from the real screen.`));
const compiled = ts.transpileModule(names.map(name => `export const ${name} = ${declarations.get(name)};`).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(overrides = {}) {
  const calls = [], state = {};
  const ctx = {
    exports: {},
    returnToPayment: false,
    mode: 'reset',
    Platform: { OS: 'web' },
    normalizedSalonCode: 'same-salon',
    normalizedEmail: 'same@customer.test',
    normalizedPhone: '3331234567',
    password: 'NewSecret123!',
    busyAction: null,
    otpSent: true,
    otpExpired: false,
    otpCode: '123456',
    verifiedOtpToken: 'verified-otp',
    purpose: 'client_password_reset',
    copy: { success: 'Ordinary success copy.' },
    normalizePhone: value => value.replace(/\D+/g, '').slice(-10),
    validateIdentity: () => true,
    validatePassword: () => true,
    showError: (value, scope) => calls.push({ kind: 'error', value, scope }),
    router: {
      canGoBack: () => true,
      back: () => calls.push({ kind: 'back' }),
      replace: route => calls.push({ kind: 'replace', route: plain(route) }),
    },
    verifyEmailOtp: async args => {
      calls.push({ kind: 'otp', args: plain(args) });
      return { ok: true, token: 'fresh-otp' };
    },
    supabase: { rpc: async (name, args) => {
      calls.push({ kind: 'password-rpc', name, args: plain(args) });
      return { data: { ok: true, telefono: '333 765 4321' }, error: null };
    } },
    saveClientPasswordToVault: async args => calls.push({ kind: 'vault', args: plain(args) }),
    authenticateCustomerPayment: async (identity, password) => {
      calls.push({ kind: 'payment-auth', identity: plain(identity), password });
      return 'verified-payment-token';
    },
    ...overrides,
  };
  for (const name of ['BusyAction', 'Password', 'ConfirmPassword', 'OtpCode', 'VerifiedOtpToken', 'Message', 'MessageTone', 'MessageScope', 'SuccessDialog']) {
    ctx[`set${name}`] = value => { state[name] = value; calls.push({ kind: `set${name}`, value: plain(value) }); };
  }
  vm.runInNewContext(compiled, ctx);
  return { ctx, calls, state, navigate: ctx.exports.navigateAfterPasswordSuccess, save: ctx.exports.handleSavePassword };
}
const records = [];
async function check(name, run) { await run(); records.push({ name, passed: true }); }
(async () => {
  for (const platform of ['web', 'ios', 'android']) {
    await check(`contextual success returns to existing booking on ${platform}`, () => {
      const f = fixture({ returnToPayment: true, Platform: { OS: platform } });
      f.navigate('3337654321');
      assert.deepEqual(f.calls, [{ kind: 'back' }]);
    });
  }
  await check('contextual route opened without history keeps the safe normal fallback', () => {
    const f = fixture({ returnToPayment: true, Platform: { OS: 'ios' }, router: {
      canGoBack: () => false,
      back: () => assert.fail('There is no existing booking route.'),
      replace: route => f.calls.push({ kind: 'replace', route: plain(route) }),
    } });
    f.navigate('3337654321');
    assert.deepEqual(f.calls, [{ kind: 'replace', route: { pathname: '/cliente', params: { salon: 'same-salon', mode: 'booking' } } }]);
  });
  await check('ordinary login and settings success navigation is unchanged on every platform', () => {
    for (const platform of ['web', 'ios', 'android']) for (const mode of ['reset', 'activate']) {
      const f = fixture({ mode, Platform: { OS: platform } });
      f.navigate('3337654321');
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].kind, 'replace');
      const expected = platform === 'web'
        ? { pathname: '/', params: { side: 'client', salon: 'same-salon', ...(mode === 'reset' ? { passwordReset: '1' } : {}) } }
        : mode === 'reset'
          ? { pathname: '/cliente', params: { salon: 'same-salon', mode: 'booking' } }
          : { pathname: '/cliente', params: { salon: 'same-salon', mode: 'booking', autologin: '1', email: 'same@customer.test', phone: '3337654321' } };
      assert.deepEqual(f.calls[0].route, expected);
    }
  });
  await check('verified contextual reset creates access with new password and server-resolved phone', async () => {
    const f = fixture({ returnToPayment: true }); await f.save();
    assert.equal(f.calls.filter(c => c.kind === 'password-rpc').length, 1);
    const auth = f.calls.find(c => c.kind === 'payment-auth');
    assert.deepEqual(auth.identity, { salonCode: 'same-salon', email: 'same@customer.test', phone: '3337654321' });
    assert.equal(auth.password, 'NewSecret123!');
    assert.ok(f.calls.findIndex(c => c.kind === 'password-rpc') < f.calls.indexOf(auth));
    assert.ok(f.calls.indexOf(auth) < f.calls.findIndex(c => c.kind === 'setPassword'));
    assert.match(f.state.SuccessDialog.message, /accesso verificato/);
    assert.equal(f.state.Password, ''); assert.equal(f.state.BusyAction, null);
  });
  await check('payment outage after committed reset remains a password success with clear retry', async () => {
    const f = fixture({ returnToPayment: true, authenticateCustomerPayment: async () => { throw new Error('Network down'); } });
    await f.save();
    assert.equal(f.calls.filter(c => c.kind === 'password-rpc').length, 1);
    assert.equal(f.calls.filter(c => c.kind === 'error').length, 0);
    assert.match(f.state.SuccessDialog.title, /correttamente/);
    assert.match(f.state.SuccessDialog.message, /Password salvata/);
    assert.match(f.state.SuccessDialog.message, /riprova con la nuova password/);
    assert.match(f.state.SuccessDialog.message, /Non serve cambiarla di nuovo/);
    assert.equal(f.state.BusyAction, null);
  });
  await check('contextual storage outage cannot discard an already committed password change', async () => {
    const f = fixture({ returnToPayment: true, saveClientPasswordToVault: async () => { throw new Error('Storage unavailable'); } });
    await f.save();
    assert.ok(f.calls.some(c => c.kind === 'payment-auth'));
    assert.ok(f.state.SuccessDialog);
    assert.equal(f.state.BusyAction, null);
  });
  await check('ordinary reset retains existing success and never starts payment authentication', async () => {
    const f = fixture(); await f.save();
    assert.equal(f.calls.filter(c => c.kind === 'payment-auth').length, 0);
    assert.equal(f.state.SuccessDialog.message, 'Ordinary success copy.');
  });
  await check('rejected password write never authenticates payment or reports success', async () => {
    const f = fixture({ returnToPayment: true, supabase: { rpc: async () => ({ data: null, error: { message: 'customer_password_otp_invalid' } }) } });
    await f.save();
    assert.equal(f.calls.filter(c => ['payment-auth', 'vault'].includes(c.kind)).length, 0);
    assert.equal(f.state.SuccessDialog, undefined);
    assert.equal(f.state.BusyAction, null);
  });
  await check('unverified OTP must be checked before password write or payment access', async () => {
    const f = fixture({ returnToPayment: true, verifiedOtpToken: '', verifyEmailOtp: async () => ({ ok: false, error: 'invalid_code' }), buildOtpErrorMessage: () => 'Codice non corretto.' });
    await f.save();
    assert.equal(f.calls.filter(c => ['password-rpc', 'payment-auth', 'vault'].includes(c.kind)).length, 0);
    assert.equal(f.state.SuccessDialog, undefined);
    assert.equal(f.state.BusyAction, null);
  });
  await check('invalid identity or password stops every server mutation', async () => {
    for (const validation of ['validateIdentity', 'validatePassword']) {
      const f = fixture({ returnToPayment: true, [validation]: () => false }); await f.save();
      assert.deepEqual(f.calls, []);
    }
  });
  assert.match(source, /returnToPayment\?: string \| string\[\]/);
  assert.equal((source.match(/editable=\{!returnToPayment\}/g) ?? []).length, 3, 'Contextual recovery stays scoped to the booking identity.');
  assert.match(source, /returnToPayment \? "Torna alla prenotazione" : "OK"/);
  console.log(JSON.stringify({ allPassed: true, count: records.length, records }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
