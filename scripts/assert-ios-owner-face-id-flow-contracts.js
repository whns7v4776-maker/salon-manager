const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contextSource = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);
const accessSource = fs.readFileSync(
  path.join(root, 'src', 'screens', 'OwnerAccessScreen.tsx'),
  'utf8',
);
const rootLayoutSource = fs.readFileSync(
  path.join(root, 'app', '_layout.tsx'),
  'utf8',
);
const agendaSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const servicesSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'servizi.tsx'),
  'utf8',
);
const landingSource = fs.readFileSync(
  path.join(root, 'app', 'index.tsx'),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
};

requirePattern(
  contextSource,
  /const refreshBiometricAvailability = React\.useCallback\(async \(\) => \{[\s\S]*?hasHardwareAsync\(\)[\s\S]*?isEnrolledAsync\(\)[\s\S]*?return available;/,
  'Face ID availability must have one reusable hardware and enrollment probe.',
);
requirePattern(
  contextSource,
  /const biometricReady =[\s\S]*?biometricAvailable \|\|[\s\S]*?Platform\.OS === 'ios' && \(await refreshBiometricAvailability\(\)\)/,
  'The first iOS Face ID tap must finish a still-pending hardware probe on demand.',
);
requirePattern(
  accessSource,
  /const canAttemptOwnerBiometric =[\s\S]*?effectiveOwnerBiometricEnabled &&[\s\S]*?\(biometricAvailable \|\| Platform\.OS === 'ios'\);[\s\S]*?delayPressIn=\{0\}[\s\S]*?hitSlop=/,
  'An already-enabled iOS Face ID button must be responsive on its first tap.',
);
requirePattern(
  contextSource,
  /if \(Platform\.OS === 'ios'\) \{\s*pendingBiometricUnlockRef\.current = true;\s*setPendingBiometricUnlock\(true\);\s*\}[\s\S]*?const result = await loginOwnerAccount\(normalizedEmail, savedPassword\);[\s\S]*?if \(!result\.ok\) \{\s*pendingBiometricUnlockRef\.current = false;\s*setPendingBiometricUnlock\(false\);/,
  'The iOS biometric intent must cover the replacement sign-in and reset on failure.',
);
requirePattern(
  contextSource,
  /const logoutOwnerAccount = async \(\) => \{[\s\S]*?ownerExplicitLogoutRef\.current = true;[\s\S]*?setOwnerExplicitLogout\(true\);[\s\S]*?if \(Platform\.OS === 'ios'\) \{\s*setOwnerHomeReady\(false\);\s*\}/,
  'An explicit iOS logout must reset the previous Home-ready latch before Face ID re-entry.',
);
requirePattern(
  contextSource,
  /const logoutOwnerAccount = async \(\) => \{[\s\S]*?const keepIosBiometricLoginEnabledAfterLogout =\s*Platform\.OS === 'ios' && biometricEnabled;[\s\S]*?await supabase\.auth\.signOut\(\);[\s\S]*?if \(keepIosBiometricLoginEnabledAfterLogout\) \{\s*setBiometricEnabled\(true\);\s*\}/,
  'An enabled iOS Face ID button must remain immediately tappable after logout cleanup.',
);
requirePattern(
  contextSource,
  /const scopedAccountPrimeTask =[\s\S]*?Platform\.OS === 'ios'[\s\S]*?primeScopedOwnerAccountState\(authenticatedEmail\)[\s\S]*?await prepareOnboardingStateForAuthenticatedAccount\(authenticatedEmail\);/,
  'iOS must hydrate the scoped account cache while preparing onboarding.',
);
requirePattern(
  rootLayoutSource,
  /useState\(\s*Platform\.OS === 'ios',\s*\)[\s\S]*?if \(Platform\.OS === 'ios'\) \{\s*return;\s*\}/,
  'iOS must show the salon bootstrap indicator immediately instead of flashing white.',
);
requirePattern(
  accessSource,
  /const canCompleteOwnerEntry =[\s\S]*?Platform\.OS === 'ios'[\s\S]*?pendingOwnerEntryCompletion && hasInitializedAuth && isAuthenticated[\s\S]*?if \(Platform\.OS === 'ios'\) \{\s*beginOwnerEntryTransition\(\);\s*completeOwnerEntry\(\);\s*return;/,
  'iOS must leave the login only after authentication and start the protected preparation bridge before replacing it.',
);
requirePattern(
  accessSource,
  /setOwnerEntryLoadingSource\('login'\);\s*setLoadingAction\('login'\);\s*if \(Platform\.OS === 'ios'\) \{\s*setPendingOwnerEntryCompletion\(true\);\s*\}[\s\S]*?await loginOwnerAccount\(submittedEmail, submittedPassword\);[\s\S]*?if \(!result\.ok\) \{\s*resetOwnerEntryVisualState\(\);/,
  'Manual iOS login must keep Accesso in corso active until authentication or restore a clean form on failure.',
);
requirePattern(
  accessSource,
  /setOwnerEntryLoadingSource\('biometric'\);\s*setBiometricLoading\(true\);\s*if \(Platform\.OS === 'ios'\) \{\s*setPendingOwnerEntryCompletion\(true\);\s*\}[\s\S]*?unlockOwnerAccountWithBiometric\(\)[\s\S]*?if \(!result\.ok\) \{\s*resetOwnerEntryVisualState\(\);/,
  'Face ID must use the same iOS entry state machine and reset it completely on failure.',
);
requirePattern(
  rootLayoutSource,
  /name="\(tabs\)"[\s\S]*?animation: Platform\.OS === 'web' \? 'default' : 'none'/,
  'Native owner entry must not reveal the public Home through a stack transition.',
);
requirePattern(
  rootLayoutSource,
  /const shouldSuppressIosLoggedOutRedirectDuringBiometricEntry =[\s\S]*?Platform\.OS === 'ios' && pendingBiometricUnlock;[\s\S]*?const shouldRedirectToLoggedOutLanding =[\s\S]*?!shouldSuppressIosLoggedOutRedirectDuringBiometricEntry &&/,
  'The iOS router must not run a logged-out redirect during an active Face ID entry.',
);
requirePattern(
  rootLayoutSource,
  /const shouldHoldIosOwnerEntryBridge =[\s\S]*?Platform\.OS === 'ios' &&[\s\S]*?\(pendingBiometricUnlock \|\| ownerEntryTransitionPending\);[\s\S]*?\(!ownerExplicitLogout \|\| shouldHoldIosOwnerEntryBridge\)[\s\S]*?shouldHoldIosOwnerEntryBridge \|\|/,
  'The iOS loading bridge must cover manual and Face ID route transitions.',
);
requirePattern(
  rootLayoutSource,
  /React\.useEffect\(\(\) => \{[\s\S]*?Platform\.OS !== 'ios' \|\|[\s\S]*?\(!pendingBiometricUnlock && !ownerEntryTransitionPending\) \|\|[\s\S]*?!isOwnerProtectedRoute \|\|[\s\S]*?!isAuthenticated \|\|[\s\S]*?ownerInitialDataHydrating \|\|[\s\S]*?!ownerServerSyncReady \|\|[\s\S]*?!ownerMobileSessionAccessReady[\s\S]*?setOwnerHomeReady\(true\);[\s\S]*?consumePendingBiometricUnlock\(\);\s*consumeOwnerEntryTransition\(\);/,
  'The iOS preparation page may end only on the protected route with session and owner data ready.',
);
requirePattern(
  contextSource,
  /setOwnerLogoutInProgress\(true\);[\s\S]*?await pendingLogout;[\s\S]*?finally \{\s*setOwnerLogoutInProgress\(false\);/,
  'Logout must expose its real in-flight lifetime instead of redirecting while sign-out is unfinished.',
);
requirePattern(
  rootLayoutSource,
  /function OwnerLogoutTransition\([\s\S]*?shouldRedirect[\s\S]*?shouldRedirect \? <Redirect href=\{NATIVE_LOGGED_OUT_ROUTE\} \/> : null[\s\S]*?Platform\.OS !== 'web' &&[\s\S]*?ownerLogoutInProgress &&[\s\S]*?isOwnerProtectedRoute[\s\S]*?<OwnerLogoutTransition[\s\S]*?shouldRedirect=\{Platform\.OS === 'web' \|\| !ownerLogoutInProgress\}/,
  'Uscita in corso must remain visible until logout is complete, then redirect once to the clean login.',
);
requirePattern(
  landingSource,
  /const beginOwnerBackofficeReplace = useCallback\(\(\) => \{[\s\S]*?ownerBackofficeRedirectStartedRef\.current = true;[\s\S]*?ownerBackofficeReplaceRef\.current\(BACKOFFICE_ROUTE\);[\s\S]*?<OwnerAccessScreen[\s\S]*?onAuthenticated=\{beginOwnerBackofficeReplace\}/,
  'The landing and Face ID completion must share one idempotent back-office replace.',
);
requirePattern(
  landingSource,
  /if \(\s*isAuthenticated &&\s*Platform\.OS !== 'ios' &&[\s\S]*?return <Redirect href=\{BACKOFFICE_ROUTE\} \/>;/,
  'iOS must not run the early declarative redirect before owner bootstrap is ready.',
);
requirePattern(
  agendaSource,
  /IS_IOS && !SERVER_WORKSPACE_UUID_PATTERN\.test\(workspaceId\)/,
  'iOS Agenda must not query composition tables with a placeholder workspace id.',
);
const iOSServiceWorkspaceGuards = servicesSource.match(
  /Platform\.OS === 'ios' && !SERVER_UUID_PATTERN\.test\(workspaceId\)/g,
) ?? [];
if (iOSServiceWorkspaceGuards.length < 2) {
  throw new Error(
    'iOS Services must guard both composition loading and realtime subscription during logout.',
  );
}

console.log('iOS owner Face ID flow contracts: OK');
