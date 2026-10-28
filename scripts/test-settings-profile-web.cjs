// Exercises the profile controller with isolated React hook state and no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}, append = '') {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + append, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => deps[name] || {}, Date, Error });
  return exports;
}
const platform = load('src/lib/platform.ts');
const validators = load('src/lib/validators.ts');
const fixture = () => ({ id: 'isolated-salon', salonName: 'Studio prova', activityCategory: 'BARBER', streetType: 'VIA', streetName: 'ROMA', streetNumber: '1', city: 'MILANO', postalCode: '20100', businessPhone: '3331234567', additionalPhones: [], ownerEmail: 'owner@isolated.test', salonNameFontVariant: 'cinzel', salonNameDisplayStyle: 'corsivo', subscription: { plan: 'pro' }, untouched: 'preserve' });
function setup() {
  let slots = [], cursor = 0, effects = [], model, calls = [], pending = null;
  const memo = (fn, deps) => {
    const i = cursor++, old = slots[i];
    if (!old || !deps || deps.some((d, k) => !Object.is(d, old.deps[k]))) slots[i] = { value: fn(), deps };
    return slots[i].value;
  };
  const react = {
    createContext: () => ({}),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo: memo,
    useEffect: (fn, deps) => memo(() => { effects.push(fn); }, deps),
  };
  const context = { salonWorkspace: fixture(), servizi: [], operatori: [], ownerServerSyncReady: true,
    updateSalonWorkspacePersisted: async (update, options) => { calls.push({ update, options }); if (pending) await pending; context.salonWorkspace = update(context.salonWorkspace); },
  };
  const hook = load('components/settings-salon-profile-web.tsx', {
    react, '../src/context/AppContext': { useAppContext: () => context }, '../src/lib/platform': platform, '../src/lib/validators': validators,
  }, '\nexport { useProfileController };').useProfileController;
  const render = () => { cursor = 0; model = hook(); const queued = effects; effects = []; queued.forEach(fn => fn()); return model; };
  render();
  return { context, calls, render, get model() { return model; }, defer(value) { pending = value; } };
}
(async () => {
  let h = setup();
  h.model.change('name', ''); h.render(); await h.model.save(); h.render();
  assert.equal(h.calls.length, 0); assert.match(h.model.error, /Completa/);
  h.model.change('name', 'Studio prova'); h.model.change('phone', '123'); h.render(); await h.model.save(); h.render();
  assert.equal(h.calls.length, 0); assert.match(h.model.error, /telefono valido/);
  h.model.change('phone', '3331234567'); h.model.change('name', '  Nuovo Studio  '); h.model.change('city', ' torino '); h.render();
  await h.model.save(); h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.requireRemoteProfileConfirmation, true);
  assert.equal(h.context.salonWorkspace.salonName, 'Nuovo Studio'); assert.equal(h.context.salonWorkspace.city, 'TORINO');
  for (const key of ['ownerEmail', 'salonNameFontVariant', 'salonNameDisplayStyle', 'untouched']) assert.equal(h.context.salonWorkspace[key], fixture()[key]);
  assert.equal(h.model.dirty, false); assert.match(h.model.message, /Profilo salvato/);
  h.model.change('name', 'Bozza'); h.render(); h.context.salonWorkspace = { ...h.context.salonWorkspace, updatedAt: 'external-refresh' }; h.render();
  assert.equal(h.model.draft.name, 'Bozza'); // Unrelated refresh does not erase editing.
  h.model.setDraft(h.model.saved); h.render(); assert.equal(h.model.dirty, false);
  h.model.change('name', 'Ancora bozza'); h.render(); h.context.salonWorkspace = { ...fixture(), id: 'other-salon', salonName: 'Altro salone' }; h.render(); h.render();
  assert.equal(h.model.draft.name, 'Altro salone');
  h = setup(); let release; h.defer(new Promise(resolve => { release = resolve; }));
  h.model.change('name', 'Prova lock'); h.render(); const saving = h.model.save(); await h.model.save();
  assert.equal(h.calls.length, 1); release(); await saving; h.render(); assert.equal(h.model.busy, false);
  h = setup(); h.model.change('name', 'Non salvato'); h.render(); h.defer(Promise.reject(new Error('Conferma server assente')));
  await h.model.save(); h.render(); assert.match(h.model.error, /Conferma server assente/); assert.equal(h.model.message, ''); assert.equal(h.model.dirty, true);
  h = setup(); h.context.ownerServerSyncReady = false; h.model.change('name', 'Offline'); h.render(); await h.model.save(); assert.equal(h.calls.length, 0);
  console.log('PASS: validation, confirmed save, identity preservation, draft refresh/reset, double submission, failure and offline guard. No salon data written.');
})().catch(error => { console.error(error); process.exitCode = 1; });
