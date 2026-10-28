const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
const expression = source.match(/const shouldHoldOwnerHomeData =([\s\S]*?);/);
assert.ok(expression, 'Home readiness condition must exist');
// Evaluate the actual UI condition, including newline formatting, across
// platforms: Android must not bypass pending active-device verification.
const shouldHold = new Function(
  'ownerHomeDataSettled', 'Platform', 'ownerMobileSessionAccessReady',
  `return (${expression[1]});`,
);
for (const os of ['ios', 'android', 'web']) {
  for (const settled of [false, true]) {
    for (const ready of [false, true]) {
      assert.equal(
        shouldHold(settled, { OS: os }, ready),
        !settled || (os !== 'web' && !ready),
        `${os}: data settled=${settled}, session ready=${ready}`,
      );
    }
  }
}
console.log('Native Home session readiness: OK (12 state combinations)');
