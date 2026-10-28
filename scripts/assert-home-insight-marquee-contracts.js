/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
  'utf8',
);

const componentStart = source.indexOf('const HomeOverflowMarquee = memo(');
const componentEnd = source.indexOf(
  'const CUSTOMER_INSIGHT_SEARCH_COMMIT_DELAY_MS',
  componentStart,
);
const gridStart = source.indexOf('<View style={styles.insightGrid}>');
const gridEnd = source.indexOf('styles.priorityCard', gridStart);

assert.notEqual(componentStart, -1, 'Missing Home overflow marquee.');
assert.notEqual(componentEnd, -1, 'Missing Home overflow marquee boundary.');
assert.notEqual(gridStart, -1, 'Missing Home insight grid.');
assert.notEqual(gridEnd, -1, 'Missing Home insight grid boundary.');

const marqueeSource = source.slice(componentStart, componentEnd);
const insightGridSource = source.slice(gridStart, gridEnd);

assert.match(
  marqueeSource,
  /isNative && viewportWidth > 0 && textWidth > viewportWidth \+ 2/,
  'Home text must scroll only after measured native overflow.',
);
assert.match(
  marqueeSource,
  /shouldAnimate =[\s\S]*?isOverflowing && !reduceMotionEnabled && Platform\.OS !== 'android'[\s\S]*?Animated\.loop\([\s\S]*?useNativeDriver: true[\s\S]*?isInteraction: false/,
  'The marquee must stay smooth and non-blocking while Android uses its stable static fallback.',
);
assert.match(
  marqueeSource,
  /AccessibilityInfo\.isReduceMotionEnabled\(\)[\s\S]*?reduceMotionChanged[\s\S]*?subscription\.remove\(\)/,
  'Reduce Motion state and listener cleanup must remain wired.',
);
assert.match(
  marqueeSource,
  /accessible[\s\S]*?accessibilityRole="text"[\s\S]*?accessibilityLabel=\{text\}[\s\S]*?pointerEvents="none"/,
  'The animated text must expose one accessible label and never capture taps.',
);
assert.match(
  source,
  /<HomeOverflowMarquee\s+text=\{dashboardLastClientLabel\}[\s\S]*?styles\.insightHintPlum/,
  'The latest-client note must keep readable overflow behavior.',
);
assert.match(
  source,
  /IS_ANDROID \? \([\s\S]*?styles\.androidIncomeHint[\s\S]*?home_registered_movements[\s\S]*?: \([\s\S]*?<HomeOverflowMarquee\s+text=\{tApp\(appLanguage, 'home_registered_movements'\)\}[\s\S]*?styles\.insightHintMint/,
  'Android cash movements must use readable static text while the other platforms retain marquee behavior.',
);
assert.doesNotMatch(
  insightGridSource,
  /insightHint[^\n]*adjustsFontSizeToFit/,
  'Native Home notes must not be compressed into microscopic text.',
);
assert.match(
  source,
  /insightHint:\s*\{[\s\S]*?fontSize: Platform\.OS === 'web' \? 13 : 14,[\s\S]*?lineHeight: Platform\.OS === 'web' \? 18 : 20,[\s\S]*?homeOverflowMarqueeViewport:\s*\{[\s\S]*?overflow: 'hidden'/,
  'Native Home notes must gain readable fixed typography while web keeps its existing scale.',
);

console.log('Home insight marquee contracts: OK');
