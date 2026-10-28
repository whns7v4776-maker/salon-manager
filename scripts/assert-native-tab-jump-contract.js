/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const patchSource = fs.readFileSync(
  path.join(root, 'scripts', 'patch-react-native-tab-view-native-jump.js'),
  'utf8',
);
const ownerTabsLayoutSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', '_layout.tsx'),
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
const adapterSource = fs.readFileSync(
  path.join(
    root,
    'node_modules',
    'react-native-tab-view',
    'src',
    'PagerViewAdapter.tsx',
  ),
  'utf8',
);
const adapterModule = fs.readFileSync(
  path.join(
    root,
    'node_modules',
    'react-native-tab-view',
    'lib',
    'module',
    'PagerViewAdapter.js',
  ),
  'utf8',
);
const tabViewSource = fs.readFileSync(
  path.join(root, 'node_modules', 'react-native-tab-view', 'src', 'TabView.tsx'),
  'utf8',
);
const tabViewModule = fs.readFileSync(
  path.join(root, 'node_modules', 'react-native-tab-view', 'lib', 'module', 'TabView.js'),
  'utf8',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Check effective options by platform, rather than a literal `lazy: false`.
// iOS keeps every scene eager; Android loads heavy scenes on first use;
// web keeps its existing lazy route loading. The pager assertions below
// independently protect direct jumps, native swipe authority and retention.
function readSceneLoadingOptions(source) {
  const parsed = ts.createSourceFile('owner-tabs.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sharedOptions = [];
  const screens = new Map();
  const unwrap = (node) => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const readObject = (node) => {
    const object = unwrap(node);
    assert(ts.isObjectLiteralExpression(object), 'Le opzioni delle scene devono essere un oggetto verificabile.');
    const properties = new Map();
    for (const property of object.properties) {
      assert(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), 'Spread e proprietà dinamiche non possono aggirare il contratto delle scene.');
      assert(!properties.has(property.name.text), `Opzione duplicata: ${property.name.text}`);
      properties.set(property.name.text, property.initializer);
    }
    return properties;
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'screenOptions') {
      const initializer = node.initializer;
      assert(initializer && ts.isCallExpression(initializer) && ts.isArrowFunction(initializer.arguments[0]), 'screenOptions deve restare verificabile.');
      sharedOptions.push(readObject(initializer.arguments[0].body));
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'ExpoRouterMaterialTopTabs.Screen') {
      assert(node.attributes.properties.every(ts.isJsxAttribute), 'Le route non possono sovrascrivere le opzioni tramite spread.');
      const attributes = node.attributes.properties;
      const name = attributes.find((attribute) => attribute.name.getText(parsed) === 'name')?.initializer;
      const options = attributes.find((attribute) => attribute.name.getText(parsed) === 'options')?.initializer;
      assert(name && ts.isStringLiteral(name) && !screens.has(name.text), 'Ogni scena owner deve avere un nome univoco.');
      assert(options && ts.isJsxExpression(options) && options.expression, `Opzioni mancanti: ${name.text}`);
      screens.set(name.text, readObject(options.expression));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert(sharedOptions.length === 1, 'Deve esserci un solo insieme condiviso di opzioni owner.');
  return { parsed, shared: sharedOptions[0], screens };
}

function evaluateSceneOption(node, scope) {
  assert(node, 'Opzione richiesta mancante.');
  if (ts.isParenthesizedExpression(node)) return evaluateSceneOption(node.expression, scope);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isIdentifier(node) && Object.hasOwn(scope, node.text)) return scope[node.text];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return evaluateSceneOption(node.left, scope) || evaluateSceneOption(node.right, scope);
  }
  if (ts.isConditionalExpression(node)) {
    return evaluateSceneOption(node.condition, scope)
      ? evaluateSceneOption(node.whenTrue, scope)
      : evaluateSceneOption(node.whenFalse, scope);
  }
  throw new Error(`Espressione delle scene non verificata: ${node.getText()}`);
}

function assertSceneLoadingMatrix(source) {
  const options = readSceneLoadingOptions(source);
  const routes = ['index', 'agenda', 'prenotazioni', 'clienti', 'servizi', 'cassa', 'settings'];
  const progressiveRoutes = new Set(['agenda', 'prenotazioni', 'clienti', 'servizi']);
  assert([...options.screens.keys()].join(',') === routes.join(','), 'Le sette scene owner devono mantenere ordine e identità.');
  for (const platform of ['ios', 'android', 'web']) {
    for (const distance of [0]) {
      const scope = { IS_WEB: platform === 'web', IS_ANDROID: platform === 'android', androidOwnerTabPreloadDistance: distance };
      const evaluate = (node) => evaluateSceneOption(node, scope);
      assert(evaluate(options.shared.get('lazy')) === scope.IS_WEB, `${platform}: lazy condiviso deve essere disattivato su app e attivo su web.`);
      assert(evaluate(options.shared.get('animationEnabled')) === false, `${platform}: animazione programmatica del tap disattivata.`);
      assert(evaluate(options.shared.get('lazyPreloadDistance')) === 0, `${platform}: le scene nascoste non devono bloccare la pagina visibile.`);
      for (const route of routes) {
        const lazy = evaluate(options.screens.get(route).get('lazy') ?? options.shared.get('lazy'));
        const expected = platform === 'android'
          ? route !== 'index'
          : platform === 'web' && (route === 'index' || progressiveRoutes.has(route));
        assert(lazy === expected, `${platform}/${route}: lazy=${lazy}, atteso ${expected}.`);
      }
    }
  }
  return options;
}

const verifiedSceneOptions = assertSceneLoadingMatrix(ownerTabsLayoutSource);
// Negative controls prove that the platform-aware contract still catches
// eager Android cold starts, lazy iOS scenes and broken scene loading/tap options.
for (const [label, node, replacement] of [
  ['iOS lazy globale', verifiedSceneOptions.shared.get('lazy'), 'true'],
  ['web eager globale', verifiedSceneOptions.shared.get('lazy'), 'false'],
  ['iOS Agenda lazy', verifiedSceneOptions.screens.get('agenda').get('lazy'), 'true'],
  ['Android Agenda eager', verifiedSceneOptions.screens.get('agenda').get('lazy'), 'false'],
  ['Android precaricamento pesante', verifiedSceneOptions.shared.get('lazyPreloadDistance'), '4'],
  ['tap animato', verifiedSceneOptions.shared.get('animationEnabled'), 'true'],
]) {
  const mutated = ownerTabsLayoutSource.slice(0, node.getStart(verifiedSceneOptions.parsed)) + replacement + ownerTabsLayoutSource.slice(node.end);
  let rejected = false;
  try { assertSceneLoadingMatrix(mutated); } catch { rejected = true; }
  assert(rejected, `Il controllo negativo deve rifiutare: ${label}.`);
}

assert(
  packageJson.scripts.postinstall.includes(
    'patch-react-native-tab-view-native-jump.js',
  ),
  'Il postinstall deve riapplicare la correzione del tap sulle tab native.',
);
assert(
  patchSource.includes("supportedVersions = new Set(['4.3.0'])"),
  'La patch deve fermarsi sulle versioni di react-native-tab-view non verificate.',
);

const immediateTabTapStart = ownerTabsLayoutSource.indexOf(
  'const startImmediateTabTapNavigation',
);
const immediateTabTapEnd = ownerTabsLayoutSource.indexOf(
  'const tabBarDragGesture',
  immediateTabTapStart,
);
assert(
  immediateTabTapStart >= 0 && immediateTabTapEnd > immediateTabTapStart,
  'Il percorso del tap immediato deve restare isolato dalla gesture della barra.',
);
const immediateTabTapSource = ownerTabsLayoutSource.slice(
  immediateTabTapStart,
  immediateTabTapEnd,
);
const pendingAgendaConditionMatch = immediateTabTapSource.match(
  /if \(\s*IS_IOS &&\s*targetRouteName === "agenda" &&\s*immediateAgendaPendingRequestTarget\?\.data\s*\) \{/,
);
const pendingAgendaStart = pendingAgendaConditionMatch?.index ?? -1;
const pendingAgendaEnd = immediateTabTapSource.indexOf(
  'index !== activeVisibleIndex',
  pendingAgendaStart,
);
assert(
  pendingAgendaStart >= 0 && pendingAgendaEnd > pendingAgendaStart,
  'Il ramo Agenda iOS con richiesta pendente deve restare distinto dal tap ordinario.',
);
const pendingAgendaTapSource = immediateTabTapSource.slice(
  pendingAgendaStart,
  pendingAgendaEnd,
);
const pendingAgendaPagerJump = pendingAgendaTapSource.indexOf(
  'jumpTo(visibleRoutes[index].key);',
);
const pendingAgendaParamsDispatch = pendingAgendaTapSource.indexOf(
  'navigation.dispatch(',
);
assert(
  pendingAgendaPagerJump >= 0 &&
    pendingAgendaParamsDispatch > pendingAgendaPagerJump &&
    pendingAgendaTapSource.includes('TabActions.jumpTo("agenda", {') &&
    pendingAgendaTapSource.includes('openDetails: "false"'),
  'Agenda iOS con richiesta pendente deve muovere subito il PagerView prima di inoltrare i parametri senza apertura automatica.',
);

const regularTabTapSource = immediateTabTapSource.slice(pendingAgendaEnd);
assert(
  /if \(IS_WEB\) \{[\s\S]*?navigation\.dispatch\(TabActions\.jumpTo\(visibleRoutes\[index\]\.name\)\);[\s\S]*?\} else \{[\s\S]*?jumpTo\(visibleRoutes\[index\]\.key\);/.test(
    regularTabTapSource,
  ),
  'Il tap ordinario deve continuare a usare il PagerView diretto su app e il dispatch su web.',
);

assert(
  !/requestAnimationFrame\(\(\) => jumpTo/.test(regularTabTapSource),
  'Il comando nativo del tap non deve attendere un frame JS della scena uscente.',
);

const tabPressableStart = ownerTabsLayoutSource.indexOf(
  '<Pressable',
  immediateTabTapEnd,
);
const tabPressableEnd = ownerTabsLayoutSource.indexOf(
  '<TabBarItemVisual',
  tabPressableStart,
);
assert(
  tabPressableStart >= 0 && tabPressableEnd > tabPressableStart,
  'La Pressable della CustomBar deve restare verificabile.',
);
const tabPressableSource = ownerTabsLayoutSource.slice(
  tabPressableStart,
  tabPressableEnd,
);
const nativeTouchStart = tabPressableSource.slice(
  tabPressableSource.indexOf('onTouchStart='),
  tabPressableSource.indexOf('onPressIn='),
);
assert(
  nativeTouchStart.includes('IS_WEB') &&
    nativeTouchStart.includes('? undefined') &&
    nativeTouchStart.includes('primeTabSelection(index);') &&
    !nativeTouchStart.includes('startImmediateTabTapNavigation(') &&
    !nativeTouchStart.includes('jumpTo(') &&
    !nativeTouchStart.includes('navigation.dispatch('),
  'Il touch-down nativo deve agganciare subito il selettore senza duplicare direttamente il comando al pager.',
);
assert(
  /onPressIn=\{[\s\S]*?startImmediateTabTapNavigation\([\s\S]*?"press_in"/.test(
    tabPressableSource,
  ),
  'App e web devono comandare la tab gia al press-in, senza attendere il rilascio del dito.',
);

const screenOptionsStart = ownerTabsLayoutSource.indexOf(
  'const screenOptions = React.useMemo',
);
const screenOptionsEnd = ownerTabsLayoutSource.indexOf(
  'const renderOwnerTabBar',
  screenOptionsStart,
);
assert(
  screenOptionsStart >= 0 && screenOptionsEnd > screenOptionsStart,
  'Le opzioni del pager owner devono restare verificabili.',
);
const screenOptionsSource = ownerTabsLayoutSource.slice(
  screenOptionsStart,
  screenOptionsEnd,
);
assert(
  /animationEnabled:\s*false/.test(screenOptionsSource),
  'Il tap nativo deve restare immediato senza animazione programmatica.',
);

const pickerTouchStart = agendaSource.indexOf(
  'const markPickerTouchStart = useCallback',
);
const pickerTouchStartEnd = agendaSource.indexOf(
  'const settlePicker = useCallback',
  pickerTouchStart,
);
assert(
  pickerTouchStart >= 0 && pickerTouchStartEnd > pickerTouchStart,
  'Il touch-down del picker giorni deve restare verificabile.',
);
const pickerTouchStartSource = agendaSource.slice(
  pickerTouchStart,
  pickerTouchStartEnd,
);
assert(
  pickerTouchStartSource.indexOf('lockParentSwipeForPicker();') >= 0 &&
    pickerTouchStartSource.indexOf('lockParentSwipeForPicker();') <
      pickerTouchStartSource.indexOf('isPickerTouchActiveRef.current = true;') &&
    pickerTouchStartSource.includes('[lockParentSwipeForPicker]'),
  'Il picker giorni deve bloccare il pager al touch-down, prima della soglia di scroll.',
);
assert(
  agendaSource.includes(
    "onTouchStart={Platform.OS === 'web' ? undefined : markPickerTouchStart}",
  ) &&
    /const releaseParentSwipeAfterPicker = useCallback\([\s\S]*?\(delay = 90\)[\s\S]*?setDisableParentSwipe\(false\)/.test(
      agendaSource,
    ),
  'Il lock anticipato deve restare app-only e rilasciarsi dopo la coda del gesto.',
);

const nativePickerAdapterStart = agendaSource.indexOf(
  'const IosNativeAgendaDayPickerAdapter = React.memo',
);
const nativePickerAdapterEnd = agendaSource.indexOf(
  'const IosPremiumAgendaDayPicker = React.memo',
  nativePickerAdapterStart,
);
assert(
  nativePickerAdapterStart >= 0 &&
    nativePickerAdapterEnd > nativePickerAdapterStart,
  'L’adapter del picker nativo iOS deve restare verificabile.',
);
const nativePickerAdapterSource = agendaSource.slice(
  nativePickerAdapterStart,
  nativePickerAdapterEnd,
);
assert(
  /const lockNativeParentSwipe = useCallback\([\s\S]*?clearTimeout\(parentSwipeReleaseTimeoutRef\.current\)[\s\S]*?setDisableParentSwipe\(true\)/.test(
    nativePickerAdapterSource,
  ) &&
    /const releaseNativeParentSwipe = useCallback\([\s\S]*?\(delay = 90\)[\s\S]*?!nativeDragActiveRef\.current[\s\S]*?setDisableParentSwipe\(false\)/.test(
      nativePickerAdapterSource,
    ) &&
    nativePickerAdapterSource.includes('onTouchStart={() => {\n          lockNativeParentSwipe();') &&
    nativePickerAdapterSource.includes('releaseNativeParentSwipe();'),
  'Il picker nativo iOS deve mantenere il pager bloccato fino oltre la coda del touch.',
);

for (const [label, source] of [
  ['sorgente TypeScript', adapterSource],
  ['modulo JavaScript', adapterModule],
]) {
  assert(
    source.includes('pendingJumpIndexRef'),
    `${label}: manca l'autorita temporanea del jump nativo.`,
  );
  assert(
    source.includes('pendingJumpTimeoutRef.current = setTimeout'),
    `${label}: manca il fallback mantenuto per le piattaforme non Android.`,
  );
  assert(
    source.includes('}, 180)'),
    `${label}: il fallback del jump nativo non e quello verificato.`,
  );
  assert(
    source.includes('pendingIndex !== null && pendingIndex !== index'),
    `${label}: i risultati intermedi di tap rapidi possono sovrascrivere l'ultima tab richiesta.`,
  );
  assert(
    source.includes('fallbackIndex !== null && fallbackIndex !== index'),
    `${label}: un evento nativo in ritardo puo annullare il fallback gia confermato.`,
  );
  assert(
    source.includes('fallbackAlreadyCommitted'),
    `${label}: onPageSelected puo duplicare il fallback.`,
  );
  assert(
    source.includes("case 'dragging'"),
    `${label}: il percorso swipe non e piu presente.`,
  );
  assert(
    source.includes('androidNativeSwipeAuthorityRef') &&
      source.includes('androidPagerIdleRef'),
    `${label}: manca l'autorita nativa dello swipe Android.`,
  );
  assert(
    source.includes('androidPageCommitFrameRef') &&
      source.includes('requestAnimationFrame'),
    `${label}: manca il riallineamento del contenuto nel frame successivo.`,
  );
  assert(
    source.includes('const settledIndex = indexRef.current;') &&
      source.includes('indexRef.current !== settledIndex') &&
      source.includes('if (androidPagerIdleRef.current)') &&
      source.includes(
        "if (Platform.OS === 'android') {\n        indexRef.current = index;\n        pagerRef.current?.setPageWithoutAnimation(index);",
      ),
    `${label}: manca il fermo definitivo del selettore dopo lo swipe Android.`,
  );
}

const jumpBlock = adapterSource.slice(
  adapterSource.indexOf('const jumpTo = useLatestCallback'),
  adapterSource.indexOf('\n\n  React.useEffect(() => {', adapterSource.indexOf('const jumpTo = useLatestCallback')),
);
const androidDirectJumpStart = jumpBlock.indexOf(
  "if (Platform.OS === 'android') {",
);
const androidDirectJumpEnd = jumpBlock.indexOf(
  '\n    pendingJumpTimeoutRef.current = setTimeout',
  androidDirectJumpStart,
);
const androidDirectJumpBlock = jumpBlock.slice(
  androidDirectJumpStart,
  androidDirectJumpEnd,
);
assert(
  /if \(Platform\.OS === 'android'\) \{[\s\S]*?A programmatic tab press must not animate through every intermediate[\s\S]*?setPageWithoutAnimation\(index\);[\s\S]*?position\.setValue\(index\);[\s\S]*?offset\.setValue\(0\);[\s\S]*?indexRef\.current = index;[\s\S]*?onIndexChange\(index\);[\s\S]*?onTabSelect\?\.\(\{ index \}\);[\s\S]*?return;/.test(
    jumpBlock,
  ),
  'Su Android il pager deve saltare direttamente alla tab richiesta senza attraversare scene intermedie.',
);
assert(
  /onIndexChange\(index\);[\s\S]*?androidPageCommitFrameRef\.current = requestAnimationFrame[\s\S]*?pendingJumpIndexRef\.current !== index[\s\S]*?setPageWithoutAnimation\(index\);/.test(
    jumpBlock,
  ),
  'Il contenuto Android deve essere riallineato una sola volta dopo il commit della route.',
);
assert(
  androidDirectJumpStart >= 0 &&
    androidDirectJumpEnd > androidDirectJumpStart &&
    !androidDirectJumpBlock.includes('pagerRef.current?.setPage(index)'),
  'Il percorso di tap Android non deve riattivare lo scorrimento animato tra pagine intermedie.',
);
assert(
  !adapterSource.includes('scheduleAndroidSwipeAuthorityRelease') &&
    /Platform\.OS === 'android' && androidNativeSwipeAuthorityRef\.current[\s\S]*?androidPagerIdleRef\.current && indexRef\.current === index[\s\S]*?androidNativeSwipeAuthorityRef\.current = false;/.test(
      adapterSource,
    ),
  'Durante uno swipe Android lo stato React arretrato non deve comandare il pager nativo.',
);
assert(
  adapterSource.includes('androidProgrammaticRouteAckRef') &&
    /pendingJumpIndexRef\.current !== null[\s\S]*?androidProgrammaticRouteAckRef\.current[\s\S]*?Never send that stale[\s\S]*?return;/.test(
      adapterSource,
    ),
  'Un indice React arretrato non deve poter rimandare indietro il pager durante un tap Android.',
);
assert(
  /if \(Platform\.OS === 'android'\) \{[\s\S]*?androidNativeSwipeAuthorityRef\.current = true;[\s\S]*?onIndexChange\(index\);[\s\S]*?return;/.test(
    adapterSource.slice(adapterSource.indexOf('onPageSelected={(e) => {')),
  ),
  'Gli indici Android devono sincronizzare React senza riposizionare la pagina fisica.',
);
assert(
  /case 'idle':[\s\S]*?const settledIndex = indexRef\.current;[\s\S]*?position\.setValue\(settledIndex\);[\s\S]*?offset\.setValue\(0\);[\s\S]*?requestAnimationFrame[\s\S]*?indexRef\.current !== settledIndex/.test(
    adapterSource,
  ) &&
    /if \(androidPagerIdleRef\.current\) \{[\s\S]*?position\.setValue\(indexRef\.current\);[\s\S]*?offset\.setValue\(0\);[\s\S]*?return;/.test(
      adapterSource.slice(adapterSource.indexOf('onPageSelected={(e) => {')),
    ) &&
    patchSource.includes('sourceAndroidIdleSwipeStabilizationReplacements'),
  'A pager Android fermo gli eventi tardivi non devono piu spostare il selettore della CustomBar.',
);
const androidSelectedAuthorityStart = adapterSource.indexOf(
  'androidNativeSwipeAuthorityRef.current = true;',
  adapterSource.indexOf('onPageSelected={(e) => {'),
);
const androidSelectedBlock = adapterSource.slice(
  androidSelectedAuthorityStart,
  adapterSource.indexOf('return;', androidSelectedAuthorityStart),
);
assert(
  androidSelectedBlock.includes('position.setValue(index);') &&
    androidSelectedBlock.includes('offset.setValue(0);'),
  'La selezione nativa Android deve riallineare i valori grafici del pager prima di aggiornare React.',
);
assert(
  /setPageWithoutAnimation\(index\);\s*position\.setValue\(index\);\s*offset\.setValue\(0\);/.test(jumpBlock),
  'Il jump Android senza animazione deve azzerare anche lo scarto residuo dello swipe.',
);
const androidConfirmedSelectionBlock = adapterSource.slice(
  adapterSource.indexOf("if (Platform.OS === 'android' && pendingIndex !== null)"),
  adapterSource.indexOf("\n\n          if (Platform.OS === 'android')", adapterSource.indexOf("if (Platform.OS === 'android' && pendingIndex !== null)")),
);
assert(
  androidConfirmedSelectionBlock.includes('pendingIndex !== index') &&
    androidConfirmedSelectionBlock.includes('indexRef.current = index') &&
    androidConfirmedSelectionBlock.includes('position.setValue(index)') &&
    androidConfirmedSelectionBlock.includes('offset.setValue(0)') &&
    !androidConfirmedSelectionBlock.includes('onIndexChange(index)'),
  'La conferma nativa del tap Android deve soltanto chiudere il jump gia sincronizzato.',
);
const draggingBlock = adapterSource.slice(
  adapterSource.indexOf("case 'dragging'"),
  adapterSource.indexOf('const subscription = offset.addListener', adapterSource.indexOf("case 'dragging'")),
);
assert(
  draggingBlock.includes('androidNativeSwipeAuthorityRef.current = true') &&
    draggingBlock.includes('androidPagerIdleRef.current = false') &&
    draggingBlock.includes('pendingJumpIndexRef.current = null') &&
    draggingBlock.includes('cancelAnimationFrame(androidPageCommitFrameRef.current)'),
  'Uno swipe reale deve mantenere autorita nativa e annullare il tap pendente.',
);
const fallbackStart = jumpBlock.indexOf(
  'pendingJumpTimeoutRef.current = setTimeout',
);
const fallbackEnd = jumpBlock.indexOf(
  '}, 180);',
  fallbackStart,
);
const fallbackSource = jumpBlock.slice(fallbackStart, fallbackEnd);
assert(
  fallbackStart > jumpBlock.indexOf("if (Platform.OS === 'android')") &&
    fallbackEnd > fallbackStart &&
    fallbackSource.includes('pagerRef.current?.setPageWithoutAnimation(index);') &&
    fallbackSource.includes('onIndexChange(index)') &&
    !fallbackSource.includes('indexRef.current = index'),
  'Le piattaforme non Android devono conservare il fallback gia verificato.',
);
assert(
  adapterSource.includes('onPageSelected={(e) => {') &&
    adapterSource.includes('if (!fallbackAlreadyCommitted) {\n            onIndexChange(index);'),
  'onPageSelected deve restare l’autorita normale della sincronizzazione nativa.',
);
assert(
  ownerTabsLayoutSource.includes('IS_ANDROID ? 1 : undefined') &&
    !ownerTabsLayoutSource.includes('setAndroidOwnerTabPreloadDistance'),
  'Android mantiene una sola pagina nativa adiacente senza montaggi automatici in background.',
);
assert(
  tabViewSource.includes('offscreenPageLimit={offscreenPageLimit}') &&
    tabViewModule.includes('offscreenPageLimit: offscreenPageLimit') &&
    patchSource.includes('patchTabViewPagerRetention'),
  'Il limite di cache del PagerView nativo deve sopravvivere a postinstall.',
);
assert(
  servicesSource.includes("if (Platform.OS === 'web') {") &&
    servicesSource.includes('prepareServiceListForFocus();') &&
    servicesSource.includes('setServiceCardColorOverrides((current) => ({ ...current }))') &&
    servicesSource.includes('setRoleCardColorOverrides((current) => ({ ...current }))'),
  'Servizi nativo non deve ridisegnare catalogo e ruoli quando la pagina e gia calda.',
);
assert(
  servicesSource.includes('export default function ServiziScreen()'),
  'Servizi deve restare una route diretta; la matrice piattaforme verifica il caricamento della scena.',
);

assert(
  /const nativeSwipeLockContextValue = React.useMemo\([\s\S]*?\[effectiveDisableParentSwipe, safeSetDisableParentSwipe\]\)/.test(ownerTabsLayoutSource) &&
    ownerTabsLayoutSource.includes('value={nativeSwipeLockContextValue}'),
  'La navigazione non deve notificare nuovamente tutte le scene tramite un valore swipe-lock ricreato.',
);
const appContextSource = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const appStateStart = appContextSource.indexOf('function AppProviderState(');
assert(
  appStateStart > 0 &&
    !appContextSource.slice(appStateStart).includes('useSegments(') &&
    appContextSource.includes('React.memo(AppProviderState)') &&
    appContextSource.includes("Platform.OS === 'web' ? AppProviderState : MemoizedAppProviderState") &&
    appContextSource.includes('isOwnerProtectedContextRoute={isOwnerProtectedContextRoute}'),
  'Solo native deve isolare il provider dati dai cambi tab, continuando a ricevere i cambi reali della classificazione di accesso.',
);
console.log('Native tab jump contract passed.');
