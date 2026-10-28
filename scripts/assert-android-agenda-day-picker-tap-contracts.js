const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const agendaPath = path.join(root, 'app', '(tabs)', 'agenda.tsx');
const nativePath = path.join(
  root,
  'modules',
  'wheel-picker-haptics',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'wheelpickerhaptics',
  'WheelPickerHapticsModule.kt',
);
const agenda = fs.readFileSync(agendaPath, 'utf8');
const native = fs.readFileSync(nativePath, 'utf8');

const adapterStart = agenda.indexOf(
  'const AndroidNativeAgendaDayPickerAdapter = React.memo',
);
const adapterEnd = agenda.indexOf(
  'type IosPremiumDayCardProps',
  adapterStart,
);

if (adapterStart < 0 || adapterEnd <= adapterStart) {
  throw new Error('The Android native Agenda day picker adapter was not found.');
}

const adapter = agenda.slice(adapterStart, adapterEnd);

const requiredContracts = [
  ['commitNativePickerDate', 'the deduplicated date commit'],
  ['onSelectionChange={(event) => {', 'the native selection fallback'],
  ['isClosed: availability.closed', 'closed and blocked day state'],
  ['isPast: day.value < todayDate', 'past day state'],
  ['pendingCount: pendingRequestsCountByDate[day.value] ?? 0', 'occupied day badge state'],
  ['onDayLongPress(nextDate)', 'the close or unlock day action'],
];

for (const [needle, contract] of requiredContracts) {
  if (!adapter.includes(needle)) {
    throw new Error(`Android day picker is missing ${contract}.`);
  }
}

if (!adapter.includes('commitNativePickerDate(event.nativeEvent.value)')) {
  throw new Error(
    'The native picker event must use the deduplicated date commit.',
  );
}

if (
  adapter.includes('commitFastNativePickerTap') ||
  adapter.includes('nativePickerTouchRef') ||
  adapter.includes('PixelRatio.get()')
) {
  throw new Error('Android day selection must have one native owner, not a JS tap proxy.');
}

const nativeContracts = [
  ['override fun dispatchTouchEvent', 'native touch ownership'],
  ['requestDisallowInterceptTouchEvent(true)', 'tap and horizontal ownership'],
  ['dy > touchSlop && dy > dx', 'vertical-scroll release'],
  ['requestDisallowInterceptTouchEvent(false)', 'parent release'],
  ['if (didDrag) return false', 'tap-versus-drag guard'],
  ['selectTappedDay(index, deep = false)', 'exact native single-tap selection'],
  ['recyclerView.stopScroll()', 'stale momentum cancellation'],
  ['centerIndex(target)', 'immediate native centering'],
  ['private fun finalizeCenteredDay()', 'single final snap owner'],
  ['setPreviewIndex(next)', 'centered native preview during motion'],
  ['userAuthorityUntil = SystemClock.uptimeMillis() + 2_500L', 'late React echo guard'],
  ['HapticFeedbackConstants.CLOCK_TICK', 'scroll crossing haptics'],
  ['HapticFeedbackConstants.CONFIRM', 'tap confirmation haptics'],
  ['emit(onDayLongPress, index)', 'close or unlock long press bridge'],
  ['day.isFull -> Color.rgb(235, 239, 244)', 'only full days use premium gray'],
  ['day.isClosed -> Color.rgb(251, 224, 228)', 'current closed-day pink'],
  ['else -> Color.rgb(210, 243, 224)', 'current available-day green'],
  ['private val centerMarker = View(context)', 'fixed visual center marker'],
  ['private var selectionVisible = true', 'stationary selection presentation state'],
  ['setSelectionVisible(false)', 'no moving selected-card jump'],
  ['addView(centerLens)', 'fixed Android glass selector'],
  ['recyclerView.isNestedScrollingEnabled = false', 'single native gesture owner'],
];

for (const [needle, contract] of nativeContracts) {
  if (!native.includes(needle)) {
    throw new Error(`Android native day picker is missing ${contract}.`);
  }
}

const iosSource = agenda.slice(adapterEnd);
if (
  iosSource.includes('selectTappedDay') ||
  iosSource.includes('PickerRecyclerView')
) {
  throw new Error('The native Android day-tap engine must remain Android-only.');
}

console.log('Android Agenda day picker tap contracts passed.');
