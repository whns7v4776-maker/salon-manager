/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const draftBoundary = sliceBetween(
  'type NativeServiceEditTextDraft = {',
  'export default function ServiziScreen()',
  'native draft boundary',
);
assert.match(
  draftBoundary,
  /function NativeEditTextDraftBoundary<[\s\S]*?const \[draft, setDraft\] = useState\(initialDraft\)/,
  'Native service and operator text must be owned below ServiziScreen.',
);
assert.match(
  draftBoundary,
  /setDraft\(\(current\) => \(\{ \.\.\.current, \[key\]: value \}\)\)/,
  'Each keystroke must update only the modal-local draft.',
);

const serviceSave = sliceBetween(
  'const salvaServizio = async (',
  'const avviaModifica =',
  'service save',
);
assert.match(
  serviceSave,
  /nativeTextDraft\?: NativeServiceEditTextDraft/,
  'The existing service save path must accept the native modal draft explicitly.',
);
for (const field of [
  'effectiveNome',
  'effectiveDescrizione',
  'effectiveBadgeCliente',
  'effectiveMestiereRichiesto',
]) {
  assert.match(
    serviceSave,
    new RegExp(`const ${field} =|const ${field}\\s*=`),
    `Service save must derive ${field} from the submitted draft.`,
  );
}
assert.match(
  serviceSave,
  /await saveServicesPersisted\(nextServicesPreview,\s*\{[\s\S]*?changedServiceIds:\s*\[nextServicePayload\.id\][\s\S]*?\}\)/,
  'Service edits must retain the persisted save path and scope it to the exact service ID.',
);

const operatorSave = sliceBetween(
  'const salvaOperatore = async (',
  'const avviaModificaOperatore =',
  'operator save',
);
assert.match(
  operatorSave,
  /nativeTextDraft\?: NativeOperatorEditTextDraft/,
  'The existing operator save path must accept the native modal draft explicitly.',
);
assert.match(
  operatorSave,
  /effectiveNomeOperatore[\s\S]*?effectiveMestiereOperatore/,
  'Operator validation and payload must derive both local text fields.',
);
assert.match(
  operatorSave,
  /await saveOperatorsPersisted\(/,
  'Operator edits must retain the existing persisted save path.',
);

const serviceModal = sliceBetween(
  '<NativeEditTextDraftBoundary<NativeServiceEditTextDraft>',
  '<NativeEditTextDraftBoundary<NativeOperatorEditTextDraft>',
  'native service modal',
);
for (const field of [
  'nome',
  'descrizione',
  'badgeCliente',
  'mestiereRichiesto',
  'customRoleDraft',
]) {
  assert.match(
    serviceModal,
    new RegExp(`nativeServiceDraft\\.${field}`),
    `The native service popup must render ${field} from its local draft.`,
  );
}
assert.match(
  serviceModal,
  /void salvaServizio\(nativeServiceDraft\)/,
  'The native service popup must publish its text draft only on save.',
);
for (const rootSetter of [
  'setNome',
  'setDescrizione',
  'setBadgeCliente',
  'setMestiereRichiesto',
  'setServiceEditCustomRoleDraft',
]) {
  assert.doesNotMatch(
    serviceModal,
    new RegExp(`\\b${rootSetter}\\(`),
    `Native service typing must not call root setter ${rootSetter}.`,
  );
}

const operatorModal = sliceBetween(
  '<NativeEditTextDraftBoundary<NativeOperatorEditTextDraft>',
  '<NumberPickerModal\n        visible={',
  'native operator modal',
);
assert.match(operatorModal, /value=\{nativeOperatorDraft\.nome\}/);
assert.match(operatorModal, /value=\{nativeOperatorDraft\.mestiere\}/);
assert.match(
  operatorModal,
  /void salvaOperatore\(nativeOperatorDraft\)/,
  'The native operator popup must publish its text draft only on save.',
);
assert.doesNotMatch(
  operatorModal,
  /\bset(?:NomeOperatore|MestiereOperatore)\(/,
  'Native operator typing must not write to ServiziScreen state.',
);
assert.match(
  operatorModal,
  /renderOperatorPublicServicesPanel\([\s\S]*?nativeOperatorDraft\.mestiere/,
  'The operator capability preview must still react to the local role draft.',
);

const webSource = source.slice(
  0,
  source.indexOf('<NativeEditTextDraftBoundary<NativeServiceEditTextDraft>'),
);
assert.match(
  webSource,
  /ref=\{serviceNameRef\}[\s\S]{0,600}?value=\{nome\}[\s\S]{0,600}?setNome\(/,
  'The web service editor must retain its existing controlled name field.',
);
assert.match(
  webSource,
  /value=\{nomeOperatore\}[\s\S]{0,600}?setNomeOperatore\(/,
  'The web operator editor must retain its existing controlled name field.',
);
assert.match(
  webSource,
  /value=\{mestiereOperatore\}[\s\S]{0,600}?setMestiereOperatore\(/,
  'The web operator editor must retain its existing controlled role field.',
);

console.log('Native service/operator edit draft isolation contracts: OK');
