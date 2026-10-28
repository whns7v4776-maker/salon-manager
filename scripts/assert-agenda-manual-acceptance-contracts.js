/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agenda = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);
const context = fs.readFileSync(
  path.join(root, 'src', 'context', 'AppContext.tsx'),
  'utf8',
);

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};
const requireTokenOrder = (source, tokens, message) => {
  let cursor = -1;
  tokens.forEach((token) => {
    const next = source.indexOf(token, cursor + 1);
    if (next <= cursor) {
      throw new Error(`${message} Missing or out of order: ${token}`);
    }
    cursor = next;
  });
};

requirePattern(
  agenda,
  /const selectedWeekManualAcceptOperatorOverride = useMemo\([\s\S]*?doOperatorsMatch\([\s\S]*?\? null\s*:\s*selectedWeekManualAcceptOperator;/,
  'A duration-only acceptance must omit the unchanged original operator.',
);
requirePattern(
  agenda,
  /title="Accetta e riduci orario"[\s\S]*?nextDuration,[\s\S]*?selectedWeekManualAcceptOperatorOverride\?\.operator\.id,[\s\S]*?selectedWeekManualAcceptOperatorOverride\?\.operator\.nome,/,
  'The duration picker must send only an intentional operator override.',
);
requirePattern(
  context,
  /operator_change_too_late[\s\S]*?acceptLateOperatorChangeDirectly = true;[\s\S]*?accept_owner_booking_request_with_operator_v2/,
  'A last-minute operator change must fall through to the atomic direct acceptance path.',
);
requirePattern(
  agenda,
  /const webCanUseMeasuredCompactLayout = !!\([\s\S]*?isWebAppointmentLayout[\s\S]*?safeWidth >= 104[\s\S]*?adaptiveUsableHeight >= 78[\s\S]*?safeWidth >= 180 && adaptiveUsableHeight >= 60[\s\S]*?safeWidth >= 300 && adaptiveUsableHeight >= 24[\s\S]*?useWebMeasuredCompactLayout = webCanUseMeasuredCompactLayout/,
  'Web cards must select the compact layout from measured space, independently of duration and density.',
);
requirePattern(
  agenda,
  /if \(useWebMeasuredCompactLayout\)[\s\S]*?webMeasuredServiceSource[\s\S]*?replace\(\/\(\[\/\+\]\)\/g, '\$1 '\)[\s\S]*?webMeasuredFullClientFitsOneLine[\s\S]*?\? \[clientLabel\][\s\S]*?: \[clientSurnameLabel\][\s\S]*?{segmentStartTime}–{appointmentEndTime}[\s\S]*?{webMeasuredClientLabel}[\s\S]*?webMeasuredServicePill/,
  'Every measured compact web card must keep time and full service while selecting one non-wrapping customer line from real width.',
);
requirePattern(
  agenda,
  /weekAppointmentPremiumWebReducedMainRow:\s*{[\s\S]*?paddingHorizontal: 4,[\s\S]*?weekAppointmentPremiumWebReducedMainRowHorizontal:[\s\S]*?paddingRight: 36,[\s\S]*?weekAppointmentPremiumWebReducedServicePillHorizontal:/,
  'The reduced web layout must reserve the drag handle and use a structured service row.',
);
requirePattern(
  agenda,
  /const webMeasuredNormalRequiredHeight = webMeasuredStatusLabel[\s\S]*?\? 172[\s\S]*?: 122;[\s\S]*?const webMeasuredTight =\s*adaptiveUsableHeight < webMeasuredNormalRequiredHeight;[\s\S]*?const webMeasuredHorizontalHeightLimit = prioritizeWebPhase \? 54 : 48;[\s\S]*?webMeasuredHorizontal = !!\([\s\S]*?webMeasuredTight &&[\s\S]*?safeWidth >= 300 &&[\s\S]*?adaptiveUsableHeight < webMeasuredHorizontalHeightLimit[\s\S]*?webMeasuredHorizontal \? webMeasuredServicePill : null[\s\S]*?!webMeasuredHorizontal \? webMeasuredServicePill : null/,
  'Measured web cards must stay vertical whenever their measured height fits the hierarchy, reserving the horizontal row for genuinely one-line slots.',
);
requirePattern(
  agenda,
  /const useCompactWebServiceMarquee = !!\([\s\S]*?webMeasuredTight \|\|[\s\S]*?safeWidth < 190 \|\|[\s\S]*?webMeasuredServiceLines\.length > 1[\s\S]*?\);[\s\S]*?weekAppointmentPremiumWebReducedServicePillMarquee[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{webServiceDisplayLabel\}[\s\S]*?weekAppointmentPremiumWebReducedServiceMarqueeViewport/,
  'Web appointment cards without measured room must keep the complete service in a non-interactive marquee.',
);
requirePattern(
  agenda,
  /const restoreWebSelectedDayOffset = useCallback\([\s\S]*?!IS_WEB[\s\S]*?requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\([\s\S]*?scrollToOffset\([\s\S]*?onContentSizeChange=\{\(contentWidth\) => \{[\s\S]*?IS_WEB && contentWidth > 0[\s\S]*?restoreWebSelectedDayOffset\(\)/,
  'The web day picker must retry centering the selected date after its content width is measurable.',
);
const measuredWebLayout = agenda.slice(
  agenda.indexOf('if (useWebMeasuredCompactLayout)'),
  agenda.indexOf('if (useEssentialAdaptiveLayout)'),
);
const essentialWebLayout = agenda.slice(
  agenda.indexOf('if (useEssentialAdaptiveLayout)'),
  agenda.indexOf('if (usePremiumWebAppointmentLayout)'),
);
const premiumWebLayout = agenda.slice(
  agenda.indexOf('if (usePremiumWebAppointmentLayout)'),
  agenda.indexOf('const detailLines = ['),
);
const numberedWebPhaseHelper = agenda.slice(
  agenda.indexOf('const webNumberedPhaseLabel ='),
  agenda.indexOf('const canSplitClientLabel ='),
);
if (/numberOfLines=|ellipsizeMode=/.test(measuredWebLayout)) {
  throw new Error(
    'Measured web cards must not restore line-clipping or ellipsis constraints.',
  );
}
if (/numberOfLines=|ellipsizeMode=/.test(numberedWebPhaseHelper)) {
  throw new Error(
    'The complete numbered web phase must not be line-clamped or ellipsized.',
  );
}
requirePattern(
  numberedWebPhaseHelper,
  /whiteSpace:\s*'nowrap'[\s\S]*?\{normalizedPhaseLabel\}/,
  'The complete numbered web phase must remain on one line.',
);
requireTokenOrder(
  measuredWebLayout,
  [
    '{webMeasuredAvatarSize > 0 ? (',
    '{webMeasuredShowsOperator ? (',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebReducedMainRow,',
  ],
  'Measured web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  agenda,
  /adaptiveUsableHeight >= 104 && safeWidth >= 125[\s\S]*?renderBookingOriginBadge\(true, safeWidth < 190\)[\s\S]*?: renderCompactWebBookingOriginBadge\(\)/,
  'Measured web cards must retain a compact origin badge when the full corner treatment does not fit.',
);
requirePattern(
  agenda,
  /compactCornerControlInset[\s\S]*?isWebAppointmentLayout[\s\S]*?safeWidth < 54[\s\S]*?\? 24[\s\S]*?reserveResizeFooter[\s\S]*?\? 34[\s\S]*?: 30[\s\S]*?nativeRawInformationHeight = Math\.max\([\s\S]*?interactionBottomInset - compactCornerControlInset/,
  'Compact cards must calculate text space only below the protected corner-control row.',
);
requirePattern(
  agenda,
  /getWebWeekResizeIndicatorHeight[\s\S]*?safeContentHeight < 38[\s\S]*?safeContentHeight - 10[\s\S]*?interactionBottomInset[\s\S]*?getWebWeekResizeIndicatorHeight\(safeHeight\) \+ 2/,
  'Only the physically shortest web row may compact its resize footer to preserve mandatory text.',
);
requirePattern(
  agenda,
  /renderCompactWebBookingOriginBadge[\s\S]*?weekAppointmentBookingOriginBadgeMicroWeb[\s\S]*?weekAppointmentBookingOriginBadgeMicroWeb:\s*{[\s\S]*?top: 7,[\s\S]*?left: 3,[\s\S]*?width: 18,[\s\S]*?height: 18,/,
  'Tight web cards must keep the provenance badge in a dedicated micro corner treatment aligned with the right drag handle.',
);
requirePattern(
  agenda,
  /protectedInteractionContentHeight = Math\.max\([\s\S]*?safeHeight - interactionBottomInset[\s\S]*?flexGrow: 0,[\s\S]*?flexShrink: 0,[\s\S]*?flexBasis: protectedInteractionContentHeight/,
  'Protected web appointment content must keep a real flex basis above the resize footer.',
);
requirePattern(
  agenda,
  /essentialWebPhaseReserve[\s\S]*?measureEssentialWebClientLines[\s\S]*?const lineCount =[\s\S]*?essentialWebIncludesTime \? 1 : 0[\s\S]*?\+\s*1\s*\+[\s\S]*?lines\.length[\s\S]*?essentialWebSingleClientMeasure\.fits[\s\S]*?\? \[clientLabel\][\s\S]*?: \[clientSurnameLabel\][\s\S]*?const essentialWebClientLongestLine[\s\S]*?essentialWebAvailableWidth/,
  'Physically tiny web cards must choose a single full-name or surname row from measured width and height.',
);
requirePattern(
  agenda,
  /styles\.weekAppointmentPremiumWebEssentialStack/,
  'Physically tiny web cards must use a dedicated protected text stack.',
);
requirePattern(
  agenda,
  /const essentialWebUsesExpandedStack = !!\([\s\S]{0,180}?essentialWebPhysicalHeight >= 120[\s\S]*?gap: clamp\([\s\S]{0,120}?essentialWebPhysicalHeight \* 0\.018,[\s\S]{0,80}?3\.5,[\s\S]{0,80}?6[\s\S]*?weekAppointmentPremiumWebEssentialStackExpanded:\s*\{[\s\S]{0,180}?justifyContent:\s*'center'/,
  'Essential web cards at 120px or taller must stay centered with a moderate dynamic gap.',
);
if (/justifyContent:\s*'space-evenly'/.test(essentialWebLayout)) {
  throw new Error(
    'Essential web cards must not stretch the content stack with space-evenly.',
  );
}
requirePattern(
  essentialWebLayout,
  /essentialWebAvatarHeightBudget[\s\S]*?safeWidth \* 0\.68[\s\S]*?essentialWebAvatarHeightBudget[\s\S]*?76[\s\S]*?width: clamp\(safeWidth \* 0\.72, 58, 72\)/,
  'Essential web cards must cap the avatar at 68%/76px and size the phase near 72% of safe width.',
);
requireTokenOrder(
  essentialWebLayout,
  [
    '{essentialWebAvatarSize > 0 ? (',
    '{essentialWebShowsOperator ? (',
    '{renderWebNumberedPhaseBadge({',
    '{essentialWebIncludesTime ? (',
    "text={essentialWebClientLines.join(' ')}",
    '{essentialWebServicePill}',
  ],
  'Normal essential web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  essentialWebLayout,
  /const essentialWebServicePill = \([\s\S]*?weekAppointmentPremiumWebEssentialServiceAccent[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{essentialServiceLabel\}[\s\S]*?weekAppointmentPremiumWebEssentialServiceMarqueeViewport[\s\S]*?if \(useWebEssentialSingleRow\)[\s\S]*?weekAppointmentPremiumWebEssentialSingleRowService[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{essentialServiceLabel\}[\s\S]*?weekAppointmentPremiumWebEssentialServiceMarqueeViewport/,
  'Essential web service badges, including the single row, must use the complete-service marquee.',
);
requirePattern(
  agenda,
  /weekAppointmentPremiumWebEssentialServicePill:\s*\{[\s\S]*?minWidth:\s*0[\s\S]*?overflow:\s*'hidden'[\s\S]*?weekAppointmentPremiumWebEssentialSingleRowService:\s*\{[\s\S]*?minWidth:\s*0[\s\S]*?weekAppointmentPremiumWebEssentialServiceMarqueeViewport:\s*\{[\s\S]*?width:\s*'auto'[\s\S]*?minWidth:\s*0[\s\S]*?alignSelf:\s*'stretch'/,
  'Essential service marquees must stay constrained inside shrinkable clipped viewports.',
);
requireTokenOrder(
  premiumWebLayout,
  [
    '{showPremiumWebAvatar ? (',
    'styles.weekAppointmentPremiumWebOperatorPill,',
    '{renderWebNumberedPhaseBadge({',
    'styles.weekAppointmentPremiumWebDetails,',
  ],
  'Premium web cards must render phase after avatar and operator and before time/details.',
);
requirePattern(
  agenda,
  /numberOfLines=\{IS_WEB \? undefined : 1\}[\s\S]*?quickServiceTitleMarqueeTextWeb[\s\S]*?textOverflow: 'clip'/,
  'Web marquees must never let React Native Web replace the full service name with an ellipsis.',
);
requirePattern(
  agenda,
  /isWebAppointmentLayout[\s\S]*?\? renderCompactWebBookingOriginBadge\(\)[\s\S]*?: adaptiveUsableHeight >= 44[\s\S]*?\? renderBookingOriginBadge\(true\)/,
  'The essential web fallback must preserve provenance while leaving native badge behavior unchanged.',
);
requirePattern(
  agenda,
  /!showExpandedPauseStrip[\s\S]*?quickCompositionAddPauseButton[\s\S]*?: IS_WEB \?[\s\S]*?quickCompositionAddPausePlaceholderWeb/,
  'Expanding the web pause strip must reserve the removed add-pause button width so the operator selector cannot shift.',
);
requirePattern(
  agenda,
  /quickCompositionPauseRowWeb:\s*{[\s\S]*?backgroundColor: '#F8FAFC'[\s\S]*?quickCompositionPauseEditorWeb:\s*{[\s\S]*?borderWidth: 0,[\s\S]*?backgroundColor: 'transparent'/,
  'The web pause editor must read as an integrated lower card band rather than a nested purple card.',
);
requirePattern(
  agenda,
  /quickCompositionBlock:\s*{[\s\S]*?width: '100%'[\s\S]*?borderRadius: 18,[\s\S]*?overflow: 'hidden'[\s\S]*?quickCompositionBlockWebRailCornerFill:\s*{[\s\S]*?backgroundColor: '#EEF2F7'/,
  'The web composition card must clip the gray rail against the real rounded card edge without exposing white corners.',
);
requirePattern(
  agenda,
  /weekStickyOperatorHeaderOverlay:\s*{[\s\S]*?zIndex: IS_WEB \? 120 : 16,/,
  'The sticky operator row must stay above Agenda cards but below web modals.',
);

console.log('Agenda manual acceptance and layering contracts passed.');
