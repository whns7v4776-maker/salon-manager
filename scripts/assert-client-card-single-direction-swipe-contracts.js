/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'clienti.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const swipeActions = sliceBetween(
  'const renderSwipeActions = () => (',
  'const renderManagementActions = () => (',
);

assert.match(
  swipeActions,
  /swipeActionsColumnRight/,
  'Native customer actions must open in one right-side column.',
);

const orderedLabels = [
  'Modifica',
  'Tempi e prezzi',
  'Limite',
  'Inibisci',
  'Elimina',
];
let lastLabelPosition = -1;
for (const label of orderedLabels) {
  const position = swipeActions.indexOf(label);
  assert.ok(position > lastLabelPosition, `${label} must keep its position in the action column.`);
  lastLabelPosition = position;
}

assert.match(
  swipeActions,
  /eliminaCliente\(item\.id, item\.full_name\)/,
  'Delete must retain the existing customer deletion callback.',
);

const nativeSwipeable = sliceBetween(
  '<ReanimatedSwipeable',
  '</ReanimatedSwipeable>',
);
assert.match(nativeSwipeable, /renderRightActions=\{renderSwipeActions\}/);
assert.doesNotMatch(nativeSwipeable, /renderLeftActions=/);
assert.match(nativeSwipeable, /dragOffsetFromRightEdge=\{5\}/);
assert.match(nativeSwipeable, /rightThreshold=\{10\}/);
assert.match(nativeSwipeable, /overshootLeft=\{false\}/);
assert.match(nativeSwipeable, /overshootRight=\{false\}/);

assert.match(
  source,
  /name="arrow-back-outline"[\s\S]*?Scorri verso sinistra per le azioni/,
  'The native hint must describe the single leftward gesture.',
);
assert.doesNotMatch(source, /swap-horizontal-outline/);

assert.match(
  source,
  /isDesktopWeb \? \([\s\S]*?webClientActionsHintWrap/,
  'The separate web action entry point must remain available.',
);

assert.match(
  source,
  /styles\.clienteCardNativeShadow,[\s\S]*?<HapticTouchable[\s\S]*?styles\.clienteCard,[\s\S]*?styles\.clienteCardNativePremium/,
  'Native customer cards must separate the rounded shadow shell from the clipped touch surface.',
);
assert.match(
  source,
  /clienteCardNativePremium:[\s\S]*?backgroundColor: '#F5F9FE'[\s\S]*?shadowOpacity: 0[\s\S]*?overflow: 'hidden'/,
  'The inner native surface must clip its decoration cleanly to the rounded card.',
);
assert.match(
  source,
  /clienteCardNativeShadow:[\s\S]*?borderRadius: 28[\s\S]*?shadowOpacity: 0[\s\S]*?elevation: 0/,
  'The outer native shell must keep every rectangular platform shadow disabled.',
);
assert.match(
  source,
  /clienteCardDepthFar[\s\S]*?clienteCardDepthSoft[\s\S]*?clienteCardDepthMid[\s\S]*?clienteCardDepthNear/,
  'Native cards must build depth from ordered rounded translucent layers.',
);
assert.doesNotMatch(
  source,
  /clienteCardNativeShadow:[\s\S]{0,500}?boxShadow:|<FeDropShadow|clienteCardNativeSvgShadow/,
  'Native customer cards must not fall back to rectangular platform or SVG filter shadows.',
);

console.log('Client card single-direction swipe contracts: OK');
