const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const clientiPath = path.join(root, 'app', '(tabs)', 'clienti.tsx');
const clienteDetailPath = path.join(root, 'app', 'cliente', '[id].tsx');
const agendaPath = path.join(root, 'app', '(tabs)', 'agenda.tsx');
const identityColorsPath = path.join(
  root,
  'src',
  'lib',
  'customer-identity-colors.ts'
);
const source = fs.readFileSync(clientiPath, 'utf8');
const detailSource = fs.readFileSync(clienteDetailPath, 'utf8');
const agendaSource = fs.readFileSync(agendaPath, 'utf8');
const identityColorsSource = fs.readFileSync(identityColorsPath, 'utf8');

const cancellationCountsMatch = source.match(
  /const clientCancellationCountsByIdentity = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[richiestePrenotazione\]\);/
);

if (!cancellationCountsMatch) {
  throw new Error('clientCancellationCountsByIdentity block not found.');
}

const cancellationCountsBlock = cancellationCountsMatch[0];
const forbiddenCancellationTokens = [
  /\bnome\b/,
  /\bcognome\b/,
  /\bfullName\b/,
  /name:/,
];

for (const token of forbiddenCancellationTokens) {
  if (token.test(cancellationCountsBlock)) {
    throw new Error(
      `Client cancellation counts must not be keyed by customer name: ${token}`
    );
  }
}

const identityAliasesMatch = source.match(
  /const buildFrontendClientIdentityAliases = \([\s\S]*?\n  \);/
);

if (!identityAliasesMatch) {
  throw new Error('buildFrontendClientIdentityAliases block not found.');
}

if (/name:/.test(identityAliasesMatch[0])) {
  throw new Error('Client identity aliases must not include name-based keys.');
}

const detailAppointmentsMatch = detailSource.match(
  /const appuntamentiCliente = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[appuntamenti, cliente\]\);/
);

if (!detailAppointmentsMatch) {
  throw new Error('appuntamentiCliente detail block not found.');
}

if (/app\.cliente|cliente\.nome/.test(detailAppointmentsMatch[0])) {
  throw new Error('Client appointment history must be filtered by customerId, not name.');
}

if (
  !/buildCustomerIdentityColorMap[\s\S]*?getCustomerIdentityColor\(customer\.identityKey, customer\.displayName\)/.test(
    identityColorsSource
  )
) {
  throw new Error(
    'Customer identity colors must remain deterministic for each canonical identity.'
  );
}

if (!/customerIdentityColorsByKey\.get\(customerIdentityKey\)/.test(source)) {
  throw new Error('Client cards must use the account-level collision-free color map.');
}

if (
  !/agendaCustomerIdentityColorsByKey\.get\([\s\S]*?identityKey\.trim\(\)\.toLowerCase\(\)[\s\S]*?\)\s*\?\?\s*'#64748B'/.test(
    agendaSource
  )
) {
  throw new Error(
    'Agenda cards must reuse the persisted customer color map with a neutral fallback while loading.'
  );
}

console.log('Client identity count guard passed.');
