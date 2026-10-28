const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const header = read('components', 'module-hero-header.tsx');
const androidHost = read('components', 'android-owner-settings-host.tsx');
const rootLayout = read('app', '_layout.tsx');
const settings = read('app', 'impostazioni.tsx');
const cash = read('app', 'cassa-screen.tsx');
const toolsContext = read('components', 'android-owner-tools-context.ts');

for (const route of ['index', 'agenda', 'prenotazioni', 'clienti', 'servizi']) {
  const source = read('app', '(tabs)', `${route}.tsx`);
  assert.match(
    source,
    /<ModuleHeroHeader/,
    `${route} must use the shared immediate Settings entry point.`,
  );
}

assert.match(
  header,
  /function AndroidSettingsButton[\s\S]*?ownerTools\.openSettings\(moduleKey\)/,
  'Android must open the isolated Settings host without navigating the heavy tab stack.',
);
assert.doesNotMatch(
  header.match(/function AndroidSettingsButton[\s\S]*?\n\}/)?.[0] ?? '',
  /navigationLockedRef|setTimeout/,
  'Android Settings must never discard a valid repeated tap behind a timer lock.',
);
assert.match(
  header,
  /Platform\.OS === 'android' && ownerTools[\s\S]*?ownerTools\.openCash\(_moduleKey\)[\s\S]*?router\.push\('\/cassa-open'\)/,
  'Android Cash must use the prepared host while iOS keeps its existing route.',
);
assert.match(
  header,
  /function StandardSettingsButton[\s\S]*?usePathname\(\)[\s\S]*?router\.push\(Platform\.OS === 'web' \? '\/impostazioni-open' : '\/impostazioni'\)/,
  'iOS and web must retain their existing Settings navigation path.',
);
assert.match(
  header,
  /function AndroidSettingsButton[\s\S]*?onPress=\{handleOpenSettings\}[\s\S]*?immediatePress/,
  'Android must dispatch the route before optional haptic work.',
);
assert.match(
  header,
  /function AndroidSettingsButton[\s\S]*?accessibilityLabel="Apri impostazioni"[\s\S]*?testID="android-owner-settings-button"/,
  'The Android Settings control must remain uniquely targetable during physical verification.',
);
assert.match(
  header,
  /onPress=\{handleOpenCash\}[\s\S]*?accessibilityLabel=\{Platform\.OS === 'android' \? 'Apri cassa' : undefined\}[\s\S]*?testID=\{Platform\.OS === 'android' \? 'android-owner-cash-button' : undefined\}/,
  'The Android Cash control must remain uniquely targetable without changing iOS or web.',
);
assert.match(
  header,
  /_moduleKey === 'prenotazioni' \|\| _moduleKey === 'clienti'[\s\S]*?rightAccessoryAndroidWideInset[\s\S]*?_moduleKey === 'agenda' \|\| _moduleKey === 'servizi'[\s\S]*?rightAccessoryAndroidMediumInset/,
  'Android Settings spacing must compensate for each owner card inset.',
);
assert.match(
  header,
  /styles\.rightAccessory,[\s\S]*?Platform\.OS === 'android' && styles\.rightAccessoryAndroidControl,[\s\S]*?rightAccessoryAndroidControl:\s*\{\s*top: 6/,
  'Android Settings and Cash controls must share the same vertical alignment.',
);
assert.match(
  header,
  /_moduleKey === 'prenotazioni' \|\| _moduleKey === 'clienti'[\s\S]*?leftAccessoryAndroidWideInset[\s\S]*?_moduleKey === 'agenda' \|\| _moduleKey === 'servizi'[\s\S]*?leftAccessoryAndroidMediumInset/,
  'Android Cash spacing must compensate for each owner card inset.',
);
assert.match(
  androidHost,
  /openedAtRef\.current[\s\S]*?openedFromRef\.current[\s\S]*?\[SETTINGS_NAV_PERF\][\s\S]*?elapsedMs/,
  'DEV must retain the originating tab and tap timestamp for physical verification.',
);
assert.match(
  androidHost,
  /Platform\.OS !== 'android'[\s\S]*?require\('\.\.\/app\/impostazioni'\)[\s\S]*?require\('\.\.\/app\/cassa-screen'\)[\s\S]*?setTimeout\([\s\S]*?setSettingsPrepared\(true\)[\s\S]*?setTimeout\([\s\S]*?setCashPrepared\(true\)/,
  'Only Android may lazily load and deterministically prepare Settings and Cash.',
);
assert.doesNotMatch(
  androidHost,
  /InteractionManager\.runAfterInteractions/,
  'Android owner tools must not wait behind an unrelated animation queue.',
);
assert.match(
  androidHost,
  /revealOverlay[\s\S]*?setNativeProps\([\s\S]*?opacity: 1[\s\S]*?hideOverlay[\s\S]*?setNativeProps\([\s\S]*?opacity: 0/,
  'Android owner tools must reveal and hide immediately without a blank transition frame.',
);
assert.doesNotMatch(
  androidHost,
  /^import .*\.\.\/app\/(?:impostazioni|cassa-screen)/m,
  'The root host must not eagerly import route modules and disturb web/iOS route discovery.',
);
assert.match(
  androidHost,
  /pointerEvents=\{activeTool === 'settings' \? 'auto' : 'none'\}[\s\S]*?<SettingsScreen active=\{activeTool === 'settings'\} onClose=\{closeActiveTool\}/,
  'Prepared Android Settings must open and close without route navigation.',
);
assert.match(
  androidHost,
  /pointerEvents=\{activeTool === 'cash' \? 'auto' : 'none'\}[\s\S]*?<CashScreen[\s\S]*?active=\{activeTool === 'cash'\}[\s\S]*?onClose=\{closeActiveTool\}/,
  'Prepared Android Cash must open and close without route navigation or a blank frame.',
);
assert.match(
  toolsContext,
  /openSettings: \(from: string\) => void;[\s\S]*?openCash: \(from: string\) => void;/,
  'The Android-only tools controller must expose both prepared screens.',
);
assert.match(
  rootLayout,
  /<AndroidOwnerSettingsHost[\s\S]*?prepare=\{Platform\.OS === 'android'[\s\S]*?<HapticTouchableFastRegion/,
  'The Android Settings host must wrap the owner navigation without replacing it.',
);

assert.match(
  rootLayout,
  /name="\(tabs\)"[\s\S]*?freezeOnBlur: Platform\.OS === 'android' \? true : undefined/,
  'Only the five heavy Android owner tabs may freeze behind Settings.',
);
assert.match(
  rootLayout,
  /name="impostazioni"[\s\S]*?animation: Platform\.OS === 'android' \? 'none' : 'default'/,
  'Only Android Settings may skip the stack transition.',
);
assert.match(
  settings,
  /InteractionManager\.runAfterInteractions\([\s\S]*?loadSubscriptionDetails/,
  'Settings server refinement must stay outside the first visible render.',
);
assert.match(
  cash,
  /export function CassaScreen[\s\S]*?active = true[\s\S]*?onNativeCashBackPress=\{onClose\}[\s\S]*?visible=\{active && showCashIntroModal\}[\s\S]*?export default CassaScreen/,
  'Hosted Cash must preserve routed behavior by default and gate overlays while hidden.',
);
assert.match(
  settings,
  /export function ImpostazioniScreen[\s\S]*?active = true[\s\S]*?export default ImpostazioniScreen/,
  'The routed screen must remain unchanged by default and be reusable only by the Android host.',
);

console.log('Instant Settings navigation contracts: OK');
