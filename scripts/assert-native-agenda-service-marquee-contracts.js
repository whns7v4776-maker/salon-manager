/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const agendaSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'agenda.tsx'),
  'utf8',
);

const priorityRenderer = agendaSource.match(
  /const renderNativePriorityInformationLayout = \(\) => \{([\s\S]*?)\n\s*\};\n\n\s*if \(useMaximumPanoramaEssentialLayout\)/,
)?.[1];
const maximumPanoramaBranch = agendaSource.match(
  /if \(useMaximumPanoramaEssentialLayout\) \{([\s\S]*?)\n\s*\}\n\n\s*if \(useNativeMinimalInformationLayout\)/,
)?.[1];
const nativeMinimalBranch = agendaSource.match(
  /if \(useNativeMinimalInformationLayout\) \{([\s\S]*?)\n\s*\}\n\n\s*if \(useAdaptivePremiumAppointmentLayout\)/,
)?.[1];
const adaptiveNativeAnchor =
  'styles.weekAppointmentPremiumMobileCard,\n              isTenOrFifteenMinuteSlot';
const adaptiveNativeAnchorIndex = agendaSource.indexOf(adaptiveNativeAnchor);
const adaptiveNativeRendererStart = agendaSource.lastIndexOf(
  'return (',
  adaptiveNativeAnchorIndex,
);
const adaptiveNativeRendererEnd = agendaSource.indexOf(
  'if (usePremiumWebAppointmentLayout)',
  adaptiveNativeAnchorIndex,
);
const adaptiveNativeRenderer =
  adaptiveNativeRendererStart >= 0 && adaptiveNativeRendererEnd >= 0
    ? agendaSource.slice(
        adaptiveNativeRendererStart,
        adaptiveNativeRendererEnd,
      )
    : '';

assert.ok(priorityRenderer, 'Native priority renderer must exist.');
assert.ok(maximumPanoramaBranch, 'Maximum Panorama branch must exist.');
assert.ok(nativeMinimalBranch, 'Native minimal branch must exist.');
assert.ok(adaptiveNativeRenderer, 'Adaptive native renderer must exist.');

assert.match(
  priorityRenderer,
  /priorityClientLabel = fullClientFitsOneLine[\s\S]*?clientLabel[\s\S]*?clientSurnameLabel[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{serviceLabel\}[\s\S]*?weekAppointmentPremiumNativeServiceMarqueeViewport/,
  'Native compact cards must automatically shorten only the client name while preserving the complete scrolling service.',
);
assert.doesNotMatch(
  priorityRenderer,
  /minimumFontScale=\{0\.42\}/,
  'Native compact services must not shrink to an unreadable size.',
);
assert.match(
  agendaSource,
  /const hasMandatoryNativePhaseStatus = !!\(\s*!isWebAppointmentLayout && phasePartLabel\s*\);/,
  'Only real native phase/pose labels, never generic pending states, may enter the mandatory compact fallback.',
);
assert.doesNotMatch(
  priorityRenderer,
  /weekAppointmentPremiumNativeTopPhase|renderNativeTopPhaseBadge|canUseNativeTopPhaseBadge/,
  'Native phase, pose, and resume pills must not occupy a fixed top row in the compact renderer.',
);
assert.match(
  agendaSource,
  /App: la fascia superiore appartiene soltanto alla provenienza[\s\S]*?nativeRawInformationHeight = Math\.max\([\s\S]*?safeHeight - interactionBottomInset - compactCornerControlInset/,
  'The native top inset must belong only to provenance while the adaptive body receives all remaining height above resize.',
);
assert.match(
  priorityRenderer,
  /mandatoryNativePhaseNeedsFallback =\s*hasMandatoryNativePhaseStatus[\s\S]*?showMandatoryNativePhaseRow[\s\S]*?nativeInformationHeight >= 20[\s\S]*?renderMandatoryNativePhaseFallback\(\)/,
  'A compact native card with vertical capacity must keep its real phase in a centered body row above the client and complete service.',
);
assert.doesNotMatch(
  agendaSource,
  /useNativeSingleRowInformationLayout|weekAppointmentPremiumNativeMinimalSingleRow|MandatoryPhaseSingleRow/,
  'Native appointments must never use the microscopic horizontal fallback.',
);
assert.match(
  priorityRenderer,
  /renderMandatoryNativePhaseFallback[\s\S]*?pointerEvents="none"/,
  'Adaptive native phase badges must never take ownership away from drag or resize gestures.',
);
assert.match(
  agendaSource,
  /weekAppointmentPremiumNativeMandatoryPhaseRowPill:\s*\{[\s\S]*?alignSelf:\s*'center'[\s\S]*?maxWidth:\s*'76%'/,
  'The native body phase row must stay small and centered inside the appointment card.',
);
assert.match(
  agendaSource,
  /const mobileBodyStatusLabel = phasePartLabel \|\| pendingStatusLabel;/,
  'Roomier native cards must keep phase, pose, and resume inside their central adaptive body.',
);
assert.match(
  agendaSource,
  /const useWideShortAdaptiveLayout = false;/,
  'Native wide cards must keep the same vertical avatar-first hierarchy instead of returning to side-by-side columns.',
);
assert.match(
  priorityRenderer,
  /priorityPlainTimeHeight = 12[\s\S]*?showPriorityTime = remainingHeight >= 30[\s\S]*?if \(showPriorityTime\) remainingHeight -= priorityPlainTimeHeight[\s\S]*?priorityAvatarSize =[\s\S]*?Math\.min\(safeWidth - 12, remainingHeight\)[\s\S]*?64[\s\S]*?if \(priorityAvatarSize > 0\) remainingHeight -= priorityAvatarSize[\s\S]*?showPriorityOperator[\s\S]*?remainingHeight >= 14/,
  'Compact native cards must reserve a separate plain-time row, maximize the full-width avatar, then admit the optional operator only from residual height.',
);
assert.match(
  priorityRenderer,
  /renderBookingOriginBadge\(true, true\)[\s\S]*?weekAppointmentPremiumNativeAvatarTopRow[\s\S]*?renderNativeOperatorAvatar\(priorityAvatarSize\)[\s\S]*?showPriorityTime[\s\S]*?weekAppointmentPremiumNativePlainTimeText[\s\S]*?\{showPriorityOperator \?[\s\S]*?weekAppointmentPremiumNativeOperatorPill[\s\S]*?\{showMandatoryNativePhaseRow[\s\S]*?renderMandatoryNativePhaseFallback\(\)[\s\S]*?weekAppointmentPremiumNativeMinimalClient[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{serviceLabel\}[\s\S]*?\{showPriorityRole \?/,
  'Compact native cards must use the visual order: origin overlay, avatar, plain time, operator, centered phase, client, full service, role.',
);
assert.match(
  adaptiveNativeRenderer,
  /renderBookingOriginBadge\([\s\S]*?!isWebAppointmentLayout \?[\s\S]*?weekAppointmentPremiumNativeAvatarTopRow[\s\S]*?renderNativeOperatorAvatar\(nativeStackedAvatarSize\)[\s\S]*?showNativeAdaptiveTime[\s\S]*?weekAppointmentPremiumNativePlainTimeText[\s\S]*?\{showNativeOperatorBadge \?[\s\S]*?weekAppointmentPremiumNativeOperatorPill[\s\S]*?\{showMobileStatus \?[\s\S]*?weekAppointmentPremiumMobileStatusPill[\s\S]*?weekAppointmentPremiumMobileClient[\s\S]*?<NativeOverflowMarquee[\s\S]*?text=\{serviceLabel\}[\s\S]*?\{showMobileRole \?/,
  'Roomier native cards must stack avatar above plain time, then preserve operator, phase, client, full service and role.',
);
assert.match(
  agendaSource,
  /showNativeAdaptiveTime = !!\([\s\S]*?adaptiveUsableHeight >= \(showMobileStatus \? 96 : 70\)[\s\S]*?nativeStackedAvatarSize =[\s\S]*?mobileAvatarSize \+[\s\S]*?showNativeAdaptiveTime \|\| nativeAvatarOriginCollisionRisk[\s\S]*?\? 0[\s\S]*?: 12[\s\S]*?safeWidth - 10[\s\S]*?72/,
  'Low native cards must remove time before the avatar and return that vertical budget unless the provenance corner needs collision clearance.',
);
assert.doesNotMatch(
  priorityRenderer,
  /weekAppointmentPremiumWebTimePill|weekAppointmentPremiumMobileTimePill/,
  'Compact native appointment time must remain plain text without a space-heavy badge.',
);
assert.match(
  adaptiveNativeRenderer,
  /\) : \(\s*<View[\s\S]*?weekAppointmentPremiumWebTimePill[\s\S]*?webAdaptiveTimePillWidth/,
  'The pre-existing time pill must remain confined to the web branch.',
);

const maximumDensityRowHeight = 23;
const rowGap = 1;
const fifteenMinuteCardHeight = maximumDensityRowHeight * 3 + rowGap * 2;
const fifteenMinuteResizeFooter =
  Math.max(18, Math.min(27, fifteenMinuteCardHeight * 0.16)) + 1;
const compactCornerRow = 24;
const fifteenMinuteInformationHeight =
  fifteenMinuteCardHeight - fifteenMinuteResizeFooter - compactCornerRow;
const microClientAndServiceHeight = 22;

assert.equal(
  fifteenMinuteCardHeight,
  71,
  'The maximum-density 15-minute acceptance case must stay tied to the real native geometry.',
);
assert(
  fifteenMinuteInformationHeight - microClientAndServiceHeight < 15,
  'The maximum-density 15-minute acceptance case must exercise the vertical micro renderer under tight capacity.',
);
for (const [name, branch] of [
  ['Maximum Panorama', maximumPanoramaBranch],
  ['native minimal', nativeMinimalBranch],
]) {
  assert.match(
    branch,
    /return renderNativePriorityInformationLayout\(\);/,
    `${name} must use the shared capacity-aware priority renderer.`,
  );
}

console.log('Native Agenda service marquee contracts: OK');
