/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const agendaSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const measuredWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (useWebMeasuredCompactLayout)'),
  agendaSource.indexOf('if (useEssentialAdaptiveLayout)'),
);
const essentialWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (useEssentialAdaptiveLayout)'),
  agendaSource.indexOf('if (usePremiumWebAppointmentLayout)'),
);
const premiumWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('if (usePremiumWebAppointmentLayout)'),
  agendaSource.indexOf('const detailLines = ['),
);
const overlapWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('const overlapCornerControlInset ='),
  agendaSource.indexOf('const appointmentCustomer = (() =>'),
);
const fallbackWebAppointmentSource = agendaSource.slice(
  agendaSource.indexOf('const fallbackWebPhaseHeight ='),
  agendaSource.indexOf('const quickBookingEligibleOperatorIds ='),
);
const sharedWebPhaseBadgeSource = agendaSource.slice(
  agendaSource.indexOf('const webNumberedPhaseLabel ='),
  agendaSource.indexOf('const canSplitClientLabel ='),
);
const essentialWebServiceStylesSource = agendaSource.slice(
  agendaSource.indexOf('weekAppointmentPremiumWebEssentialServicePill: {'),
  agendaSource.indexOf('weekAppointmentPremiumWebReducedCard: {'),
);

const assertTokenOrder = (source, tokens, message) => {
  let cursor = -1;
  tokens.forEach((token) => {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${message} Missing or out of order: ${token}`);
    cursor = next;
  });
};

assert.doesNotMatch(
  agendaSource,
  /if \(IS_WEB && item\.syntheticRequestViewedBySalon === true\) \{\s*return;\s*\}/,
  'Reading a pending request must not clear its web Agenda +1 badge.',
);
assert.doesNotMatch(
  agendaSource,
  /if \(item\.syntheticOperatorChangeStatus === 'pending'\) \{\s*return;\s*\}/,
  'A pending customer confirmation must continue to count in the Agenda +1 badge.',
);
assert.doesNotMatch(
  agendaSource,
  /waitingForCustomerDates/,
  'The badge stabilizer must not erase dates that are waiting for the customer.',
);
assert.match(
  agendaSource,
  /pendingOnDay > 0 &&[\s\S]{0,160}?\(IS_WEB \|\|[\s\S]{0,160}?IS_IOS \|\|[\s\S]{0,160}?!isCenteredSelectedCard \|\|[\s\S]{0,160}?isPickerGlassActive\)/,
  'The selected web day must retain its +1 badge at rest.',
);
assert.match(
  agendaSource,
  /styles\.dayCardPendingBadge,\s*IS_WEB && styles\.dayCardPendingBadgeWeb/,
  'Every web day card must use the same clipping-safe +1 placement.',
);
assert.match(
  agendaSource,
  /dayCardPendingBadgeWeb:\s*\{[\s\S]{0,260}?top:\s*-12,[\s\S]{0,100}?left:\s*'auto'[\s\S]{0,100}?right:\s*-7,[\s\S]{0,100}?marginLeft:\s*0,[\s\S]{0,100}?zIndex:\s*240/,
  'The web +1 must sit on the top-right corner for selected and unselected days.',
);
assert.match(
  agendaSource,
  /IS_WEB &&\s*pendingOnDay > 0 &&\s*styles\.dayCardWebPendingContent/,
  'Every web day with +1 must reserve vertical room below the centered badge.',
);
assert.doesNotMatch(
  agendaSource,
  /dayCardPendingBadgeWebSelected|dayCardHeaderWebPendingSelected/,
  'Selected and unselected web days must not diverge in +1 placement.',
);
assert.match(
  agendaSource,
  /const appointmentStartsAtRenderedSlot =\s*!!appointmentStart &&\s*\(IS_WEB\s*\? appointmentStart\.ora\.trim\(\)\.slice\(0, 5\) ===\s*slotTime\.trim\(\)\.slice\(0, 5\)\s*:\s*appointmentStart\.ora === slotTime\);/,
  'The standard web lane must keep +1 stable across HH:mm and HH:mm:ss snapshots.',
);
assert.match(
  agendaSource,
  /const laneAppointmentStartsAtRenderedSlot =\s*!!laneStartAppointment &&\s*\(IS_WEB\s*\? laneStartAppointment\.ora\s*\.trim\(\)\s*\.slice\(0, 5\) ===\s*slotTime\.trim\(\)\.slice\(0, 5\)\s*:\s*laneStartAppointment\.ora ===\s*slotTime\);/,
  'The operator-lane web view must keep +1 stable across HH:mm and HH:mm:ss snapshots.',
);
assert.match(
  agendaSource,
  /persistedOverlapLayout\?:[\s\S]{0,180}?reserveResizeFooter = true/,
  'Appointment content must receive the real resize-footer ownership.',
);
assert.match(
  agendaSource,
  /const interactionBottomInset = isWebAppointmentLayout\s*\? reserveResizeFooter\s*\? getWebWeekResizeIndicatorHeight\(safeHeight\) \+ 2\s*: 0\s*: reserveResizeFooter\s*\? getNativeWeekResizeIndicatorHeight\(safeHeight\) \+ 1\s*: 0/,
  'Web and native content must reserve their exact footer whenever a resize handle is rendered.',
);
assert.match(
  agendaSource,
  /const laneHasResizeFooter = !!\([\s\S]{0,220}?!isHistoricalLaneDisabled[\s\S]{0,160}?laneResizeEnabled[\s\S]{0,160}?\(IS_WEB \|\|\s*!laneNativeInteractionDisabled\)/,
  'Lane content and its visible resize handle must share one exact footer predicate.',
);
assert.match(
  agendaSource,
  /renderWeekAppointmentContent\([\s\S]{0,1800}?laneHasResizeFooter,/,
  'The lane renderer must consume the exact footer gate.',
);
assert.match(
  agendaSource,
  /resizeEnabled=\{\s*laneResizeEnabled\s*\}/,
  'The lane gesture owner must consume the same resize gate.',
);
assert.match(
  agendaSource,
  /const standardHasResizeFooter = !!\([\s\S]{0,200}?standardResizeEnabled[\s\S]{0,160}?\(IS_WEB \|\|\s*!standardNativeInteractionDisabled\)/,
  'Standard content and its visible resize handle must share one exact footer predicate.',
);
assert.match(
  agendaSource,
  /renderWeekAppointmentContent\([\s\S]{0,1200}?standardHasResizeFooter,/,
  'The standard renderer must consume the exact footer gate.',
);
assert.match(
  agendaSource,
  /resizeEnabled=\{\s*standardResizeEnabled\s*\}/,
  'The standard gesture owner must consume the same resize gate.',
);
assert.match(
  agendaSource,
  /const webPremiumMinimumHeight = reserveResizeFooter \? 212 : 183;[\s\S]{0,260}?const usesCompactCornerControlRow = isWebAppointmentLayout[\s\S]{0,180}?safeWidth < 148 \|\| safeHeight < webPremiumMinimumHeight[\s\S]{0,180}?safeHeight < 230 \|\| safeWidth < 58[\s\S]{0,180}?const compactCornerControlInset = usesCompactCornerControlRow[\s\S]{0,180}?safeWidth < 54[\s\S]{0,180}?reserveResizeFooter[\s\S]{0,100}?34[\s\S]{0,80}?30/,
  'Compact web cards must reserve a real first row for provenance and the drag hand.',
);
assert.match(
  agendaSource,
  /const useWebEssentialSingleRow = !!\([\s\S]{0,120}?essentialWebPhysicalHeight < 20/,
  'Ultra-short web cards must select their single-row renderer from physical height.',
);
assert.match(
  agendaSource,
  /if \(useWebEssentialSingleRow\)[\s\S]{0,1200}?weekAppointmentPremiumWebEssentialSingleRow[\s\S]{0,900}?text=\{essentialWebSingleRowClientLabel\}[\s\S]{0,1200}?weekAppointmentPremiumWebEssentialSingleRowService[\s\S]{0,800}?<NativeOverflowMarquee[\s\S]{0,260}?text=\{essentialServiceLabel\}/,
  'Ultra-short web cards must devote their only content row to customer and the full service.',
);
assert.match(
  essentialWebAppointmentSource,
  /if \(useWebEssentialSingleRow\)[\s\S]{0,900}?renderWebNumberedPhaseBadge\(\{[\s\S]{0,260}?appearance: 'micro'[\s\S]{0,260}?weekAppointmentPremiumWebEssentialSingleRow/,
  'Ultra-short phased web cards must put the shared phase badge before their only content row.',
);
assert.match(
  essentialWebAppointmentSource,
  /const essentialWebContentHeightAfterPhase = Math\.max\([\s\S]{0,180}?essentialWebPhysicalHeight - essentialWebPhaseReserve[\s\S]{0,180}?const essentialWebIncludesTime =[\s\S]{0,160}?essentialWebContentHeightAfterPhase >= 40/,
  'Ultra-short web cards must reserve the phase height before deciding whether time fits.',
);
assert.match(
  agendaSource,
  /persistedOverlapLayout[\s\S]{0,1800}?const useOverlapSingleRow = overlapContentHeight < 20[\s\S]{0,2800}?text=\{clientSurnameLabel\}[\s\S]{0,1800}?text=\{serviceLabel\}/,
  'Persisted overlap cards must marquee both the surname and full service instead of clipping them.',
);
assertTokenOrder(
  overlapWebAppointmentSource,
  [
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPersistedOverlapContent',
  ],
  'Persisted overlap cards must put the numbered phase above their content.',
);
assert.match(
  overlapWebAppointmentSource,
  /requestedOverlapContentTopInset = Math\.max\([\s\S]{0,220}?overlapPhaseTop \+ overlapPhaseHeight \+ 1/,
  'Persisted overlap content must reserve the phase badge height.',
);
assert.match(
  agendaSource,
  /weekPendingRequestBadgeCompact:\s*\{[\s\S]{0,120}?top:\s*1,[\s\S]{0,80}?right:\s*1,[\s\S]{0,100}?height:\s*12/,
  'A compact +N must stay inside its own card instead of covering the previous appointment.',
);
assert.match(
  agendaSource,
  /const compactPendingContentInset = !!\([\s\S]{0,100}?showPendingVisualOverride && safeHeight < 70[\s\S]{0,800}?interactionBottomInset > 0 \|\| compactPendingContentInset[\s\S]{0,900}?compactPendingContentInset[\s\S]{0,100}?paddingRight:\s*14/,
  'Tiny mandatory rows must reserve horizontal room for their internal +N badge.',
);
assert.match(
  agendaSource,
  /const usePremiumWebAppointmentLayout = !!\([\s\S]{0,140}?safeWidth >= 148[\s\S]{0,120}?premiumWebAvailableContentHeight >= 145[\s\S]*?weekAppointmentPremiumWebCardControlRow[\s\S]{0,160}?weekAppointmentPremiumWebCardWithoutResizeFooter[\s\S]{0,160}?protectedInteractionContentStyle/,
  'Rich web cards must be capacity-based, reserve the top controls and reclaim the missing footer on past appointments.',
);
assert.match(
  agendaSource,
  /useNanoWebCornerControls[\s\S]{0,800}?weekAppointmentBookingOriginBadgeNanoWeb/,
  'Extremely narrow web cards must shrink the provenance control.',
);
assert.match(
  agendaSource,
  /\(resolvedContentWidth \?\? 54\) < 54 &&[\s\S]{0,120}?weekAppointmentDragIndicatorWebNano/,
  'Extremely narrow web cards must shrink the drag control so the two corners cannot overlap.',
);
assert.match(
  agendaSource,
  /const webMeasuredShowsTimeIcon = !!\([\s\S]{0,160}?safeWidth >= 150[\s\S]{0,120}?webMeasuredTimeAvailableWidth >= 78/,
  'Narrow web time rows must drop the optional clock before cutting the time.',
);
assert.match(
  agendaSource,
  /const webMeasuredNormalRequiredHeight = webMeasuredStatusLabel\s*\? 172\s*: 122;[\s\S]{0,160}?const webMeasuredTight =\s*adaptiveUsableHeight < webMeasuredNormalRequiredHeight/,
  'Compact web cards must select their layout from real row capacity.',
);
assert.match(
  measuredWebAppointmentSource,
  /const webMeasuredShowsStatus = !!\([\s\S]{0,160}?!prioritizeWebPhase &&[\s\S]{0,100}?webMeasuredStatusLabel &&[\s\S]{0,100}?!webMeasuredTight[\s\S]{0,80}?\)/,
  'A measured card must not duplicate a numbered phase in its old status row.',
);
assert.match(
  agendaSource,
  /const useCompactWebServiceMarquee = !!\([\s\S]{0,160}?webMeasuredTight \|\|[\s\S]{0,100}?safeWidth < 190 \|\|[\s\S]{0,120}?webMeasuredServiceLines\.length > 1[\s\S]{0,80}?\);/,
  'Tight or narrow measured web cards must keep the full service in a marquee.',
);
assert.match(
  agendaSource,
  /const prioritizeWebPhase = !!\([\s\S]{0,100}?isWebAppointmentLayout && phaseDisplayPosition[\s\S]{0,80}?\);/,
  'Only a real numbered web phase may take priority over the time row.',
);
assert.match(
  sharedWebPhaseBadgeSource,
  /const webNumberedPhaseLabel = prioritizeWebPhase[\s\S]{0,80}?`FASE \$\{phaseDisplayPosition\}`[\s\S]{0,500}?if \(!webNumberedPhaseLabel\) return null/,
  'The shared web helper must render only a real numbered FASE x/y badge.',
);
assert.match(
  sharedWebPhaseBadgeSource,
  /appearance === 'premium'[\s\S]{0,220}?weekAppointmentPremiumWebStatusPill[\s\S]{0,220}?appearance === 'reduced'[\s\S]{0,220}?weekAppointmentPremiumWebReducedStatusPill[\s\S]{0,260}?weekAppointmentPremiumWebReducedCompactPhasePill/,
  'The shared phase helper must reuse the approved premium and compact badge styles.',
);
assert.doesNotMatch(
  sharedWebPhaseBadgeSource,
  /numberOfLines=|ellipsizeMode=/,
  'The numbered web phase must remain complete instead of being line-clamped or ellipsized.',
);
assert.match(
  sharedWebPhaseBadgeSource,
  /whiteSpace:\s*'nowrap'[\s\S]{0,180}?overflow:\s*'visible'[\s\S]{0,260}?\{normalizedPhaseLabel\}/,
  'The numbered web phase must keep its complete normalized label on one visible line.',
);
assert.equal(
  (agendaSource.match(/\{renderWebNumberedPhaseBadge\(\{/g) || []).length,
  6,
  'Overlap, measured, essential single-row, essential normal, premium and fallback must share the same phase renderer.',
);
assertTokenOrder(
  measuredWebAppointmentSource,
  [
    'const webMeasuredPhaseReserve =',
    'const webMeasuredAvatarHeightBudget =',
  ],
  'Measured cards must reserve the phase before calculating avatar capacity.',
);
assertTokenOrder(
  measuredWebAppointmentSource,
  [
    '{webMeasuredAvatarSize > 0 ? (',
    '{webMeasuredShowsOperator ? (',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebReducedMainRow,',
  ],
  'Measured cards must put the phase after avatar and operator, immediately before time and details.',
);
assert.doesNotMatch(
  measuredWebAppointmentSource,
  /webMeasuredShowsCompactPhaseRow|webMeasuredCompactPhasePill|webMeasuredServicePhaseRow/,
  'Measured cards must not keep a second phase beside the service.',
);
assert.match(
  measuredWebAppointmentSource,
  /const webMeasuredOmitsTimeForPhase = !!\([\s\S]{0,160}?webMeasuredTight[\s\S]{0,100}?safeWidth < 148[\s\S]{0,100}?prioritizeWebPhase[\s\S]{0,80}?\)[\s\S]*?!webMeasuredOmitsTimeForPhase \? \([\s\S]{0,260}?weekAppointmentPremiumWebReducedTimePill/,
  'A tight narrow measured card must still omit time after moving the phase above content.',
);
assertTokenOrder(
  essentialWebAppointmentSource,
  ['const essentialWebPhaseReserve =', 'const essentialWebAvatarHeightBudget ='],
  'Essential cards must reserve the phase before calculating avatar capacity.',
);
assert.match(
  essentialWebAppointmentSource,
  /weekAppointmentPremiumWebEssentialStack[\s\S]*?essentialWebAvatarSize > 0 \? \([\s\S]*?essentialWebShowsOperator \? \([\s\S]*?renderWebNumberedPhaseBadge\(\{[\s\S]{0,260}?essentialWebIncludesTime \? \(/,
  'Normal essential cards must put the phase after avatar and operator, immediately before time and details.',
);
assert.doesNotMatch(
  essentialWebAppointmentSource,
  /essentialWebShowsCompactPhaseRow|essentialWebShowsStandalonePhase|essentialWebCompactPhasePill|essentialWebServicePhaseRow/,
  'Essential cards must not keep a second phase beside the service or below the avatar.',
);
assert.match(
  agendaSource,
  /weekAppointmentPremiumWebEssentialCard:\s*\{[\s\S]{0,180}?justifyContent:\s*'center'[\s\S]{0,120}?paddingTop:\s*0/,
  'The essential web layout must center short-card content instead of pinning it to the top.',
);
assert.match(
  agendaSource,
  /weekAppointmentPremiumWebEssentialStack:\s*\{[\s\S]{0,180}?flexGrow:\s*0[\s\S]{0,100}?flexShrink:\s*1[\s\S]{0,100}?maxHeight:\s*'100%'/,
  'The essential web stack must retain its natural centered height inside 10/15-minute cards.',
);
assert.match(
  agendaSource,
  /const essentialWebUsesExpandedStack = !!\([\s\S]{0,180}?essentialWebPhysicalHeight >= 120[\s\S]*?essentialWebUsesExpandedStack && \{[\s\S]{0,180}?gap: clamp\([\s\S]{0,120}?essentialWebPhysicalHeight \* 0\.018,[\s\S]{0,80}?3\.5,[\s\S]{0,80}?6/,
  'Essential cards at 120px or taller must use a centered expanded stack with a moderate dynamic gap.',
);
assert.match(
  agendaSource,
  /weekAppointmentPremiumWebEssentialStackExpanded:\s*\{[\s\S]{0,180}?justifyContent:\s*'center'/,
  'The expanded essential stack must stay centered.',
);
assert.doesNotMatch(
  essentialWebAppointmentSource,
  /justifyContent:\s*'space-evenly'/,
  'The essential stack must not stretch its rows with space-evenly.',
);
assert.match(
  measuredWebAppointmentSource,
  /webMeasuredMandatoryHeight =[\s\S]*?webMeasuredOptionalHeight = Math\.max\([\s\S]*?webMeasuredShowsRole[\s\S]*?webMeasuredShowsOperator[\s\S]*?webMeasuredAvatarHeightBudget = Math\.max\([\s\S]*?safeWidth \* 0\.58[\s\S]*?webMeasuredAvatarHeightBudget[\s\S]*?82/,
  'Measured web cards must size the avatar from the space left after mandatory, operator, and role rows.',
);
assert.match(
  measuredWebAppointmentSource,
  /webMeasuredAvatarSize > 0 \? \([\s\S]*?assignedOperatorPhotoUri[\s\S]*?weekAppointmentPremiumWebAvatarStatusTight[\s\S]*?webMeasuredShowsOperator \? \([\s\S]*?text=\{webOperatorDisplayLabel\}[\s\S]*?webMeasuredShowsRole \? \([\s\S]*?color: webRoleTextColor/,
  'Measured web cards must progressively restore avatar, operator, and colored role without tying them to booking origin.',
);
assert.match(
  essentialWebAppointmentSource,
  /essentialWebMandatoryHeight =[\s\S]*?essentialWebOptionalHeight = Math\.max\([\s\S]*?essentialWebShowsRole[\s\S]*?essentialWebShowsOperator[\s\S]*?essentialWebAvatarHeightBudget = Math\.max\([\s\S]*?safeWidth \* 0\.68[\s\S]*?essentialWebAvatarHeightBudget[\s\S]*?76[\s\S]*?essentialWebLayoutHeight =[\s\S]*?essentialWebShowsRole[\s\S]*?essentialWebShowsOperator/,
  'Essential web cards must derive avatar, operator, and role from residual capacity with a 68%-width, 76px avatar cap.',
);
assert.match(
  essentialWebAppointmentSource,
  /essentialWebAvatarSize > 0 \? \([\s\S]*?assignedOperatorPhotoUri[\s\S]*?weekAppointmentPremiumWebAvatarStatusTight[\s\S]*?essentialWebShowsOperator \? \([\s\S]*?text=\{webOperatorDisplayLabel\}[\s\S]*?renderWebNumberedPhaseBadge\(\{[\s\S]{0,220}?width: clamp\(safeWidth \* 0\.72, 58, 72\)[\s\S]*?\{essentialWebServicePill\}[\s\S]*?essentialWebShowsRole \? \([\s\S]*?color: webRoleTextColor/,
  'Tall essential web cards must render avatar and operator before the 72%-width phase badge, then time and mandatory rows.',
);

const essentialServicePillSource = essentialWebAppointmentSource.slice(
  essentialWebAppointmentSource.indexOf('const essentialWebServicePill = ('),
  essentialWebAppointmentSource.indexOf('if (useWebEssentialSingleRow)'),
);
assert.match(
  essentialServicePillSource,
  /weekAppointmentPremiumWebEssentialServiceAccent[\s\S]{0,260}?<NativeOverflowMarquee[\s\S]{0,180}?text=\{essentialServiceLabel\}[\s\S]{0,220}?weekAppointmentPremiumWebEssentialServiceMarqueeViewport/,
  'The essential service badge must keep the complete label in its constrained marquee viewport.',
);
assert.match(
  essentialWebAppointmentSource,
  /if \(useWebEssentialSingleRow\)[\s\S]*?weekAppointmentPremiumWebEssentialSingleRowService[\s\S]{0,800}?<NativeOverflowMarquee[\s\S]{0,180}?text=\{essentialServiceLabel\}[\s\S]{0,220}?weekAppointmentPremiumWebEssentialServiceMarqueeViewport/,
  'The essential single-row fallback must use the same complete-service marquee.',
);
assertTokenOrder(
  essentialWebServiceStylesSource,
  [
    'weekAppointmentPremiumWebEssentialServicePill: {',
    'minWidth: 0,',
    "overflow: 'hidden',",
    'weekAppointmentPremiumWebEssentialSingleRowService: {',
    'minWidth: 0,',
    'weekAppointmentPremiumWebEssentialServiceMarqueeViewport: {',
    "width: 'auto',",
    'minWidth: 0,',
    "alignSelf: 'stretch',",
  ],
  'Essential service marquees must remain constrained by a shrinkable clipped pill and viewport.',
);
assert.match(
  premiumWebAppointmentSource,
  /premiumBaseDetailRows =[\s\S]*?premiumBaseDetailsHeight =[\s\S]*?premiumAvatarHeightBudget = Math\.max\([\s\S]*?premiumWebAvailableContentHeight[\s\S]*?premiumOperatorPillHeight[\s\S]*?premiumBaseDetailsHeight[\s\S]*?premiumTopPhaseHeight[\s\S]*?premiumRootGap \* \(prioritizeWebPhase \? 3 : 2\)[\s\S]*?premiumRoleReserve[\s\S]*?safeWidth \* 0\.62[\s\S]*?premiumAvatarHeightBudget[\s\S]*?124/,
  'Premium web cards must reserve the phase before computing the largest safe avatar.',
);
assertTokenOrder(
  premiumWebAppointmentSource,
  [
    '{showPremiumWebAvatar ? (',
    'styles.weekAppointmentPremiumWebOperatorPill,',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebDetails,',
  ],
  'Premium web cards must put the phase after avatar and operator, immediately before time and details.',
);
assert.match(
  premiumWebAppointmentSource,
  /const premiumDetailsStatusLabel = prioritizeWebPhase[\s\S]{0,100}?\? ''[\s\S]{0,100}?: phasePartLabel \|\| pendingStatusLabel[\s\S]*?\{premiumDetailsStatusLabel \? \(/,
  'Premium details must not duplicate a numbered phase after the shared badge.',
);
assert.match(
  fallbackWebAppointmentSource,
  /key: 'phase-part',[\s\S]{0,100}?text: prioritizeWebPhase \? '' : phasePartLabel/,
  'The fallback detail stack must suppress its old phase line on web.',
);
assert.match(
  fallbackWebAppointmentSource,
  /const fallbackWebPhaseReserve =[\s\S]{0,180}?fallbackWebPhaseHeight \+ fallbackWebPhaseGap[\s\S]{0,220}?fallbackTextContentHeight = Math\.max\([\s\S]{0,180}?textContentHeight - fallbackWebPhaseReserve/,
  'The fallback renderer must reserve the shared phase badge before sizing text.',
);
assertTokenOrder(
  fallbackWebAppointmentSource,
  [
    '{renderWebNumberedPhaseBadge({',
    '{largePhotoPlacement && operatorPhotoUri ? (',
  ],
  'The fallback renderer must put the phase above the operator photo when present, or first when absent.',
);
assert.match(
  premiumWebAppointmentSource,
  /showPremiumWebAvatar \? \([\s\S]*?assignedOperatorPhotoUri[\s\S]*?weekAppointmentPremiumWebAvatarStatus[\s\S]*?text=\{`CON \$\{premiumOperatorName\.toUpperCase\(\)\}`\}[\s\S]*?showPremiumWebRole \? \([\s\S]*?color: webRoleTextColor/,
  'Premium web cards must retain a full operator marquee and an adaptive colored role around the residual avatar.',
);
assert.match(
  agendaSource,
  /weekAppointmentPremiumWebReducedServiceMarqueeViewport:\s*\{[\s\S]{0,260}?width:\s*'auto'[\s\S]{0,140}?alignSelf:\s*'stretch'[\s\S]{0,140}?marginLeft:\s*9,[\s\S]{0,100}?marginRight:\s*2[\s\S]{0,120}?paddingLeft:\s*0/,
  'The reduced web marquee must reserve a clean gap after the colored accent.',
);

console.log('Web Agenda pending layout contracts: OK');
