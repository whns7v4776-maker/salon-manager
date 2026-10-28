/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const servicesSource = read('app/(tabs)/servizi.tsx');
const hapticTouchableSource = read('components/ui/haptic-touchable.tsx');
const premiumExpandButtonSource = read('components/ui/premium-expand-button.tsx');
const premiumGuideDockSource = read('components/ui/premium-guide-dock.tsx');
const sectionHowItWorksSource = read('components/section-how-it-works.tsx');

const sliceBetween = (source, startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const fastExpansionBoundary = sliceBetween(
  servicesSource,
  'const AppOnlyFastExpansionBoundary = React.forwardRef',
  'const WEEKDAY_OPTIONS',
  'app-only fast expansion boundary',
);
assert.match(
  fastExpansionBoundary,
  /Platform\.OS === 'web' \? webExpanded : nativeExpanded/,
  'Native expansion must use local state while web keeps its existing controlled state.',
);
assert.match(
  fastExpansionBoundary,
  /if \(Platform\.OS === 'web'\) \{[\s\S]*?onWebToggle\(\)[\s\S]*?return;[\s\S]*?setNativeExpanded/,
  'The fast expansion toggle must preserve the web path and update locally on app.',
);

for (const refName of [
  'serviceFormExpansionRef',
  'operatorFormExpansionRef',
  'customServiceExpansionRef',
]) {
  assert.match(
    servicesSource,
    new RegExp(`ref=\\{${refName}\\}[\\s\\S]*?webExpanded=`),
    `${refName} must isolate its native expand state.`,
  );
}
assert.match(
  servicesSource,
  /if \(Platform\.OS !== 'web'\) \{[\s\S]*?serviceFormExpansionRef\.current\?\.close\(\);[\s\S]*?setAndroidServiceEditModalVisible\(true\)/,
  'Opening native service edit must close the locally-owned add form.',
);
assert.match(
  servicesSource,
  /if \(Platform\.OS !== 'web'\) \{[\s\S]*?operatorFormExpansionRef\.current\?\.close\(\);[\s\S]*?setAndroidOperatorEditModalVisible\(true\)/,
  'Opening native operator edit must close the locally-owned add form.',
);

assert.match(
  servicesSource,
  /<HapticTouchableFastRegion enabled=\{Platform\.OS !== 'web'\}>[\s\S]*?<FlatList/,
  'The fast haptic/tap region must be enabled only for the native Services screen.',
);
assert.match(
  hapticTouchableSource,
  /HapticTouchableFastRegion\([\s\S]*?enabled = true[\s\S]*?Provider value=\{enabled\}/,
  'Fast-region opt-in must be configurable so web can retain its existing behavior.',
);
assert.match(
  premiumExpandButtonSource,
  /const handlePressIn[\s\S]*?if \(disabled\) return;[\s\S]*?optimisticPressRef\.current = true[\s\S]*?progress\.value = withTiming\(expanded \? 0 : 1/,
  'Premium expand controls must show optimistic first-frame arrow feedback on app and web.',
);
assert.match(
  premiumExpandButtonSource,
  /const handlePressOut[\s\S]*?requestAnimationFrame[\s\S]*?optimisticPressRef\.current[\s\S]*?progress\.value = withTiming\(expanded \? 1 : 0/,
  'Cancelled expand touches must restore the prop-driven arrow state on app and web.',
);
assert.match(
  premiumExpandButtonSource,
  /onTouchCancel=\{handlePressOut\}[\s\S]*?onPressIn=\{handlePressIn\}[\s\S]*?onPressOut=\{handlePressOut\}[\s\S]*?onPress=\{handlePress\}[\s\S]*?delayPressIn=\{0\}/,
  'Premium expand controls must acknowledge immediately while keeping the real toggle on confirmed press.',
);
const optimisticFeedbackBlock = sliceBetween(
  premiumExpandButtonSource,
  'const handlePressIn = React.useCallback',
  'const handlePressOut = React.useCallback',
  'premium expand optimistic feedback',
);
assert.doesNotMatch(
  optimisticFeedbackBlock,
  /onPress\(/,
  'First-contact feedback must never execute the functional expand action.',
);
assert.match(
  sectionHowItWorksSource,
  /if \(Platform\.OS !== 'web'\) \{[\s\S]*?LayoutAnimation\.configureNext[\s\S]*?onPress\(\)[\s\S]*?<InfoButton[\s\S]*?onPress=\{handlePress\}/,
  'Expandable guide cards must avoid web-only layout work and acknowledge taps immediately.',
);

assert.match(
  read('components/ui/info-button.tsx'),
  /<HapticTouchable[\s\S]*?immediatePress[\s\S]*?delayPressIn=\{0\}/,
  'The shared information control must retain immediate native touch acknowledgement.',
);

const nativeMarkerMatches =
  servicesSource.match(
    /onTouchStart=\{Platform\.OS !== 'web' \? markFormHeaderTouchStart : undefined\}/g,
  ) ?? [];
assert.ok(
  nativeMarkerMatches.length >= 7,
  'All Services docks and secondary expanders must bypass synchronous swipe cleanup on app.',
);
assert.match(
  premiumGuideDockSource,
  /onTouchStart\?:[\s\S]*?<View[\s\S]*?onTouchStart=\{onTouchStart\}/,
  'PremiumGuideDock must forward the native expansion touch marker to its outer surface.',
);
assert.match(
  servicesSource,
  /setOfflineArchiveExpanded\(\(current\) => !current\);[\s\S]*?requestAnimationFrame\(\(\) => closeAllSwipeables\(\)\)/,
  'Offline services must update expansion before deferred native swipe cleanup.',
);

assert.match(
  servicesSource,
  /Platform\.OS !== 'web' && styles\.expandHeaderButtonNative[\s\S]*?Platform\.OS !== 'web' && styles\.expandHeaderTitleNative[\s\S]*?Platform\.OS !== 'web' && styles\.expandHeaderChevronControlNative/,
  'Add Services and Add Operators must use the native left-title/right-control layout.',
);
assert.match(
  servicesSource,
  /expandHeaderButtonNative:[\s\S]*?flexDirection: 'row'[\s\S]*?justifyContent: 'space-between'/,
  'The native add-section header must distribute title and expand control to opposite edges.',
);
assert.match(
  servicesSource,
  /Platform\.OS !== 'web' &&[\s\S]*?!serviceFormExpanded &&[\s\S]*?styles\.expandHeaderButtonClosedNative[\s\S]*?Platform\.OS !== 'web' &&[\s\S]*?!operatorFormExpanded &&[\s\S]*?styles\.expandHeaderButtonClosedNative[\s\S]*?expandHeaderButtonClosedNative:[\s\S]*?width: 'auto'[\s\S]*?expandHeaderTitleNative:[\s\S]*?paddingRight: 66[\s\S]*?expandHeaderChevronControlNative:[\s\S]*?position: 'absolute'[\s\S]*?right: 12[\s\S]*?top: 16/,
  'The native add-section expand controls must sit on the far-right edge without overlapping the title.',
);

const operatorNativeSwipe = sliceBetween(
  servicesSource,
  'renderRightActions={() => (',
  'friction={PREMIUM_CARD_SWIPE_CONFIG.friction}',
  'native operator swipe actions',
);
assert.match(
  operatorNativeSwipe,
  /avviaModificaOperatore\(item\)[\s\S]*?>Modifica<[\s\S]*?eliminaOperatore\(item\.id\)[\s\S]*?archive-outline[\s\S]*?>Archivia<[\s\S]*?eliminaOperatoreDirettamente\(item\.id\)[\s\S]*?trash-outline[\s\S]*?>Elimina</,
  'Native operator swipe must expose Edit, Archive, and permanent Delete in that order.',
);
assert.match(
  operatorNativeSwipe,
  /eliminaOperatoreDirettamente\(item\.id\)[\s\S]*?trash-outline[\s\S]*?>Elimina</,
  'Native operator swipe must expose a direct Delete action.',
);
const operatorSwipeStyles = sliceBetween(
  servicesSource,
  'operatorSwipeActions: {',
  'itemCard: {',
  'native operator swipe styles',
);
assert.match(
  operatorSwipeStyles,
  /operatorSwipeActions:\s*\{[\s\S]*?flexDirection: 'column'/,
  'Native operator actions must be stacked in one vertical column.',
);
for (const actionStyle of [
  'operatorEditSwipeAction',
  'operatorArchiveSwipeAction',
  'operatorDeleteSwipeAction',
]) {
  assert.match(
    operatorSwipeStyles,
    new RegExp(`${actionStyle}: \\{[\\s\\S]*?minHeight: 44`),
    `${actionStyle} must keep a full accessible action row.`,
  );
}
assert.match(
  servicesSource,
  /const deleteOperatorPersisted = useCallback\([\s\S]*?saveOperatorsPersisted\(nextOperators, \{[\s\S]*?archivedOperatorId: operator\.id/,
  'Direct operator deletion must use the existing remote persistence path.',
);

assert.match(
  servicesSource,
  /item\.disponibileOnline !== false \? \([\s\S]*?onActivate=\{\(\) => confermaEliminazioneDirettaServizio\(item\)\}[\s\S]*?trash-outline[\s\S]*?>Elimina<[\s\S]*?\) : null/,
  'Native service swipe must expose the single permanent Delete path only while the service is online.',
);
const serviceArchiveHandler = sliceBetween(
  servicesSource,
  'const gestisciArchivioServizio =',
  'const multiRoleNoOperatorWarningCard',
  'service archive handler',
);
assert.doesNotMatch(
  serviceArchiveHandler,
  /destructiveLabel|onDestructive|eliminaServizioDefinitivamente|Elimina definitivamente/,
  'Archive and restore confirmation must not expose a second permanent-delete path.',
);
assert.match(
  servicesSource,
  /isServiceActionsOpen \? \([\s\S]*?gestisciArchivioServizio\(item\)[\s\S]*?item\.disponibileOnline !== false \? \([\s\S]*?confermaEliminazioneDirettaServizio\(item\)[\s\S]*?accessibilityLabel=\{`Elimina definitivamente \$\{item\.nome\}`\}[\s\S]*?\) : null/,
  'Web service actions must keep the same single Delete path on online cards and hide it from the archive.',
);
assert.match(
  servicesSource,
  /const confermaEliminazioneDirettaServizio[\s\S]*?openConfirmDialog\([\s\S]*?Elimina definitivamente[\s\S]*?eliminaServizioDefinitivamente[\s\S]*?immediateConfirm: true[\s\S]*?premiumDestructiveConfirm: true/,
  'Direct service deletion must require an explicit, immediate premium destructive confirmation.',
);
assert.match(
  servicesSource,
  /const shouldRunImmediately = confirmDialog\.immediateConfirm === true;[\s\S]*?closeConfirmDialog\(\);[\s\S]*?if \(shouldRunImmediately\) \{[\s\S]*?handler\?\.\(\);[\s\S]*?return;[\s\S]*?InteractionManager\.runAfterInteractions/,
  'Permanent service deletion must start immediately after closing the modal instead of waiting for interactions and a timer.',
);
assert.match(
  servicesSource,
  /confirmDialog\.premiumDestructiveConfirm \?[\s\S]*?confirmDialogPremiumDeleteSheen[\s\S]*?confirmDialogPremiumDeleteIcon[\s\S]*?trash-outline[\s\S]*?confirmDialogPremiumDeleteText/,
  'The permanent-delete CTA must keep its dedicated premium sheen, icon, and adaptive label.',
);
assert.match(
  servicesSource,
  /style=\{styles\.confirmDialogPrimaryButtonText\}[\s\S]*?numberOfLines=\{2\}[\s\S]*?adjustsFontSizeToFit[\s\S]*?minimumFontScale=\{0\.72\}[\s\S]*?confirmDialogPrimaryButtonText:[\s\S]*?width: '100%'[\s\S]*?flexShrink: 1[\s\S]*?textAlign: 'center'/,
  'Long destructive confirmation labels must resize and stay centered inside the button.',
);
assert.match(
  servicesSource,
  /saveServicesPersisted\(nextServicesPreview, \{[\s\S]*?deletedService:/,
  'Direct service deletion must retain the existing server-backed delete contract.',
);

const webOperatorActions = sliceBetween(
  servicesSource,
  "{isOperatorActionsOpen ? (",
  ') : null}',
  'web operator actions',
);
assert.match(
  webOperatorActions,
  /avviaModificaOperatore\(item\)[\s\S]*?create-outline[\s\S]*?>Modifica<[\s\S]*?eliminaOperatore\(item\.id\)[\s\S]*?archive-outline[\s\S]*?>Archivia<[\s\S]*?eliminaOperatoreDirettamente\(item\.id\)[\s\S]*?trash-outline[\s\S]*?>Elimina</,
  'Web operator actions must expose Edit, Archive, and permanent Delete in that order.',
);
assert.match(
  webOperatorActions,
  /accessibilityLabel=\{`Elimina definitivamente \$\{item\.nome\}`\}/,
  'Web permanent operator deletion must keep an explicit accessibility label.',
);
assert.match(
  servicesSource,
  /if \(Platform\.OS === 'web'\) \{\s*runSoftLayoutAnimation\(\);\s*\}/,
  'Role-picker layout animation must be skipped on native to avoid blocking the large list.',
);

console.log('Native Services interaction contracts: OK');
