const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
const expressions = [];
traverse(ast, {
  AssignmentExpression(path) {
    const n = path.node;
    if (n.left.name === 'restoredOperatori' && source.slice(n.right.start, n.right.end).includes('privateServerState.operatoriAuthoritative')) expressions.push(source.slice(n.right.start, n.right.end));
  },
  VariableDeclarator(path) {
    const n = path.node;
    if (n.id.name === 'mergedOperatori' && n.init && source.slice(n.init.start, n.init.end).includes('refreshedPrivateServerState?.operatoriAuthoritative')) expressions.push(source.slice(n.init.start, n.init.end));
  },
});
assert.equal(expressions.length, 2);
const active = ['Alex', 'Marco'];
const stale = [...active, 'Edoardo', 'Slavo', 'Sara'];
const merge = (a, b) => [...new Set([...a, ...b])];
for (const expression of expressions) {
  for (const current of [active, []]) {
    const scope = {
      privateServerState: { operatoriAuthoritative: true, operatori: current },
      refreshedPrivateServerState: { operatoriAuthoritative: true, operatori: current },
      fallbackPortalOperatori: stale, storedOperatori: stale, snapshotOperatori: stale, nextOperatori: stale,
      refreshedArchivedOperatori: [], normalizeOperatori: x => x,
      mergeOperatoriCollections: merge, filterRecentlyDeletedOperators: x => x,
      excludeArchivedOperators: x => x, getRecentlyDeletedOperatorMergeKeys: () => new Set(),
    };
    const evaluate = () => Function(...Object.keys(scope), `return (${expression});`)(...Object.values(scope));
    assert.deepEqual(evaluate(), current, 'Authoritative server membership must exclude stale cached operators, including an empty list');
    scope.refreshedPrivateServerState = undefined;
    assert.deepEqual(evaluate(), current, 'A failed background refresh must preserve the authoritative initial list');
    scope.privateServerState = { operatoriAuthoritative: false, operatori: [] };
    assert.deepEqual(evaluate().sort(), [...stale].sort(), 'Without authoritative data retain the offline fallback');
  }
}
console.log('Operator authoritative hydration: initial, background, empty list and offline fallback passed.');
