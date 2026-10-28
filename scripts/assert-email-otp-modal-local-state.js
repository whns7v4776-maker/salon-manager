/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modalSource = fs.readFileSync(
  path.join(root, 'components', 'email-otp-modal.tsx'),
  'utf8',
);
const clientSource = fs.readFileSync(
  path.join(root, 'app', 'cliente-screen.tsx'),
  'utf8',
);
const landingSource = fs.readFileSync(path.join(root, 'app', 'index.tsx'), 'utf8');
const ownerSource = fs.readFileSync(
  path.join(root, 'src', 'screens', 'OwnerAccessScreen.tsx'),
  'utf8',
);
const nativeDatePickerSource = fs.readFileSync(
  path.join(root, 'components', 'ui', 'native-date-picker-modal.tsx'),
  'utf8',
);
const passwordRequirementsSource = fs.readFileSync(
  path.join(root, 'components', 'password-requirements.tsx'),
  'utf8',
);
const emailOtpFunctionSource = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'send-email-otp', 'index.ts'),
  'utf8',
);
const supabaseConfigSource = fs.readFileSync(
  path.join(root, 'supabase', 'config.toml'),
  'utf8',
);
const emailVerificationSource = fs.readFileSync(
  path.join(root, 'src', 'lib', 'email-verification.ts'),
  'utf8',
);

const modalPropsSource = modalSource.slice(
  modalSource.indexOf('type EmailOtpModalProps = {'),
  modalSource.indexOf('export function EmailOtpModal'),
);

assert.match(
  modalPropsSource,
  /resetKey\?: string \| number;/,
  'The OTP modal must expose a lifecycle-only reset key.',
);
assert.match(
  modalPropsSource,
  /onVerify: \(code: string\) => void \| Promise<unknown>;/,
  'Verification must receive the modal-local OTP code explicitly.',
);
assert.doesNotMatch(
  modalPropsSource,
  /\bcode: string;|onCodeChange/,
  'The OTP value must not be controlled by a parent screen.',
);
assert.match(
  modalSource,
  /const \[code, setCode\] = useState\(''\);/,
  'The OTP value must be owned by EmailOtpModal.',
);
assert.match(
  modalSource,
  /useEffect\(\(\) => \{\s*setCode\(''\);\s*setVerificationAttempted\(false\);\s*\}, \[email, resetKey, visible\]\);/,
  'Closing, reopening, changing recipient, or receiving a new challenge must clear local OTP state.',
);
assert.match(
  modalSource,
  /if \(expired\) setCode\(''\);/,
  'An expired challenge must clear the local OTP state.',
);
assert.match(
  modalSource,
  /const handleCodeChange = \(value: string\) => \{[\s\S]*?value\.replace\(\/\\D\+\/g, ''\)\.slice\(0, 6\)[\s\S]*?value\.length > 0 && numericValue\.length === 0[\s\S]*?setCode\(numericValue\);[\s\S]*?onChangeText=\{handleCodeChange\}/,
  'Typing and Mail AutoFill must keep only numeric OTP digits without erasing an existing code for a label suggestion.',
);
assert.match(
  modalSource,
  /textContentType=\{Platform\.OS === 'ios' \? 'oneTimeCode' : undefined\}/,
  'iOS must expose the field as a one-time-code input for Mail AutoFill.',
);
assert.match(
  modalSource,
  /autoComplete=\{Platform\.OS === 'ios' \? 'one-time-code' : 'off'\}[\s\S]*?importantForAutofill=\{Platform\.OS === 'android' \? 'no' : undefined\}/,
  'Android email OTP fields must opt out of SMS AutoFill while iOS keeps Mail one-time-code support.',
);

assert.match(
  fs.readFileSync(path.join(root, 'app', 'cliente-password.tsx'), 'utf8'),
  /const numericValue = value\.replace\(\/\\D\+\/g, ""\)\.slice\(0, 6\);[\s\S]*?value\.length > 0 && numericValue\.length === 0[\s\S]*?textContentType=\{Platform\.OS === "ios" \? "oneTimeCode" : undefined\}[\s\S]*?autoComplete=\{Platform\.OS === "ios" \? "one-time-code" : "off"\}[\s\S]*?importantForAutofill=\{IS_ANDROID \? "no" : undefined\}/,
  'Password activation email OTP must ignore label suggestions, keep iOS Mail AutoFill, and disable Android SMS AutoFill.',
);
assert.match(
  modalSource,
  /nativeCompactLayout\?: boolean;[\s\S]*?useNativeCompactLayout[\s\S]*?<ScrollView[\s\S]*?keyboardShouldPersistTaps="handled"/,
  'The customer OTP modal must provide a keyboard-safe compact native presentation.',
);
assert.match(
  modalSource,
  /onSubmitEditing=\{canVerify \? submitCode : undefined\}/,
  'Keyboard submission must verify the exact sanitized local code.',
);
assert.match(
  modalSource,
  /onPress=\{submitCode\}/,
  'Button submission must verify the exact sanitized local code.',
);
assert.match(modalSource, /const submitCode = \(\) => \{[\s\S]*?if \(!canVerify\) return;[\s\S]*?return onVerify\(cleanCode\);/);
assert.match(modalSource, /\(expired \|\| verificationAttempted\) && styles.messageError/);
assert.match(modalSource, /Codice OTP scaduto\. Premi «Invia di nuovo» qui sotto/);
for (const source of [landingSource, clientSource]) {
  for (const field of ['nome', 'cognome']) {
    assert(source.includes(`${field}: formatLeadingCapitalizedValue(current.${field})`), `${field} must normalize current state, not a stale end-edit event`);
  }
  assert(source.includes('buildEmailOtpVerificationErrorMessage(result.error)'));
  assert(source.includes('buildEmailOtpVerificationErrorMessage(verification.error)'));
}
assert.match(
  emailVerificationSource,
  /EMAIL_OTP_REQUEST_TIMEOUT_MS[\s\S]*?supabase\.functions\.invoke\("send-email-otp"[\s\S]*?signal: requestController\.signal[\s\S]*?requestController\.signal\.aborted[\s\S]*?"request_timeout"[\s\S]*?finally \{[\s\S]*?clearTimeout\(requestTimeout\)/,
  'A transport failure must return a visible OTP error instead of leaving the UI busy forever.',
);
assert.match(
  emailOtpFunctionSource,
  /fetch\("https:\/\/api\.resend\.com\/emails", \{[\s\S]*?signal: AbortSignal\.timeout\(8_000\)/,
  'The OTP provider request must have a bounded timeout on every platform.',
);
assert.match(
  ownerSource,
  /registerEmailOtpRequestInFlightRef[\s\S]*?finally \{[\s\S]*?setRegisterEmailOtpBusy\(false\)[\s\S]*?existingChallengeIsUsable[\s\S]*?setRegisterEmailOtpModalVisible\(true\)/,
  'Owner OTP resend must always unlock and reopen a still-valid challenge during cooldown.',
);
assert.match(
  ownerSource,
  /onResend=\{\(\) =>[\s\S]*?announceResult: true/,
  'Owner OTP resend must provide explicit delivery or failure feedback.',
);
assert.match(
  ownerSource,
  /const ownerRegistrationAllowed = true;/,
  'Salon registration must expose the same OTP flow on native and web.',
);
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'src', 'context', 'AppContext.tsx'), 'utf8'),
  /if \(Platform\.OS === 'web'\) \{[\s\S]{0,260}?Per creare un nuovo salone/,
  'The shared owner registration action must not reject web after OTP verification.',
);
assert.doesNotMatch(
  `${ownerSource}\n${landingSource}\n${clientSource}\n${modalSource}`,
  /ORA TOCCA QUI|Email verificata\. Completa con il pulsante evidenziato\./,
  'Registration completion must be communicated by the CTA itself, without a floating instruction label.',
);
assert.match(
  modalSource,
  /haloButtonOnly:[\s\S]*?borderWidth: 0[\s\S]*?backgroundColor: 'transparent'[\s\S]*?haloReadyButton:[\s\S]*?backgroundColor: '#078F68'[\s\S]*?shadowColor: '#10b981'/,
  'A verified registration must expose one consistent premium green neon CTA.',
);
assert.match(
  ownerSource,
  /<OtpVerifiedActionHalo active=\{registerCtaReady\} buttonOnly>/,
  'The owner CTA must pulse only inside the button once the complete registration is ready.',
);
assert.match(
  ownerSource,
  /visible=\{registerSuccessVisible\}[\s\S]*?Salone creato con successo[\s\S]*?Accedi e configura/,
  'A completed owner registration must show the shared native and web success confirmation.',
);

const parentSources = [clientSource, landingSource, ownerSource];
const modalUsages = parentSources.flatMap(
  (source) => source.match(/<EmailOtpModal[\s\S]*?\/>/g) ?? [],
);

assert.equal(modalUsages.length, 5, 'All five client and owner OTP flows must use the shared modal.');
modalUsages.forEach((usage) => {
  assert.match(
    usage,
    /resetKey=\{\w+ChallengeVersion\}/,
    'Every OTP flow must reset only when its challenge version changes.',
  );
  assert.match(usage, /busy=/, 'Every OTP flow must preserve its loading contract.');
  assert.match(usage, /expired=/, 'Every OTP flow must preserve expiry feedback.');
  assert.match(usage, /message=/, 'Every OTP flow must preserve error and status feedback.');
  assert.match(usage, /onVerify=/, 'Every OTP flow must submit through its existing verifier.');
  assert.match(usage, /onResend=/, 'Every OTP flow must preserve resend behavior.');
  assert.match(usage, /onBack=/, 'Every OTP flow must preserve close behavior.');
  assert.doesNotMatch(
    usage,
    /onCodeChange=|\bcode=\{/,
    'No OTP modal usage may push each keystroke into a parent screen.',
  );
});

[
  'loginEmailCompletionCode',
  'clientEmailOtpCode',
].forEach((legacyState) => {
  assert.doesNotMatch(clientSource, new RegExp(`\\b${legacyState}\\b`));
});
[
  'accessEmailCompletionCode',
  'registerEmailOtpCode',
].forEach((legacyState) => {
  assert.doesNotMatch(landingSource, new RegExp(`\\b${legacyState}\\b`));
});
assert.doesNotMatch(ownerSource, /\bregisterEmailOtpCode\b/);

const clientDirectModalBodies = clientSource.match(/<Modal\b[\s\S]*?<\/Modal>/g) ?? [];
assert.equal(
  clientDirectModalBodies.length,
  1,
  'ClienteScreen must keep a single direct React Native modal: the read-only service details popup.',
);
assert.doesNotMatch(
  clientDirectModalBodies[0],
  /<(?:TextInput|PasswordTextInput)\b/,
  'The direct ClienteScreen modal must remain read-only and must not add parent-controlled typing.',
);
assert.doesNotMatch(
  clientSource,
  /Alert\.prompt\s*\(/,
  'ClienteScreen must not introduce an untracked text-entry system popup.',
);
assert.doesNotMatch(
  nativeDatePickerSource,
  /<TextInput\b/,
  'The date picker popup must remain selection-only and must not add text-entry state.',
);
assert.equal(
  clientSource.match(/<EmailOtpModal\b/g)?.length ?? 0,
  2,
  'ClienteScreen must route both of its text-entry popups through the isolated OTP modal.',
);
assert.equal(
  clientSource.match(/nativeCompactLayout/g)?.length ?? 0,
  2,
  'Both ClienteScreen OTP flows must use the compact native presentation.',
);
assert.equal(
  landingSource.match(/nativeCompactLayout/g)?.length ?? 0,
  2,
  'Both landing customer OTP flows must use the compact native presentation.',
);
assert.match(
  clientSource,
  /<PasswordRequirements[\s\S]*?alignLeft=\{!isWeb\}[\s\S]*?<PasswordMatchRequirement[\s\S]*?alignLeft/,
  'Native customer registration must left-align its password rules and show the match rule.',
);
assert.match(
  passwordRequirementsSource,
  /Le password devono coincidere/,
  'The shared visual password checklist must expose the matching requirement.',
);
assert.match(
  emailOtpFunctionSource,
  /subject: `Il tuo codice SalonPro è \$\{code\}`[\s\S]*?text: `Il tuo codice di verifica SalonPro è \$\{code\}[\s\S]*?Il tuo codice di verifica SalonPro è \$\{code\}[\s\S]*?Spam o Posta indesiderata/,
  'OTP email metadata must expose an unambiguous numeric code for iOS Mail AutoFill and retain the spam reminder.',
);
assert.match(
  emailOtpFunctionSource,
  /const emailBrand = `<div[\s\S]*?src="cid:salonpro-app-logo"[\s\S]*?attachments: \[[\s\S]*?content: salonProEmailLogoContent[\s\S]*?content_id: "salonpro-app-logo"/,
  'Every OTP purpose, including owner registration, must use the official SalonPro image logo.',
);
assert.match(
  supabaseConfigSource,
  /\[functions\.send-email-otp\][\s\S]*?static_files = \["\.\/functions\/send-email-otp\/salon-pro-email-otp-logo\.png"\]/,
  'The exact transparent OTP logo must be bundled with the Edge Function.',
);
assert.equal(
  fs.existsSync(path.join(root, 'supabase', 'functions', 'send-email-otp', 'salon-pro-email-otp-logo.png')),
  true,
  'The transparent OTP logo asset must exist beside the Edge Function.',
);
assert.doesNotMatch(
  emailOtpFunctionSource,
  /Brush Script MT|Segoe Script/,
  'OTP emails must not fall back to the old script-font SalonPro wordmark.',
);

assert.match(
  clientSource,
  /setLoginEmailCompletionChallengeVersion\(\(current\) => current \+ 1\)/,
);
assert.match(
  clientSource,
  /setClientEmailOtpChallengeVersion\(\(current\) => current \+ 1\)/,
);
assert.match(
  landingSource,
  /setAccessEmailCompletionChallengeVersion\(\(current\) => current \+ 1\)/,
);
assert.match(
  landingSource,
  /setRegisterEmailOtpChallengeVersion\(\(current\) => current \+ 1\)/,
);
assert.match(
  ownerSource,
  /setRegisterEmailOtpChallengeVersion\(\(current\) => current \+ 1\)/,
);

assert.match(
  clientSource,
  /verifyLoginEmailCompletion\(submittedCode: string\)[\s\S]*?const code = submittedCode\.replace\(\/\\D\+\/g, ''\);/,
);
assert.match(
  clientSource,
  /verifyClientEmailOtpForRegistration = useCallback\(async \(submittedCode: string\)[\s\S]*?const code = submittedCode\.replace\(\/\\D\+\/g, ''\);/,
);
assert.match(
  landingSource,
  /verifyAccessEmailCompletion = useCallback\(async \(submittedCode: string\)[\s\S]*?const code = submittedCode\.replace\(\/\\D\+\/g, ''\);/,
);
assert.match(
  landingSource,
  /verifyClientRegisterEmailOtp = useCallback\(async \(submittedCode: string\)[\s\S]*?const code = submittedCode\.replace\(\/\\D\+\/g, ''\);/,
);
assert.match(
  ownerSource,
  /verifyRegisterEmailOtp = React\.useCallback\(async \(submittedCode: string\)[\s\S]*?const code = submittedCode\.replace\(\/\\D\+\/g, ''\);/,
);

assert.match(clientSource, /purpose: 'client_email_completion'/);
assert.match(clientSource, /purpose: 'client_registration'/);
assert.match(landingSource, /purpose: 'client_email_completion'/);
assert.match(landingSource, /purpose: 'client_registration'/);
assert.match(ownerSource, /purpose: 'owner_registration'/);

console.log('Email OTP modal local-state contracts passed.');
