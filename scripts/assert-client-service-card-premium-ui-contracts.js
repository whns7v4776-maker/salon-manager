/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app', 'cliente-screen.tsx'), 'utf8');

const sliceBetween = (container, startToken, endToken) => {
  const start = container.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = container.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return container.slice(start, end);
};

// The soft decorative circles belong to the wider web treatment only. Native keeps
// the same data, counters and accordion handlers while using the cleaner card shell.
assert.match(
  source,
  /\{isWeb \? <View pointerEvents="none" style=\{styles\.salonCommunicationsHeaderGlow\} \/> : null\}/,
  'The Communications decorative glow must be rendered on web only.',
);
assert.match(
  source,
  /\{isWeb \? <View pointerEvents="none" style=\{styles\.waitlistPremiumHeroGlow\} \/> : null\}/,
  'The waitlist decorative glow must be rendered on web only.',
);
assert.equal(
  (source.match(/styles\.salonCommunicationsHeaderGlow/g) ?? []).length,
  1,
  'The Communications glow must have no second, unconditional render path.',
);
assert.equal(
  (source.match(/styles\.waitlistPremiumHeroGlow/g) ?? []).length,
  1,
  'The waitlist glow must have no second, unconditional render path.',
);

const serviceCards = sliceBetween(
  source,
  'const renderBookingServiceCards = () => {',
  'const renderTopIntegratedWaitlistExpandedPanel',
);
const nativeUpper = sliceBetween(
  serviceCards,
  '{useUnifiedPremiumServiceCardBody ? (',
  '{isWeb && !useUnifiedPremiumServiceCardBody ? (',
);

assert.match(
  serviceCards,
  /const useUnifiedPremiumServiceCardBody = true;/,
  'App and web must render the same premium service-card hierarchy.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardUpperNative[\s\S]*?isWeb && styles\.serviceCardUpperPremiumWeb/,
  'Web must reuse the app premium card body with responsive geometry only.',
);
assert.match(
  serviceCards,
  /\{isWeb && !useUnifiedPremiumServiceCardBody \? \(/,
  'The legacy web service-card body must stay unreachable while the shared premium body is active.',
);
assert.match(
  serviceCards,
  /const webPremiumServiceCardHeight = isWeb[\s\S]*?\(isComboService \? 18 : 0\)[\s\S]*?\(servicePhaseConfig \? 28 : 0\)[\s\S]*?\(hasServiceDependencies \? 16 : 0\)[\s\S]*?\(showSeparatePromotionDetail \? 24 : 0\)[\s\S]*?height: webPremiumServiceCardHeight,[\s\S]*?minHeight: webPremiumServiceCardHeight,[\s\S]*?maxHeight: webPremiumServiceCardHeight/,
  'Complex web service cards must grow automatically for compositions, phases, dependencies and promotion details.',
);

assert.match(
  nativeUpper,
  /styles\.serviceCardHeroEmblemNative[\s\S]*?size=\{26\}[\s\S]*?styles\.serviceCardTitlePremiumNativeWrap[\s\S]*?numberOfLines=\{3\}[\s\S]*?minimumFontScale=\{0\.78\}/,
  'The rebuilt native upper card must reserve a larger hero icon and a bounded three-line title.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardIdentityPanelNative[\s\S]*?styles\.serviceCardRoleTagPremiumNative[\s\S]*?styles\.serviceCardRoleTagRailNative/,
  'The profession must live in a compact accented identity panel instead of a full-width input-like pill.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardIdentityPanelNative[\s\S]*?backgroundColor: isWeb[\s\S]*?'rgba\(255,255,255,0\.2\)'[\s\S]*?: 'rgba\(255,255,255,0\.07\)'[\s\S]*?!isWeb && usePremiumFrontendSurfaceBlur[\s\S]*?intensity=\{18\}[\s\S]*?styles\.serviceCardIdentityGlassBlurNative/,
  'Native must retain its light BlurView while web uses a crisp translucent identity surface.',
);
assert.doesNotMatch(
  nativeUpper,
  /\{usePremiumFrontendSurfaceBlur \? \([\s\S]*?<BlurView[\s\S]*?serviceCardIdentityGlassBlurNative/,
  'The service-card BlurView must never mount unguarded on web where Safari can blur its children.',
);
const premiumWebIdentityStyle = sliceBetween(
  source,
  'serviceCardIdentityPanelPremiumWeb: {',
  'serviceCardIdentityGlassBlurNative: {',
);
assert.match(
  premiumWebIdentityStyle,
  /isolation: 'isolate'[\s\S]*?boxShadow:/,
  'The web identity panel must preserve premium depth without backdrop blur.',
);
assert.doesNotMatch(
  premiumWebIdentityStyle,
  /backdropFilter|WebkitBackdropFilter|filter:/,
  'The crisp web identity surface must remain filter-free across Safari, Chromium and Firefox.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardOperatorPortraitPremiumNative[\s\S]*?isWeb && styles\.serviceCardOperatorPortraitPremiumWeb[\s\S]*?name="person" size=\{isWeb \? 20 : 18\}[\s\S]*?styles\.serviceCardOperatorStatusPremiumNative/,
  'The shared operator must keep the Agenda-like portrait and green status dot, scaled only for web.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardComboTagPremiumNative[\s\S]*?isWeb && styles\.serviceCardComboTagPremiumWeb[\s\S]*?minimumFontScale=\{isWeb \? 0\.58 : 0\.72\}/,
  'Combo and Composizione must expand and scale on web instead of being clipped.',
);
assert.match(
  nativeUpper,
  /nativeFeatureBadgeCount > 1 && styles\.serviceCardFeaturesMultiplePremiumNative[\s\S]*?isWeb && nativeFeatureBadgeCount > 1 && styles\.serviceCardFeaturesMultiplePremiumWeb/,
  'Multiple premium feature badges must switch their shared app and web lane to the stacked geometry.',
);
assert.equal(
  (nativeUpper.match(/nativeFeatureBadgeCount > 1 && styles\.serviceCardFeatureChipMultiplePremiumNative/g) ?? []).length,
  2,
  'Both Con posa and Collegato must use the full-width compact chip geometry when they coexist.',
);
assert.equal(
  (nativeUpper.match(/isWeb && nativeFeatureBadgeCount > 1 && styles\.serviceCardFeatureChipMultiplePremiumWeb/g) ?? []).length,
  2,
  'Both feature badges must receive the wider web geometry when they coexist.',
);
assert.equal(
  (nativeUpper.match(/nativeFeatureBadgeCount > 1 && styles\.serviceCardFeatureTextMultiplePremiumNative/g) ?? []).length,
  2,
  'Both multiple-badge labels must use the compact one-line type scale.',
);
assert.match(
  nativeUpper,
  /Con posa[\s\S]*?Collegato/,
  'The full Con posa and Collegato labels must remain explicit in the shared card.',
);
assert.doesNotMatch(
  nativeUpper,
  /serviceCardFeatureChipSplitPremium/,
  'The clipped side-by-side feature-badge geometry must not be rendered.',
);
assert.match(
  nativeUpper,
  /styles\.serviceCardComboTagPremiumNative[\s\S]*?numberOfLines=\{1\}[\s\S]*?minimumFontScale=\{isWeb \? 0\.58 : 0\.72\}[\s\S]*?\{isCompositionService \? 'Composizione' : 'Combo'\}/,
  'Combo and Composizione must stay on one responsive line inside the dark identity tag.',
);
assert.doesNotMatch(
  nativeUpper,
  />\s*>\s*\{isCompositionService \? 'Composizione' : 'Combo'\}/,
  'The Combo pill must not render an accidental extra text marker.',
);
const nativeUpperStyle = sliceBetween(
  source,
  'serviceCardUpperNative: {',
  'serviceCardHeroEmblemNative: {',
);
assert.match(
  nativeUpperStyle,
  /position: 'absolute'[\s\S]*?top: 10[\s\S]*?left: 7[\s\S]*?right: 7[\s\S]*?bottom: 76[\s\S]*?overflow: 'hidden'/,
  'The native upper panel must be geometrically isolated above the commerce separator.',
);
const portraitStyle = sliceBetween(
  source,
  'serviceCardOperatorPortraitPremiumNative: {',
  'serviceCardOperatorStatusPremiumNative: {',
);
const multipleFeatureLaneStyle = sliceBetween(
  source,
  'serviceCardFeaturesMultiplePremiumNative: {',
  'serviceCardFeaturesMultiplePremiumWeb: {',
);
assert.match(
  multipleFeatureLaneStyle,
  /height: 34[\s\S]*?flexDirection: 'column'[\s\S]*?justifyContent: 'center'[\s\S]*?gap: 2/,
  'Multiple feature badges must stack inside the original fixed lane without overlapping adjacent content.',
);
const multipleFeatureChipStyle = sliceBetween(
  source,
  'serviceCardFeatureChipMultiplePremiumNative: {',
  'serviceCardFeatureChipMultiplePremiumWeb: {',
);
assert.match(
  multipleFeatureChipStyle,
  /width: '100%'[\s\S]*?maxWidth: 88[\s\S]*?minHeight: 15[\s\S]*?maxHeight: 15/,
  'Native multiple badges must become wider and lower instead of truncating their labels.',
);
const singleFeatureChipStyle = sliceBetween(
  source,
  'serviceCardFeatureChipPremiumNative: {',
  'serviceCardPoseFeatureChipPremiumNative: {',
);
assert.match(
  singleFeatureChipStyle,
  /maxWidth: 84[\s\S]*?minHeight: 27[\s\S]*?maxHeight: 27/,
  'A single feature badge must keep the existing large premium geometry.',
);
assert.match(
  portraitStyle,
  /width: 30[\s\S]*?height: 30[\s\S]*?backgroundColor: 'rgba\(255,255,255,0\.96\)'/,
  'The rebuilt Agenda-like portrait must remain 30 points and visibly raised.',
);
const statusStyle = sliceBetween(
  source,
  'serviceCardOperatorStatusPremiumNative: {',
  'serviceCardComboTagPremiumNative: {',
);
assert.match(
  statusStyle,
  /right: 0[\s\S]*?bottom: 0[\s\S]*?width: 8[\s\S]*?height: 8[\s\S]*?backgroundColor: '#22C55E'[\s\S]*?borderColor: '#FFFFFF'/,
  'The green presence dot must stay fully inside the larger portrait.',
);
const commerceStyle = sliceBetween(
  source,
  'serviceCardCommerceBlockDenseNative: {',
  'serviceCardCommerceBlockWithClientBadge: {',
);
assert.match(
  commerceStyle,
  /position: 'absolute'[\s\S]*?bottom: 6[\s\S]*?height: 64[\s\S]*?paddingTop: 4[\s\S]*?borderTopWidth: 1[\s\S]*?borderTopColor: 'rgba\(255,255,255,0\.62\)'/,
  'The separator, duration and price commerce block must remain pixel-stable below the rebuild.',
);

assert.match(
  serviceCards,
  /const clientHighlightBadgeBackground =\s*clientHighlightTone\?\.backgroundColor;[\s\S]*?const clientHighlightBadgeBorder =\s*clientHighlightTone\?\.borderColor;/,
  'Client-highlight badges must retain their original saturated semantic colors.',
);
assert.doesNotMatch(
  serviceCards,
  /serviceClientHighlightBadge(?:Glass|Blur|Tint|Flare)/,
  'The restored saturated cloud badges must not be washed out by extra blur or tint layers.',
);
assert.match(
  serviceCards,
  /styles\.serviceClientHighlightBadgeTail[\s\S]*?backgroundColor: clientHighlightBadgeTail[\s\S]*?borderColor: clientHighlightBadgeBorder/,
  'The highlight tail must use the same saturated tone as its badge body.',
);
const densePhaseStyle = sliceBetween(
  source,
  'frontendServicePhaseTimelineContrastNative: {',
  'frontendServicePhaseTimelineFragment: {',
);
assert.match(
  densePhaseStyle,
  /backgroundColor: 'rgba\(255,255,255,0\.38\)'[\s\S]*?borderColor: 'rgba\(255,255,255,0\.68\)'/,
  'Dense native phase metrics must sit on a subtle contrast layer without changing commerce geometry.',
);
assert.match(
  serviceCards,
  /!isWeb && useDenseServiceCard && styles\.frontendServicePhaseTimelineContrastNative/,
  'The extra phase contrast must stay native-only and leave compact web cards unchanged.',
);
assert.match(
  serviceCards,
  /styles\.frontendServiceDurationPillGlassNative[\s\S]*?showServiceDurationClock[\s\S]*?displayedDurationLabel[\s\S]*?styles\.frontendServicePricePillGlassNative/,
  'The native footer must use only the two fitted duration and price surfaces.',
);
assert.doesNotMatch(
  serviceCards,
  /serviceCardCommerce(?:BlockGlass|GlassBlur|GlassTint|GlassSheen)Native/,
  'The footer must not render a third outer container around duration and price.',
);

assert.match(
  source,
  /onScroll=\{\(event\) => \{\s*servicesNativeScrollX\.setValue\(event\.nativeEvent\.contentOffset\.x\);\s*\}\}/,
  'The custom service cursor must receive a real ScrollView callback.',
);
assert.doesNotMatch(
  source,
  /onScroll=\{RNAnimated\.event/,
  'A plain ScrollView must never receive the Animated event mapping object that crashes Fabric.',
);
assert.match(
  source,
  /styles\.servicesScrollCursorNative[\s\S]*?styles\.servicesScrollCursorTrackNative[\s\S]*?styles\.servicesScrollCursorThumbNative/,
  'The native service carousel must expose a persistent progress cursor.',
);
assert.doesNotMatch(
  source,
  /Scorri in orizzontale per vedere gli altri servizi/,
  'The persistent cursor replaces the redundant service-scroll banner.',
);
assert.match(
  source,
  /styles\.frontendContinueToDayHintBlur[\s\S]*?>PROSSIMO PASSAGGIO<[\s\S]*?Step 2 · Scegli il giorno/,
  'The Step 2 continuation hint must use the rebuilt high-priority glass hierarchy.',
);
assert.match(source, /canChooseDay && shouldHoldBookingDayAutoScrollForServiceInfo \?/, 'Show the continuation only for service information sections.');
assert.match(source, /automaticDependencyRequired \|\| dependencyChoiceRequired \|\| customServiceContactEnabled/, 'Ordinary services must retain direct auto-scroll.');
assert.match(source, /accessibilityLabel="Vai allo step 2, scegli il giorno"[\s\S]*?scheduleWebBookingSectionScroll[\s\S]*?scrollBookingSectionIntoView/, 'The continuation must scroll on web and native.');
assert.match(source, /BookingNextStepArrow reduceMotion=\{reduceMotionEnabled\}/, 'The pulsing arrow must respect reduced motion.');
assert.doesNotMatch(
  source,
  /frontendServicesScrollHintTrail|frontendServicesScrollHintDot|frontendContinueToDayHintEndIcon/,
  'Passive guidance banners must not include trailing circular controls that look tappable.',
);

// Guard the pre-existing selection behavior: this visual refinement must not move
// state changes, booking-day scroll decisions or the selected-slot conflict check.
const selectionHandler = sliceBetween(
  serviceCards,
  'onPress={() => {\n            if (shouldIgnoreSelectionTap()) return;',
  'activeOpacity={0.9}',
);
assert.match(
  selectionHandler,
  /if \(isWeb\) \{\s*blurActiveWebElement\(\);\s*armWebSelectionScrollRestore\(\);\s*\}/,
  'Web selection must retain its focus and scroll-restoration contract.',
);
assert.match(
  selectionHandler,
  /setServizio\(item\.nome\);\s*setSelectedServiceId\(item\.id\);/,
  'Service selection must keep updating both service name and stable service id.',
);
assert.match(
  selectionHandler,
  /if \(!isWeb && shouldHoldDayStepForServiceInformation\)[\s\S]*?scheduleNativeBookingCustomServiceAutoScroll\(\)[\s\S]*?else if \(!isWeb && shouldAutoOpenDayStep && !didAutoScrollBookingDayStepRef\.current\)[\s\S]*?scheduleNativeBookingDayStepAutoScroll\(\)/,
  'Native service selection must retain the established Step 1 scroll decision.',
);
assert.match(
  selectionHandler,
  /hasFrontendSlotSelectionConflict\(\{[\s\S]*?serviceName: item\.nome[\s\S]*?\}\)[\s\S]*?setOra\(''\);/,
  'Changing service must still clear an incompatible selected slot.',
);
assert.doesNotMatch(
  selectionHandler,
  /serviceCardUpperNative|serviceCardHeroEmblemNative|serviceCardIdentityPanelNative|serviceCardOperatorPortraitPremiumNative|serviceCardComboTagPremiumNative/,
  'Presentation styles must remain outside the service-selection handler.',
);

console.log('Client premium service-card UI contracts: OK');
