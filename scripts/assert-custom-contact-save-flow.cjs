const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const source = fs.readFileSync('app/(tabs)/servizi.tsx', 'utf8');
let callback;
traverse(parser.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }), {
  VariableDeclarator(path) {
    if (path.node.id.name === 'persistCustomServiceContactSettings') callback = path.node.init.arguments[0];
  },
});
assert.ok(callback);
const code = babel.transformSync('module.exports = ' + source.slice(callback.start, callback.end), {
  filename: 'callback.ts', configFile: false, babelrc: false, presets: ['@babel/preset-typescript'],
}).code;
function setup() {
  const saved = { customServiceContactEnabled: true, customServiceContactTitle: 'Saved title', customServiceContactMessage: 'Saved message', customServiceContactWhatsappMessage: 'Saved WhatsApp' };
  const writes = [];
  const context = {
    module: { exports: {} }, console: { log() {} },
    customServiceContactSaveLock: { current: false },
    customServiceContactDraftRevision: { current: 1 },
    customServiceContactDraftDirty: { current: true },
    customServiceContactTitle: ' Draft title ', customServiceContactMessage: 'Draft message', customServiceContactWhatsappMessage: 'Draft WhatsApp',
    salonWorkspace: { businessPhone: '123456789' },
    Alert: { alert() {} }, haptic: { success: async () => {} },
    setCustomServiceContactSaveKind() {}, setCustomServiceContactSaving() {},
    setCustomServiceContactTitle() {}, setCustomServiceContactMessage() {}, setCustomServiceContactWhatsappMessage() {},
    updateAvailabilitySettingsPersisted: async (updater, options) => { writes.push({ next: updater(saved), options }); },
  };
  vm.runInNewContext(code, context);
  return { context, writes, run: context.module.exports };
}
(async () => {
  let s = setup();
  assert.equal(await s.run(false, false), true);
  assert.equal(s.writes[0].next.customServiceContactEnabled, false);
  assert.equal(s.writes[0].next.customServiceContactTitle, 'Saved title');
  assert.equal(s.context.customServiceContactDraftDirty.current, true);
  assert.equal(s.writes[0].options.waitForServerPersistence, true);
  assert.equal(await s.run(true, false), true);
  assert.equal(s.writes[1].next.customServiceContactEnabled, true);
  s = setup();
  assert.equal(await s.run(true, true), true);
  assert.equal(s.writes[0].next.customServiceContactTitle, 'Draft title');
  assert.equal(s.context.customServiceContactDraftDirty.current, false);
  s = setup();
  s.context.updateAvailabilitySettingsPersisted = async () => { s.writes.push('failed'); throw Error('offline'); };
  assert.equal(await s.run(false, false), false);
  assert.equal(s.writes.length, 1, 'Failure must not enqueue a stale rollback write');
  assert.equal(s.context.customServiceContactSaveLock.current, false);
  assert.equal(s.context.customServiceContactDraftDirty.current, true);
  s = setup();
  let release;
  s.context.updateAvailabilitySettingsPersisted = () => new Promise(resolve => { release = resolve; });
  const first = s.run(true, true);
  assert.equal(await s.run(false, false), false, 'Duplicate tap cannot start a competing save');
  s.context.customServiceContactDraftRevision.current += 1;
  release();
  await first;
  assert.equal(s.context.customServiceContactDraftDirty.current, true, 'Edits made during save remain a draft');
  console.log('PASS custom contact: toggle, reactivation, independent drafts, server wait, failure, duplicate taps');
})().catch(error => { console.error(error); process.exitCode = 1; });
