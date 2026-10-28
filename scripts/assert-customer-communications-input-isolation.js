/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'components', 'customer-communications-modal.tsx'),
  'utf8',
);

const sliceBetween = (startToken, endToken) => {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `Missing contract start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `Missing contract end: ${endToken}`);
  return source.slice(start, end);
};

const draftFields = sliceBetween(
  'const CommunicationDraftFields = memo(',
  'const DeferredCommunicationQueryInput = memo(',
);
assert.match(
  draftFields,
  /const \[draft, setDraft\] = useState<CommunicationDraft>\(seed\.value\)/,
  'Title and message must be owned by the isolated composer subtree.',
);
assert.match(
  draftFields,
  /draftRef\.current = nextDraft;[\s\S]*?setDraft\(nextDraft\)/,
  'Every keystroke must update the immediate ref before local rendering.',
);
assert.match(draftFields, /value=\{draft\.title\}/);
assert.match(draftFields, /value=\{draft\.body\}/);
assert.match(
  draftFields,
  /previousValidity\.title === nextValidity\.title[\s\S]*?previousValidity\.body === nextValidity\.body[\s\S]*?return;/,
  'The full communication modal may rerender only when validation state changes, not per character.',
);

const deferredQuery = sliceBetween(
  'const DeferredCommunicationQueryInput = memo(',
  'export function CustomerCommunicationsModal(',
);
assert.match(
  deferredQuery,
  /const \[value, setValue\] = useState\(seed\.value\)/,
  'Search echo must stay local to the search field.',
);
assert.match(
  deferredQuery,
  /setTimeout\(\(\) => \{[\s\S]*?onCommit\(nextValue\);[\s\S]*?\}, 100\)/,
  'The expensive recipient filter must receive a settled query.',
);
assert.match(deferredQuery, /onBlur=\{commitCurrentValue\}/);
assert.match(deferredQuery, /onSubmitEditing=\{commitCurrentValue\}/);

assert.doesNotMatch(
  source,
  /const \[(?:title|body), set(?:Title|Body)\] = useState/,
  'The full modal must not own title or message keystrokes.',
);
assert.doesNotMatch(
  source,
  /onChangeText=\{setQuery\}/,
  'Recipient search must not refilter the client list for every keystroke.',
);
assert.match(
  source,
  /<CommunicationDraftFields[\s\S]*?seed=\{communicationDraftSeed\}[\s\S]*?draftRef=\{communicationDraftRef\}/,
  'The live modal must mount the isolated composer.',
);
assert.match(
  source,
  /<DeferredCommunicationQueryInput[\s\S]*?seed=\{querySeed\}[\s\S]*?onCommit=\{commitQuery\}/,
  'The live modal must mount the deferred recipient search.',
);

const applyTemplate = sliceBetween(
  'const applyTemplate =',
  'const templateActionsTemplate =',
);
assert.match(
  applyTemplate,
  /syncCommunicationDraft\(\{ title: template\.title, body: template\.body \}\)/,
  'Applying a template must synchronously replace both local draft fields.',
);

const beginEditing = sliceBetween(
  'const beginTemplateEditing =',
  'const cancelTemplateEditing =',
);
assert.match(
  beginEditing,
  /const currentDraft = communicationDraftRef\.current;[\s\S]*?title: currentDraft\.title,[\s\S]*?body: currentDraft\.body/,
  'Template editing must snapshot the exact visible draft, including the latest active-field keystroke.',
);
assert.match(
  beginEditing,
  /syncCommunicationDraft\(\{ title: template\.title, body: template\.body \}\)/,
);

const cancelEditing = sliceBetween(
  'const cancelTemplateEditing =',
  'const saveTemplate =',
);
assert.match(
  cancelEditing,
  /syncCommunicationDraft\(\{[\s\S]*?title: templateEditSnapshot\.title,[\s\S]*?body: templateEditSnapshot\.body/,
  'Cancelling template editing must restore the exact previous draft.',
);

const saveTemplate = sliceBetween('const saveTemplate =', 'const deleteTemplate =');
assert.match(
  saveTemplate,
  /const currentDraft = communicationDraftRef\.current;/,
  'Template save must read the immediate draft at tap time.',
);
assert.match(
  saveTemplate,
  /saveCustomerCommunicationTemplate\(\{[\s\S]*?title: currentDraft\.title,[\s\S]*?body: currentDraft\.body,[\s\S]*?icon: templateIcon,[\s\S]*?templateId: editingTemplateId/,
  'Template create/update must preserve its authoritative payload.',
);

const send = sliceBetween('const send =', 'return (');
assert.match(
  send,
  /const currentDraft = communicationDraftRef\.current;/,
  'Send must read the immediate draft at tap time.',
);
assert.match(
  send,
  /sendCustomerCommunication\(\{[\s\S]*?title: currentDraft\.title,[\s\S]*?body: currentDraft\.body,[\s\S]*?targets: selectedClients\.map/,
  'Sending must preserve title, message, and selected-recipient payloads.',
);

const resetAndClose = sliceBetween('const resetAndClose =', 'const applyTemplate =');
assert.match(resetAndClose, /syncCommunicationDraft\(\{ \.\.\.EMPTY_COMMUNICATION_DRAFT \}\)/);
assert.match(resetAndClose, /resetQuery\(\)/);
assert.match(resetAndClose, /setSelectedIds\(new Set\(\)\)/);

console.log('Customer communications input isolation contracts: OK');
