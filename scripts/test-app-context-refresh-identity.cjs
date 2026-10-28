const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToString } = require('react-dom/server');

const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const ast = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let contextDeclaration, hookDeclaration, providerReturn;
const contextImports = [];
for (const statement of ast.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(ast) === 'AppContext') contextDeclaration = `const ${declaration.getText(ast)};`;
    }
  }
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'useAppContext') hookDeclaration = statement.getText(ast);
  if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'AppProviderState') {
    providerReturn = statement.body.statements.filter(ts.isReturnStatement).at(-1)?.getText(ast);
  }
  if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier?.text === './AppContextCore') {
    contextImports.push(statement.getText(ast));
  }
}
assert.ok(providerReturn?.includes('AppContext.Provider'), 'Exercise the real provider return expression');

const compilerOptions = { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React };
const corePath = 'src/context/AppContextCore.ts';
let core;
if (fs.existsSync(corePath)) {
  const output = ts.transpileModule(fs.readFileSync(corePath, 'utf8'), { compilerOptions }).outputText;
  assert.ok(!output.includes('require("./AppContext")'), 'The context core must not import the state module at runtime');
  core = {};
  vm.runInNewContext(output, { exports: core, require: name => {
    assert.equal(name, 'react');
    return React;
  } });
}
const value = { salonWorkspace: { id: 'audit-context', salonCode: 'AUDIT' } };
function loadRevision() {
  const factory = `${contextDeclaration || ''}\n${hookDeclaration || ''}\n${contextImports.join('\n')}
    function RetainedProvider({ children }) { const contextValue = value; ${providerReturn} }
    exports.Provider = RetainedProvider;`;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(factory, { compilerOptions, fileName: 'context.tsx' }).outputText, {
    exports, React, createContext: React.createContext, useContext: React.useContext, value,
    CustomerMoveNoticeDialog: () => null,
    require: name => {
      assert.equal(name, './AppContextCore');
      return core;
    },
  });
  return exports;
}
const before = loadRevision();
const after = loadRevision();
function render(provider, consumer) {
  function BadgeConsumer() {
    assert.equal(consumer.useAppContext(), value, 'Context data and callback identity must be preserved');
    return React.createElement('span', null, consumer.useAppContext().salonWorkspace.salonCode);
  }
  return renderToString(React.createElement(provider.Provider, null, React.createElement(BadgeConsumer)));
}
assert.equal(render(before, before), '<span>AUDIT</span>', 'Initial load works');
assert.equal(render(after, after), '<span>AUDIT</span>', 'Cold reload works');
assert.equal(render(before, after), '<span>AUDIT</span>', 'Retained provider must serve consumers from a re-evaluated state module');
console.log('PASS real React context identity: initial/cold reload and retained-provider/refreshed-consumer pairing, unchanged value identity.');
