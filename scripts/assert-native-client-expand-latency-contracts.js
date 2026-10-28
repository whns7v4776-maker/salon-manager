/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const ownerClientsScreen = read('app/(tabs)/clienti.tsx');
const premiumExpandButton = read('components/ui/premium-expand-button.tsx');

const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const headerExpandBlock = sliceBetween(
  ownerClientsScreen,
  'const clearHeaderExpandTouchMarker = useCallback',
  'const releaseClientCardInteraction = useCallback',
);

assert.match(
  headerExpandBlock,
  /const markHeaderExpandTouchStart = useCallback\([\s\S]*?Platform\.OS === 'web'[\s\S]*?headerExpandTouchActiveRef\.current = true/,
  'Native client header expanders must mark their touch before the parent header can close swipe cards.',
);
assert.match(
  headerExpandBlock,
  /const deferHeaderExpandSwipeableCleanup = useCallback\([\s\S]*?Platform\.OS === 'web'[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?closeAllSwipeables\(\)/,
  'Native swipe-card cleanup must move to the next frame so expansion wins the first tap.',
);
assert.match(
  headerExpandBlock,
  /const handleClientiHeaderTouchStart = useCallback\([\s\S]*?Platform\.OS !== 'web' && headerExpandTouchActiveRef\.current[\s\S]*?return;[\s\S]*?closeAllSwipeables\(\)/,
  'Marked native touches must bypass synchronous cleanup while web retains the existing cleanup path.',
);

const headerToggleBlock = sliceBetween(
  headerExpandBlock,
  'const toggleNewCustomerExpanded = useCallback',
  'const handleClientiHeaderTouchStart = useCallback',
);
assert.match(
  headerToggleBlock,
  /setShowNewCustomerExpanded\([\s\S]*?deferHeaderExpandSwipeableCleanup\(\)[\s\S]*?setShowRubricaExpanded\([\s\S]*?deferHeaderExpandSwipeableCleanup\(\)/,
  'Both client header expanders must defer native swipe cleanup until after their state update.',
);
assert.doesNotMatch(
  headerToggleBlock,
  /haptic\.light/,
  'Client header toggles must not duplicate the shared premium expand-button haptic.',
);

assert.equal(
  (ownerClientsScreen.match(/on(?:Expand)?TouchStart=\{markHeaderExpandTouchStart\}/g) ?? []).length,
  2,
  'Only Rubrica and the native Nuovo cliente control should install the expand-touch marker.',
);
assert.match(
  ownerClientsScreen,
  /ListHeaderComponent=\{[\s\S]*?onTouchStart=\{handleClientiHeaderTouchStart\}/,
  'The Clienti list header must route outside touches through the marker-aware handler.',
);
assert.match(
  premiumExpandButton,
  /<HapticTouchable[\s\S]*?immediatePress[\s\S]*?hapticType="light"/,
  'PremiumExpandButton must remain the single immediate light-haptic owner for expand controls.',
);

console.log('Native client expand latency contracts: OK');
