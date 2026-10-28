/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app', 'cliente-screen.tsx'), 'utf8');

const sliceBetween = (startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const customServiceScroll = sliceBetween(
  'const scheduleNativeBookingCustomServiceAutoScroll = useCallback',
  'const scheduleNativeBookingDayStepAutoScroll = useCallback',
);

assert.match(
  customServiceScroll,
  /if \(isWeb \|\| !customServiceContactEnabled\) \{\s*return;/,
  'Step 1 custom-service alignment must stay app-only and disabled when the custom-service card is absent.',
);
assert.match(
  customServiceScroll,
  /bookingServiceSectionLayoutRef\.current[\s\S]*?bookingCustomServiceContactLayoutRef\.current/,
  'The native alignment must use the latest measured Step 1 and custom-card layouts.',
);
assert.match(
  customServiceScroll,
  /safeAreaInsets\.top \+ 6[\s\S]*?serviceSectionLayout\.y \+ customServiceLayout\.y - safeTopOffset/,
  'The custom-service card must align immediately below the native safe area.',
);
assert.match(
  customServiceScroll,
  /scrollFrontendToY\(targetY, true\)/,
  'The alignment must only move the existing frontend scroll host.',
);
assert.match(
  customServiceScroll,
  /requestAnimationFrame\(scrollToLatestCustomServiceLayout\)[\s\S]*?setTimeout\(scrollToLatestCustomServiceLayout, 100\)[\s\S]*?setTimeout\(scrollToLatestCustomServiceLayout, 260\)[\s\S]*?setTimeout\(scrollToLatestCustomServiceLayout, 460\)/,
  'The app-only anchor must re-read layout while optional Step 1 sections settle.',
);

const serviceSelection = sliceBetween(
  'const shouldHoldDayStepForServiceInformation =',
  'const renderTopIntegratedWaitlistExpandedPanel',
);
assert.match(
  serviceSelection,
  /if \(!isWeb && shouldHoldDayStepForServiceInformation\) \{[\s\S]*?nativeBookingDayAutoScrollGenerationRef\.current \+= 1;[\s\S]*?if \(customServiceContactEnabled\) \{\s*scheduleNativeBookingCustomServiceAutoScroll\(\);/,
  'Selecting a service in app must anchor the custom-service card without advancing directly to Step 2.',
);
assert.equal(
  (source.match(/scheduleNativeBookingCustomServiceAutoScroll/g) ?? []).length,
  2,
  'The custom-service anchor must only be declared once and invoked from native Step 1 selection.',
);

assert.match(
  source,
  /\.\.\.\(!isWeb[\s\S]*?onLayout: \(event: LayoutChangeEvent\) => \{[\s\S]*?bookingServiceSectionLayoutRef\.current = \{[\s\S]*?onStartShouldSetResponderCapture/,
  'Only the native Step 1 card should capture its parent layout.',
);
assert.match(
  source,
  /customServiceContactEnabled && !isWeb \? \([\s\S]*?collapsable=\{false\}[\s\S]*?bookingCustomServiceContactLayoutRef\.current = \{[\s\S]*?renderCustomServiceContactCard\(\)/,
  'Only the native Step 1 custom-service card should receive the measured wrapper.',
);

assert.match(
  source,
  /const scheduleNativeBookingOperatorStepAutoScroll = useCallback/,
  'The Step 2 to operator scroll contract must remain present.',
);
assert.match(
  source,
  /const scheduleNativeBookingTimeStepAutoScroll = useCallback/,
  'The operator to time scroll contract must remain present.',
);

console.log('Client Step 1 custom-service native scroll contracts passed.');
