/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const servicesSource = read('app/(tabs)/servizi.tsx');
const datePickerSource = read('components/ui/native-date-picker-modal.tsx');

const sliceBetween = (source, startToken, endToken, label) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing ${label} start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing ${label} end: ${endToken}`);
  return source.slice(start, end);
};

const operatorCreatePeriod = sliceBetween(
  servicesSource,
  '<Text style={styles.operatorAvailabilityTitle}>Periodo attivo da-a</Text>',
  '<HapticTouchable\n                    style={[\n                      styles.buttonLightDanger,',
  'operator create active period',
);
assert.match(
  operatorCreatePeriod,
  /<NativeDatePickerModal[\s\S]*?allowQuickPicker=\{datePickerTarget === 'start' \|\| datePickerTarget === 'end'\}/,
  'Operator date ranges must expose the safe quick picker.',

);

const operatorModal = sliceBetween(
  servicesSource,
  '<NativeEditTextDraftBoundary<NativeOperatorEditTextDraft>',
  '</NativeEditTextDraftBoundary>',
  'native operator edit modal',
);
assert.match(
  operatorModal,
  /<NativeDatePickerModal[\s\S]*?embedded[\s\S]*?calendarOnly=\{Platform\.OS === 'ios'\}[\s\S]*?visible=\{datePickerTarget === 'start' \|\| datePickerTarget === 'end'\}/,
  'The edit-operator date range must stay inside the existing modal and avoid RNDateTimePicker on iOS.',
);
assert.match(
  operatorModal,
  /if \(datePickerTarget === 'start'\)[\s\S]*?setAvailabilityStartDate\(value\)[\s\S]*?setAvailabilityEndDate\(value\)[\s\S]*?else if \(datePickerTarget === 'end'\)[\s\S]*?setAvailabilityEndDate\(value\)[\s\S]*?setAvailabilityStartDate\(value\)/,
  'The existing start/end ordering correction must remain intact.',
);

const operatorModalStart = servicesSource.indexOf(
  '<NativeEditTextDraftBoundary<NativeOperatorEditTextDraft>',
);
const operatorDraftBoundaryEnd = servicesSource.indexOf(
  '</NativeEditTextDraftBoundary>',
  operatorModalStart,
);
const operatorRootModalEnd = servicesSource.indexOf('</Modal>', operatorDraftBoundaryEnd);
const appointmentImpactStart = servicesSource.indexOf(
  '<AppointmentImpactModal',
  operatorRootModalEnd,
);
assert.ok(
  operatorModalStart >= 0 &&
    operatorDraftBoundaryEnd >= 0 &&
    operatorRootModalEnd >= 0 &&
    appointmentImpactStart >= 0,
  'The native operator modal boundaries must remain discoverable.',
);
const afterOperatorModal = servicesSource.slice(operatorRootModalEnd, appointmentImpactStart);
assert.doesNotMatch(
  afterOperatorModal,
  /<NativeDatePickerModal/,
  'The operator picker must not create a second native Modal outside its edit popup.',
);

assert.match(
  datePickerSource,
  /setShowCalendarGrid\(IS_WEB \|\| calendarOnly\)/,
  'calendarOnly must select the JavaScript calendar path.',
);
assert.match(
  datePickerSource,
  /\{calendarOnly \|\| showCalendarGrid \|\| allowQuickPicker \? \(/,
  'calendarOnly must block RNDateTimePicker during the first visible render, before effects run.',
);
assert.match(
  datePickerSource,
  /if \(Platform\.OS !== 'android' \|\| calendarOnly \|\| allowQuickPicker\) return;[\s\S]*?DateTimePickerAndroid\.open\([\s\S]*?mode: 'date'/,
  'Android must retain its existing imperative native date picker when calendarOnly is false.',
);

console.log('Operator active-period crash contracts: OK');
