// Local React fixtures. No network, salon writes, payments or device claims.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://native-services.test' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); const { act } = React; const h = React.createElement;
const { createRoot } = require('react-dom/client');
const calls = []; let night = false;
const rn = {
 View: ({ children }) => h('div', null, children),
 Text: ({ children }) => h('span', null, children), Image: () => null,
 Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState }) => h('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel, 'aria-selected': accessibilityState?.selected, 'aria-expanded': accessibilityState?.expanded }, children),
 TextInput: ({ accessibilityLabel, value, onChangeText }) => h('input', { 'aria-label': accessibilityLabel, value, onInput: e => onChangeText(e.currentTarget.value) }),
 ScrollView: ({ children, horizontal }) => h('div', { 'data-horizontal': !!horizontal }, children),
};
const appearance = { useAccessAppearance: () => ({ palette: { night, ink: night ? '#fff' : '#222', muted: '#888', field: '#ddd', surface: '#eee', border: '#bbb', line: '#aaa', action: '#ccb58e', actionText: '#222' } }) };
const deps = { './ui/info-button': {InfoButton: ({onPress,accessibilityLabel,accessibilityState}) => h('button',{onClick:onPress,'aria-label':accessibilityLabel,'aria-expanded':accessibilityState?.expanded},'i')}, 'react-native-gesture-handler/ReanimatedSwipeable': {__esModule:true,default:React.forwardRef(({children},ref)=>h('div',null,children))}, react: React, 'react-native': rn, '@expo/vector-icons': { Ionicons: () => null }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) }, './access-premium': appearance,
 './owner-native-premium': { NativeReadableText: rn.Text, nativeSerif: 'Georgia', NativeSectionHeader: ({ title, action, onPress }) => h('header', null, title, action && h('button', { onClick: onPress }, action)) },
 './native-settings-popup': { NativeSettingsPopup: ({ title, onClose, children, footer }) => h('section', { role: 'dialog' }, h('h2', null, title), children, footer, h('button', { onClick: onClose }, 'Chiudi')) },
 './services-native-premium': { NativeServiceCatalogCard: ({ name, onEdit }) => h('button', { onClick: onEdit }, name) },
};
const exportsScope = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/services-native-workspace.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports: exportsScope, require: id => { assert.ok(deps[id], `Unexpected dependency ${id}`); return deps[id]; }, Intl, Math, Set });
const Component = exportsScope.ServicesNativeWorkspace;
const record = label => () => calls.push(label);
const model = {
 active: true, services: [{ id: 'a', name: 'Taglio e piega professionale', role: 'Hair Stylist', online: true, onEdit: record('edit-service') }, { id: 'b', name: 'Barba', role: 'Barber', online: true }, { id: 'c', name: 'Servizio archiviato', role: 'Barber', online: false }],
 operators: [{ id: 'op', name: 'Francesco Operatore', role: 'Barber', availability: 'Lun · Mar · Sab', competencies: 'Tutti i servizi del mestiere', onEdit: record('edit-operator'), onArchive: record('archive-operator'), onPhoto: record('photo'), onDelete: record('delete-operator') }], archivedOperators: [],
 compositions: [{ id: 'comp', name: 'Percorso completo', phases: 3, online: false, active: true, split: false, onSplit: record('split'), onArchive: record('archive-composition') }],
 order: [{ key: 'role:barber', name: 'Barber', items: [{ id: 'a', name: 'Barba' }, { id: 'b', name: 'Taglio' }] }, { key: 'role:hair', name: 'Hair Stylist', items: [] }], orderBusy: false, onOrder: (...args) => calls.push(args), roleColor: () => '#abcdef',
 colors: { mode: 'role', roles: ['Barber'], role: 'Barber', services: [], service: '', value: '#abcdef', draft: '#abcdef', palette: ['#abcdef'], canApply: true, busy: false, onMode: record('mode'), onRole: record('role'), onService: record('service-target'), onPick: record('pick'), onDraft: record('draft'), onApply: record('apply-color'), onReset: record('reset-colors'), onUniform: record('uniform-color') },
 custom: { enabled: false, busy: false, title: 'Su misura', message: 'Concorda la prestazione', whatsapp: 'Salve', onToggle: record('custom-toggle'), onTitle: record('custom-title'), onMessage: record('custom-message'), onWhatsapp: record('custom-whatsapp'), onSave: record('custom-save') },
 onCreateService: record('create-service'), onCreateOperator: record('create-operator'), onCreateComposition: record('create-composition'),
};
const root = createRoot(document.getElementById('root'));
const click = async label => { const button = [...document.querySelectorAll('button')].find(e => e.textContent === label || e.getAttribute('aria-label') === label); assert.ok(button, `Missing ${label}`); await act(async () => button.click()); };
const text = () => document.body.textContent;
const render = () => act(async () => root.render(h(Component, model)));
(async () => {
 for (night of [false, true]) {
  await render(); assert.equal(document.querySelector('[role=dialog]'), null); assert.ok(document.querySelector('[data-horizontal=true]'), 'filters scroll horizontally');
  await click('Nuovo servizio'); await click('Taglio e piega professionale'); assert.ok(calls.includes('edit-service'));
  await click('Archivio'); assert.ok(text().includes('Servizio archiviato')); assert.ok(!text().includes('Taglio e piega professionale')); await click('Online');
  await click('Barber'); assert.ok(!text().includes('Taglio e piega professionale')); await click('Tutti i mestieri');
  await click('Operatori'); await click('Nuovo operatore'); if(!text().includes('Tutti i servizi del mestiere')) await click('Dettagli Francesco Operatore'); assert.ok(text().includes('Tutti i servizi del mestiere')); await click('Modifica'); assert.ok(calls.includes('edit-operator'));
  await click('Organizzazione'); assert.equal(document.querySelector('[role=dialog]'), null);
  await click('Composizioni'); if(!text().includes('Consenti più operatori')) await click('Percorso completo3 fasi · Solo salone'); await click('Consenti più operatori'); assert.ok(calls.includes('split')); await click('Nuova composizione'); assert.ok(calls.includes('create-composition')); assert.equal(document.querySelector('[role=dialog]'), null);
  await click('Servizi su misura'); await click('Mostra ai clienti'); await click('Salva testi'); assert.ok(calls.includes('custom-save')); await click('Chiudi');
  await click('Ordine del listino'); await click('Mestieri'); await click('Sposta in alto Hair Stylist'); assert.deepEqual(calls.at(-1), ['roles', 1, 0]); await click('Barber'); await click('Sposta in alto Taglio'); assert.deepEqual(calls.at(-1), ['role:barber', 1, 0]); await click('Chiudi');
  await click('Colori agenda'); await click('Applica colore'); assert.ok(calls.includes('apply-color')); await click('Chiudi');
  await click('Listino');
 }
 await act(async () => root.unmount());
 console.log('PASS native Services workspace: horizontal filters, archive/search routes, creation/edit callbacks, operator details, compositions, custom settings, order keys and colors in both themes. Local React fixtures; no device or server-write proof.');
})().catch(error => { console.error(error); process.exitCode = 1; });
