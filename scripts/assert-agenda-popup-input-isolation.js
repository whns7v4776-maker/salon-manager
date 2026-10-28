/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const customerForm = sliceBetween(
  'const QuickCustomerComposerForm = React.memo(',
  'type DeferredPopupSearchInputProps =',
  'Agenda customer form boundary',
);
assert.match(
  customerForm,
  /const \[draft, setDraft\] = useState<QuickCustomerDraft>/,
  'Agenda +Cliente must own its text draft below AgendaScreen.',
);
assert.match(
  customerForm,
  /const \[errors, setErrors\] = useState<QuickCustomerErrors>/,
  'Agenda +Cliente validation errors must stay in the isolated form.',
);
for (const field of ['firstName', 'lastName', 'phone', 'email', 'instagram']) {
  assert.match(
    customerForm,
    new RegExp(`value=\\{draft\\.${field}\\}`),
    `Agenda +Cliente ${field} must read from its local draft.`,
  );
}
assert.match(
  customerForm,
  /onPress=\{\(\) => onSubmit\(draftRef\.current\)\}/,
  'Agenda +Cliente must publish its current draft only on save.',
);

const customerSaves = sliceBetween(
  'const addCustomerFromQuickBooking = useCallback(',
  'const resetQuickCustomerComposer = useCallback(',
  'Agenda customer save paths',
);
assert.match(
  customerSaves,
  /addCustomerFromQuickBooking[\s\S]*?createClientePersisted\(\{[\s\S]*?nome: nextCustomerName[\s\S]*?telefono: draft\.phone\.trim\(\)[\s\S]*?birthday: normalizeBirthdayValue\(quickCustomerBirthdayInput\)/,
  'Quick booking must keep the existing persisted customer payload.',
);
assert.match(
  customerSaves,
  /setQuickBookingCustomerId\(result\.customer\.id\)/,
  'Quick booking must select only the server-confirmed customer id.',
);
assert.match(
  customerSaves,
  /addCustomerFromAgenda[\s\S]*?createClientePersisted\(\{[\s\S]*?nome: nextCustomerName[\s\S]*?telefono: draft\.phone\.trim\(\)[\s\S]*?birthday: normalizeBirthdayValue\(agendaCustomerBirthdayInput\)/,
  'Standalone Agenda +Cliente must keep the existing persisted payload.',
);
assert.match(
  customerSaves,
  /setClienteId\(result\.customer\.id\)/,
  'Standalone Agenda +Cliente must select only the server-confirmed customer id.',
);

const searchBoundary = sliceBetween(
  'const DeferredPopupSearchInput = React.memo(',
  'type AgendaServiceTextDraft =',
  'Agenda popup search boundary',
);
assert.match(searchBoundary, /const \[localValue, setLocalValue\] = useState\(value\)/);
assert.match(searchBoundary, /commitTimerRef\.current = setTimeout\(/);
assert.match(searchBoundary, /onBlur=\{\(event\) => \{\s*flushPendingValue\(\)/);

const serviceBoundary = sliceBetween(
  'const BufferedPopupTextInput = React.memo(',
  'type BufferedPopupPlainTextInputProps =',
  'Agenda service draft boundary',
);
assert.match(serviceBoundary, /const \[localValue, setLocalValue\] = useState\(value\)/);
assert.match(serviceBoundary, /onDraftChange\(nextValue\)/);
assert.match(serviceBoundary, /onBlur=\{\(event\) => \{\s*commit\(\)/);

const operatorBoundary = sliceBetween(
  'const BufferedPopupPlainTextInput = React.memo(',
  'type QuickBookingPackagePlanItem =',
  'Agenda operator-block draft boundary',
);
assert.match(operatorBoundary, /const \[localValue, setLocalValue\] = useState\(value\)/);
assert.match(operatorBoundary, /onDraftChangeRef\.current\(nextValue\)/);

assert.ok(
  (source.match(/<DeferredPopupSearchInput/g) ?? []).length >= 3,
  'All reachable Agenda service/customer searches must use the deferred boundary.',
);
assert.ok(
  (source.match(/<BufferedPopupTextInput/g) ?? []).length >= 6,
  'Reachable Agenda service fields must use the local draft boundary.',
);
assert.match(
  source,
  /<BufferedPopupPlainTextInput[\s\S]{0,800}?operatorLaneBlockLabelRef\.current = value/,
  'The operator-block reason must update only its lightweight draft while typing.',
);

const serviceSave = sliceBetween(
  'const addServiceFromAgenda = useCallback(',
  'const confirmQuickBookingPackage = useCallback(',
  'Agenda service save path',
);
assert.match(
  serviceSave,
  /const serviceTextDraft = agendaServiceTextDraftRef\.current/,
  'Agenda service save must consume the latest local draft.',
);
assert.match(
  serviceSave,
  /const nextServiceName = draftServiceNameInput\.trim\(\)/,
);
assert.match(serviceSave, /nome: nextServiceName/);
assert.match(
  serviceSave,
  /descrizione: agendaServiceSaveToCatalog[\s\S]*?draftServiceDescriptionInput\.trim\(\)/,
);
assert.match(
  serviceSave,
  /badgeCliente: agendaServiceSaveToCatalog[\s\S]*?normalizeServiceClientBadge\(draftServiceBadgeInput\)/,
);

const operatorSave = sliceBetween(
  'const saveOperatorLaneBlock = useCallback(',
  'const promptHistoricalLaneCleanup = useCallback(',
  'Agenda operator block save path',
);
assert.match(
  operatorSave,
  /label: operatorLaneBlockLabelRef\.current/,
  'Operator-block save must consume the latest local reason.',
);

console.log('Agenda popup input isolation contracts: OK');
