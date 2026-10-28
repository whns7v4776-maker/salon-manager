const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const landingSource = fs.readFileSync(path.join(root, 'app', 'index.tsx'), 'utf8');
const customerSource = fs.readFileSync(path.join(root, 'app', 'cliente-screen.tsx'), 'utf8');

const assertMatch = (value, pattern, message) => {
  if (!pattern.test(value)) {
    throw new Error(message);
  }
};

const assertRegistrationInputs = ({ source, nameMarker, surnameMarker, emailMarker, label }) => {
  const nameStart = source.indexOf(nameMarker);
  const surnameStart = source.indexOf(surnameMarker, nameStart);
  const emailStart = source.indexOf(emailMarker, surnameStart);

  if (nameStart < 0 || surnameStart < 0 || emailStart < 0) {
    throw new Error(`${label} registration name inputs were not found.`);
  }

  const nameInput = source.slice(nameStart, surnameStart);
  const surnameInput = source.slice(surnameStart, emailStart);

  assertMatch(
    nameInput,
    /autoComplete="given-name"[\s\S]*?textContentType="givenName"[\s\S]*?importantForAutofill="yes"/,
    `${label}: the first-name input must expose standard Android and iOS autofill hints.`
  );
  assertMatch(
    surnameInput,
    /autoComplete="family-name"[\s\S]*?textContentType="familyName"[\s\S]*?importantForAutofill="yes"/,
    `${label}: the surname input must expose standard Android and iOS autofill hints.`
  );
  assertMatch(
    nameInput,
    /onChangeText=\{\(value\) => \{[\s\S]*?nome: value,/,
    `${label}: the first-name handler must preserve the native IME composing value.`
  );
  assertMatch(
    surnameInput,
    /onChangeText=\{\(value\) => \{[\s\S]*?cognome: value,/,
    `${label}: the surname handler must preserve the native IME composing value.`
  );
  assertMatch(
    nameInput,
    /onEndEditing=\{\(\) => \{[\s\S]*?nome: formatLeadingCapitalizedValue\(current\.nome\),/,
    `${label}: the first name must be capitalized after native IME composition ends.`
  );
  assertMatch(
    surnameInput,
    /onEndEditing=\{\(\) => \{[\s\S]*?cognome: formatLeadingCapitalizedValue\(current\.cognome\),/,
    `${label}: the surname must be capitalized after native IME composition ends.`
  );

  if (/formatCustomerNamePart\(value\)|normalizeCustomerNameInput\(value\)/.test(nameInput + surnameInput)) {
    throw new Error(`${label}: name inputs must not rewrite native IME text while it is composing.`);
  }
};

assertRegistrationInputs({
  source: landingSource,
  nameMarker: 'placeholder="Nome (obbligatorio)"',
  surnameMarker: 'placeholder="Cognome (obbligatorio)"',
  emailMarker: 'placeholder="Mail (obbligatoria)"',
  label: 'Landing customer flow',
});

assertRegistrationInputs({
  source: customerSource,
  nameMarker: 'accessibilityLabel="Nome"',
  surnameMarker: 'accessibilityLabel="Cognome"',
  emailMarker: 'accessibilityLabel="Email"',
  label: 'Customer app flow',
});

assertMatch(
  landingSource,
  /const normalizedProfile = \{[\s\S]*?nome: formatCustomerNamePart\(registerProfile\.nome\),[\s\S]*?cognome: formatCustomerNamePart\(registerProfile\.cognome\),/,
  'Customer names must still be normalized at the authoritative submit boundary.'
);

assertMatch(
  customerSource,
  /const normalizedFirstName = formatCustomerNamePart\(profile\.nome\);[\s\S]*?const normalizedLastName = formatCustomerNamePart\(profile\.cognome\);/,
  'Customer app names must still be normalized at the authoritative submit boundary.'
);

console.log('iOS and Android client registration autofill contracts passed.');
