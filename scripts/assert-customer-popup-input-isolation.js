/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const clientiSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'clienti.tsx'),
  'utf8',
);

const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const customerCreatorForm = sliceBetween(
  clientiSource,
  'const CustomerCreatorForm = React.memo(',
  '/** Keeps edit keystrokes and validation feedback out of ClientiScreen. */',
);
assert.match(
  customerCreatorForm,
  /useState<CustomerEditorDraft>\(buildEmptyCustomerDraft\)/,
  'The create form must initialize its own customer draft.',
);
assert.match(
  customerCreatorForm,
  /const draftRef = useRef\(draft\)[\s\S]*?draftRef\.current = nextDraft;[\s\S]*?setDraft\(nextDraft\)/,
  'The create form must retain the exact latest keystroke without publishing it to ClientiScreen.',
);
assert.match(
  customerCreatorForm,
  /const \[errors, setErrors\] = useState<CustomerFormErrors>\(\{\}\)/,
  'The create form must own its validation errors.',
);
for (const field of [
  'nome',
  'cognome',
  'telefono',
  'email',
  'instagram',
  'notaCliente',
]) {
  assert.match(
    customerCreatorForm,
    new RegExp(`value=\\{draft\\.${field}\\}`),
    `The create form field ${field} must read from the local draft.`,
  );
}
assert.match(
  customerCreatorForm,
  /if \(!visible\) return null;[\s\S]*?onPress=\{\(\) => void onSubmit\(draftRef\.current\)\}/,
  'The always-mounted create form must preserve its draft while collapsed and publish it only on submit.',
);
assert.match(
  customerCreatorForm,
  /reset,[\s\S]*?setBirthday: \(value: string\) => updateDraft\('birthday', value\)[\s\S]*?onPress=\{reset\}/,
  'Birthday and clear actions must stay inside the isolated create form.',
);
assert.doesNotMatch(
  customerCreatorForm,
  /\bset(?:Nome|Cognome|Telefono|Email|Instagram|NotaCliente)\b/,
  'Create keystrokes must not write to ClientiScreen state.',
);

assert.match(
  clientiSource,
  /<CustomerCreatorForm[\s\S]*?visible=\{showNewCustomerExpanded\}[\s\S]*?onBirthdayPress=\{setCreateBirthdayPickerValue\}[\s\S]*?onSubmit=\{salvaCliente\}/,
  'The reachable new-customer section must mount the isolated form and preserve its callbacks.',
);
assert.doesNotMatch(
  clientiSource,
  /const \[(?:nome|cognome|telefono|email|instagram|notaCliente|birthday|formErrors),\s*set/,
  'ClientiScreen must not own create-form keystrokes or validation feedback.',
);

const customerEditorForm = sliceBetween(
  clientiSource,
  'const CustomerEditorForm = React.memo(',
  '/** Keeps search echo and filtering inside the reachable online-policy sheet. */',
);
assert.match(
  customerEditorForm,
  /useState<CustomerEditorDraft>\(\(\) =>\s*buildCustomerEditorDraft\(customer\)\s*\)/,
  'The edit popup must initialize its own customer draft.',
);
assert.match(
  customerEditorForm,
  /const \[errors, setErrors\] = useState<CustomerFormErrors>\(\{\}\)/,
  'The edit popup must own its validation errors.',
);
const editorPresentation = fs.readFileSync(path.join(root, 'components', 'customer-editor-premium.tsx'), 'utf8');
assert.match(customerEditorForm, /<CustomerEditorPremiumContent draft=\{draft\}/, 'Presentation must receive the isolated draft.');
assert.match(customerEditorForm, /onChange=\{\(key,value\)=>\{updateDraft\(key,value\)/, 'Presentation edits must update only the local draft.');
assert.match(editorPresentation, /value=\{draft\[key\]\}/, 'Inputs must read the controlled field from the provided draft.');
for (const field of ['nome','cognome','telefono','email','instagram']) {
  assert.ok(editorPresentation.includes("field('"+field+"'"), 'Missing controlled editor field '+field);
}
assert.match(editorPresentation, /value=\{draft\.notaCliente\}/, 'Notes must read the same controlled draft.');
assert.match(customerEditorForm, /onSubmit=\{\(\)=>void onSubmit\(draft\)\}/, 'Only explicit save publishes the local draft.');

assert.doesNotMatch(
  customerEditorForm,
  /\bset(?:Nome|Cognome|Telefono|Email|Instagram|NotaCliente)\b/,
  'Edit keystrokes must not write to ClientiScreen form state.',
);

const editModal = sliceBetween(
  clientiSource,
  'visible={showEditCustomerModal && !!clienteInModifica}',
  'visible={!!customerNoteClient}',
);
assert.match(
  editModal,
  /<CustomerEditorForm[\s\S]*?onSubmit=\{salvaCliente\}/,
  'The reachable edit Modal must mount the isolated form and preserve its save callback.',
);
assert.doesNotMatch(
  editModal,
  /value=\{(?:nome|cognome|telefono|email|instagram|notaCliente)\}/,
  'The edit Modal must not keep root-controlled text inputs.',
);

const editOpener = sliceBetween(
  clientiSource,
  'const apriModificaCliente = useCallback',
  'const apriTempiPersonalizzatiCliente = useCallback',
);
assert.doesNotMatch(
  editOpener,
  /\bset(?:Nome|Cognome|Telefono|Email|Instagram|NotaCliente|Birthday)\(/,
  'Opening edit must not overwrite the normal new-customer form.',
);

const saveCustomer = sliceBetween(
  clientiSource,
  'const salvaCliente = async',
  'const eliminaCliente = useCallback',
);
assert.match(
  saveCustomer,
  /const salvaCliente = async \(activeDraft: CustomerEditorDraft\)[\s\S]*?const editingCustomer = clienteInModifica/,
  'The existing save path must consume either isolated form draft explicitly.',
);
assert.match(
  saveCustomer,
  /customerCreatorFormRef\.current\?\.setErrors\(nextErrors\)[\s\S]*?customerCreatorFormRef\.current\?\.reset\(\)/,
  'Creation validation and successful reset must route back only to the isolated form.',
);
assert.match(
  saveCustomer,
  /const result = await updateClientePersisted\([\s\S]*?id: editingCustomer\.id[\s\S]*?birthday: normalizedBirthday \|\| ''[\s\S]*?nota: normalizedNote/,
  'Editing must preserve the authoritative updateClientePersisted payload.',
);
assert.match(
  saveCustomer,
  /const result = await createClientePersisted\([\s\S]*?maxFutureAppointments: 4[\s\S]*?maxFutureAppointmentsMode: 'monthly'[\s\S]*?maxDailyAppointments: 3/,
  'The normal customer creation contract must remain unchanged.',
);
assert.match(
  saveCustomer,
  /Conferma modifica nome[\s\S]*?confirmedRename/,
  'Renames must retain their confirmation gate.',
);

const onlinePolicySearch = sliceBetween(
  clientiSource,
  'const CustomerOnlinePolicyServiceSearch = React.memo(',
  'export default function ClientiScreen()',
);
assert.match(
  onlinePolicySearch,
  /const \[query, setQuery\] = useState\(''\)/,
  'Online-policy search text must be local to the popup subtree.',
);
assert.match(
  onlinePolicySearch,
  /const deferredQuery = useDeferredValue\(query\)/,
  'Online-policy filtering must use a deferred query.',
);
assert.match(
  onlinePolicySearch,
  /const serviceGroups = useMemo\([\s\S]*?\[deferredQuery, services\]\)/,
  'Online-policy results must be derived inside the isolated subtree.',
);
assert.doesNotMatch(
  clientiSource,
  /const \[onlinePolicySearch, setOnlinePolicySearch\]/,
  'ClientiScreen must not own online-policy search keystrokes.',
);
assert.doesNotMatch(
  clientiSource,
  /onlinePolicyServiceGroups/,
  'Deferred online-policy groups must not be recomputed in ClientiScreen.',
);
assert.match(
  clientiSource,
  /<CustomerOnlinePolicyServiceSearch[\s\S]*?services=\{onlinePolicyServices\}[\s\S]*?overrides=\{onlinePolicyOverrides\}[\s\S]*?setOverrides=\{setOnlinePolicyOverrides\}/,
  'The reachable online-policy sheet must mount the isolated search and retain override ownership.',
);
assert.match(
  clientiSource,
  /saveCustomerOnlineBookingPolicy\([\s\S]*?onlinePolicyMode,[\s\S]*?onlinePolicyOverrides,[\s\S]*?onlinePolicyAllowSameDaySameService/,
  'Online-policy persistence must retain its existing payload.',
);

console.log('Customer popup input isolation contracts: OK');
