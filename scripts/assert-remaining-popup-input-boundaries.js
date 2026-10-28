/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const directModalBodies = (source) => source.match(/<Modal\b[\s\S]*?<\/Modal>/g) ?? [];

const landingSource = read('app', 'index.tsx');
const ownerAccessSource = read('src', 'screens', 'OwnerAccessScreen.tsx');
const clientPasswordSource = read('app', 'cliente-password.tsx');
const resetPasswordSource = read('app', 'reset-password.tsx');
const cashScreenSource = read('app', 'cassa-screen.tsx');
const numberPickerSource = read('components', 'ui', 'number-picker-modal.tsx');

const readOnlyModalContracts = [
  {
    name: 'client landing footer dialog',
    source: landingSource,
    expectedCount: 1,
  },
  {
    name: 'customer password success dialog',
    source: clientPasswordSource,
    expectedCount: 1,
  },
  {
    name: 'password reset feedback dialog',
    source: resetPasswordSource,
    expectedCount: 1,
  },
  {
    name: 'cash introduction dialog',
    source: cashScreenSource,
    expectedCount: 1,
  },
];

readOnlyModalContracts.forEach(({ name, source, expectedCount }) => {
  const modals = directModalBodies(source);
  assert.equal(
    modals.length,
    expectedCount,
    `${name}: direct-modal count changed; audit any new popup before accepting parent-controlled typing.`,
  );
  modals.forEach((modal) => {
    assert.doesNotMatch(
      modal,
      /<(?:TextInput|PasswordTextInput)\b/,
      `${name}: keep the dialog read-only or isolate future typing inside modal-local state.`,
    );
  });
  assert.doesNotMatch(
    source,
    /Alert\.prompt\s*\(/,
    `${name}: do not introduce an untracked text-entry system popup.`,
  );
});

const ownerAccessDirectModals = directModalBodies(ownerAccessSource);
assert.equal(
  ownerAccessDirectModals.length,
  1,
  'OwnerAccessScreen may contain only the read-only registration success confirmation.',
);
assert.match(
  ownerAccessDirectModals[0],
  /visible=\{registerSuccessVisible\}[\s\S]*?Salone creato con successo/,
  'The direct owner modal must remain the registration success confirmation.',
);
assert.doesNotMatch(
  ownerAccessDirectModals[0],
  /<(?:TextInput|PasswordTextInput)\b/,
  'OwnerAccessScreen must keep popup typing inside the shared isolated EmailOtpModal.',
);
assert.equal(
  landingSource.match(/<EmailOtpModal\b/g)?.length ?? 0,
  2,
  'The client landing must keep both OTP popups on the shared isolated modal.',
);
assert.equal(
  ownerAccessSource.match(/<EmailOtpModal\b/g)?.length ?? 0,
  1,
  'Owner access must keep its OTP popup on the shared isolated modal.',
);
assert.doesNotMatch(
  numberPickerSource,
  /<TextInput\b/,
  'The cash number picker must remain selection-only and avoid parent-controlled typing.',
);

console.log('Remaining popup input-boundary contracts passed.');
