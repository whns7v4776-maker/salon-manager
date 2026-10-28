const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const file = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const runtimeStart = source.indexOf('  const rejectOwnerMobileSessionActivation');
let checked = 0;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'supabase.auth.signOut' && node.getStart(file) >= runtimeStart) {
    const options = node.arguments[0];
    assert(options && ts.isObjectLiteralExpression(options), 'Runtime logout must specify its scope');
    const scope = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(file) === 'scope');
    assert(scope && ts.isStringLiteral(scope.initializer) && scope.initializer.text === 'local',
      `Logout at line ${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1} must preserve other device sessions`);
    checked++;
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert(checked >= 7, 'Cover ordinary logout, retries, restore, account switch and mobile conflict paths');
console.log(`PASS: ${checked} runtime session exits preserve other web/app sessions`);
