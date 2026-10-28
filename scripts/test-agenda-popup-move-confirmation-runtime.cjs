const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.resolve(process.argv[2] || 'app/(tabs)/agenda.tsx');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['confirmWeekAppointmentEdit', 'presentWeekInteractionConfirmation', 'closeWebWeekDragConfirmation'];
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
    callbacks[node.name.getText(ast)] = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of names) assert(callbacks[name], `${name}: callback reale`);
const compiled = ts.transpileModule(
  names.map(name => `var ${name} = ${callbacks[name]};`).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
).outputText;

function fixture(platform) {
  const original = { id: 'technical-only', data: '2099-01-01', ora: '09:00', operatoreId: 'op-1', operatoreNome: 'Operatore 1', cliente: 'Cliente tecnico', servizio: 'Servizio tecnico' };
  const unrelated = { id: 'unrelated', data: '2099-01-03', ora: '11:00' };
  let appointments = [original, unrelated];
  let details = original;
  let editOpen = true;
  let confirmation = null;
  const history = [];
  const requests = [];
  const pending = [];
  const clearedGuards = [];
  const clearedPositions = [];
  const noop = () => {};
  const context = {
    IS_WEB: platform === 'web',
    isWeekAppointmentEditPlacementAvailable: () => true,
    weekAppointmentEditDraft: original,
    weekAppointmentEditDate: '2099-01-02',
    weekAppointmentEditTime: '10:00',
    weekAppointmentEditMoveOptions: [{ time: '10:00' }],
    selectedWeekAppointmentEditOperator: platform === 'web' ? null : { id: 'op-2', nome: 'Operatore 2' },
    getWeekAppointmentTemporalState: () => 'future',
    appuntamenti: appointments,
    todayDate: '2099-01-01',
    salonWorkspace: { salonCode: 'synthetic-only' },
    webWeekDragConfirmationActionInFlightRef: { current: false },
    registerMovedAppointmentOldSlotGuard: () => ['guard'],
    registerMovedAppointmentOptimisticPosition: noop,
    clearMovedAppointmentOldSlotGuard: keys => clearedGuards.push(keys),
    clearMovedAppointmentOptimisticPosition: id => clearedPositions.push(id),
    isAgendaAppointmentRecentlySuppressedDeleted: () => false,
    closeWeekAppointmentEditModal: () => { editOpen = false; },
    closeWeekAppointmentDetails: () => { details = null; },
    setData: noop,
    setCalendarMonth: noop,
    setWeekSwapPreview: noop,
    setWeekAppointmentDetails: update => { details = update(details); },
    setWebWeekDragConfirmation(update) { confirmation = typeof update === 'function' ? update(confirmation) : update; },
    setAppuntamenti(update) {
      appointments = typeof update === 'function' ? update(appointments) : update;
      history.push(appointments[0].data);
    },
    moveOwnerAppointmentForSalon(input) {
      requests.push(input);
      return new Promise(resolve => pending.push(resolve));
    },
    requestAnimationFrame: action => action(),
    haptic: { medium: async () => {}, success: async () => {} },
    Alert: { alert() { throw new Error('Avviso non raggiungibile sul web / alert nativo non previsto per un rifiuto del server'); } },
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  return {
    context, original, unrelated, requests, history, clearedGuards, clearedPositions,
    get state() { return appointments; },
    get confirmation() { return confirmation; },
    start() { context.confirmWeekAppointmentEdit(); },
    async reply(result) {
      assert(pending.length, 'Una sola RPC in attesa della risposta simulata');
      pending.shift()(result);
      await new Promise(resolve => setImmediate(resolve));
    },
    click(text) {
      const index = confirmation.buttons.findIndex(button => button.text === text);
      assert(index >= 0, `Pulsante ${text} disponibile`);
      context.closeWebWeekDragConfirmation(confirmation.buttons[index], index);
    },
    assertPromptVisible(title) {
      assert.equal(editOpen, false, 'Il popup modifica è chiuso prima dell’avviso');
      assert.equal(details, null, 'I dettagli non coprono l’avviso');
      assert.equal(confirmation?.title, title);
      assert.equal(confirmation?.kind, 'move');
    },
  };
}

(async () => {
  const results = [];
  for (const platform of ['web', 'ios', 'android']) {
    const unavailable = fixture(platform);
    unavailable.context.isWeekAppointmentEditPlacementAvailable = () => false;
    unavailable.start();
    unavailable.assertPromptVisible('Orario non più disponibile');
    assert.equal(unavailable.requests.length, 0, 'A stale target never reaches the server');
    assert.equal(unavailable.state[0], unavailable.original);
    const success = fixture(platform);
    success.start();
    assert.equal(success.state[0].data, '2099-01-02');
    await success.reply({ ok: true });
    assert.equal(success.confirmation, null, 'Nessun nuovo avviso quando lo spostamento riesce');
    assert.equal(success.state[0].data, '2099-01-02');
    assert.equal(success.state[1], success.unrelated);
    assert.equal(success.requests[0].allowOverlap, false);
    assert.equal(success.requests[0].enforceCustomerOverlap, true);
    assert.equal(success.requests[0].nextOperatorId, platform === 'web' ? 'op-1' : 'op-2');

    for (const [errorCode, title] of [
      ['operator_overlap', 'Sovrapposizione rilevata'],
      ['customer_time_overlap', 'Cliente già impegnato'],
      ['unexpected', 'Spostamento non riuscito'],
    ]) {
      const rejected = fixture(platform);
      rejected.start();
      await rejected.reply({ ok: false, errorCode, error: 'Errore tecnico di prova' });
      assert.equal(rejected.state[0], rejected.original);
      assert.equal(rejected.state[1], rejected.unrelated);
      rejected.assertPromptVisible(title);
      assert.equal(rejected.clearedGuards.length, 1);
      assert.equal(rejected.clearedPositions.length, 1);
      if (errorCode === 'unexpected') {
        assert.equal(rejected.confirmation.message, 'Errore tecnico di prova');
        rejected.click('OK');
      } else rejected.click('Annulla');
      assert.equal(rejected.confirmation, null);
      assert.equal(rejected.requests.length, 1, 'Annulla/OK non ripete lo spostamento');
    }

    for (const errors of [['operator_overlap', 'customer_time_overlap'], ['customer_time_overlap', 'operator_overlap']]) {
      const forced = fixture(platform);
      forced.start();
      for (const errorCode of errors) {
        await forced.reply({ ok: false, errorCode });
        forced.click('Forza comunque');
        assert.equal(forced.confirmation, null, 'La conferma si chiude prima del nuovo tentativo');
      }
      assert.equal(forced.requests.length, 3);
      assert.equal(forced.requests[1].allowOverlap, errors[0] === 'operator_overlap');
      assert.equal(forced.requests[1].allowCustomerOverlap, errors[0] === 'customer_time_overlap');
      assert.equal(forced.requests[2].allowOverlap, true);
      assert.equal(forced.requests[2].allowCustomerOverlap, true);
      assert.equal(forced.requests[2].enforceCustomerOverlap, true);
      await forced.reply({ ok: true });
      assert.equal(forced.state[0].data, '2099-01-02');
      assert.equal(forced.state[0].ora, '10:00');
      assert.equal(forced.state[1], forced.unrelated);
    }
    results.push(`${platform}: successo, due conflitti, errore, Annulla/OK e doppia conferma esplicita`);
  }
  console.log('PASS popup spostamento — callback e conferma reali, RPC/stato fittizi; nessun accesso alla rete.');
  console.log(results.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
