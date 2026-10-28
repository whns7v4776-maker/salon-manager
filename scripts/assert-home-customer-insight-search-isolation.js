/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
  'utf8'
);

const componentStart = source.indexOf('const DeferredCustomerInsightSearchInput = memo(');
const componentEnd = source.indexOf('export default function HomeScreen()', componentStart);
assert.notEqual(componentStart, -1, 'Missing isolated Focus clienti search component.');
assert.notEqual(componentEnd, -1, 'Missing HomeScreen boundary after isolated search.');
const isolatedSearch = source.slice(componentStart, componentEnd);

assert.match(
  isolatedSearch,
  /const \[localValue, setLocalValue\] = useState\(value\)/,
  'Focus clienti must keep the visible input value local.'
);
assert.match(
  isolatedSearch,
  /setTimeout\([\s\S]*?CUSTOMER_INSIGHT_SEARCH_COMMIT_DELAY_MS/,
  'The expensive Home filter must receive a settled query, not every keystroke.'
);
assert.match(isolatedSearch, /onBlur=\{flushPendingValue\}/, 'Blur must flush the pending query.');
assert.match(
  isolatedSearch,
  /onSubmitEditing=\{flushPendingValue\}/,
  'Search submit must flush the pending query.'
);
assert.match(
  isolatedSearch,
  /if \(active\) return;[\s\S]*?clearPendingCommit\(\);[\s\S]*?setLocalValue\(value\)/,
  'Closing the popup must discard pending local search state.'
);

assert.doesNotMatch(
  source,
  /onChangeText=\{setCustomerInsightSearchQuery\}/,
  'HomeScreen must not rerender directly for each Focus clienti keystroke.'
);
assert.match(
  source,
  /<DeferredCustomerInsightSearchInput[\s\S]*?active=\{showCustomerInsightsModal\}[\s\S]*?value=\{customerInsightSearchQuery\}[\s\S]*?onCommit=\{setCustomerInsightSearchQuery\}/,
  'The Focus clienti popup must use the isolated search and preserve the existing filter state.'
);

console.log('Home customer insight search isolation contracts: OK');
