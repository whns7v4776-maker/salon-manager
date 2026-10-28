const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/(tabs)/agenda.tsx', 'utf8');
for (const startMarker of [
  'webWeekDragConfirmation.buttons.map((button, index)',
  '(webWeekDragConfirmation?.buttons ?? []).map(',
]) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf('</HapticTouchable>', start);
  const render = source.slice(start, end);
  for (const color of ['#FFF0F0', '#F6BABA', '#EAF9EF', '#ADE0BD', '#B42328', '#176B3A']) {
    assert.ok(render.includes(color), `${startMarker}: missing ${color}`);
  }
  assert.ok(render.includes('closeWebWeekDragConfirmation(button, index)'));
  assert.ok(render.includes('hapticType={isDestructive'));
}
console.log('PASS: both pose-confirmation render paths apply red/green backgrounds and text; handlers and haptics retained');
