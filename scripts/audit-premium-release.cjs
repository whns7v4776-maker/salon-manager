/* Read-only source/catalog audit. This script never calls a database or publishes a release. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'work/premium-switch-20261025'));
fs.mkdirSync(out, { recursive: true });
const server = JSON.parse(fs.readFileSync(path.join(out, 'server-catalog.json'), 'utf8'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const files = ['app', 'components', 'src', 'modules', 'config', 'plugins', 'public', 'assets', 'supabase'].flatMap(dir => fs.existsSync(path.join(root, dir)) ? walk(path.join(root, dir)).filter(file => !/\/(?:node_modules|build|\.gradle|\.temp)\//.test(file)) : []);
for (const name of ['app.config.js','package.json','package-lock.json','eas.json','vercel.json','tsconfig.json','.easignore','.vercelignore']) files.push(path.join(root,name));
const code = files.filter(file => /\.[cm]?[jt]sx?$/.test(file) && !file.includes('/supabase/'));
const rpcs = [], dynamic = [], functions = [];
for (const file of code) {
  const source = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const first = node.arguments[0];
      const record = { file: path.relative(root,file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line+1 };
      if (name === 'rpc') {
        if (first && ts.isStringLiteralLike(first)) {
          const data = node.arguments[1];
          const keys = data && ts.isObjectLiteralExpression(data) && !data.properties.some(p=>ts.isSpreadAssignment(p))
            ? data.properties.map(p=>p.name?.getText(source).replace(/^['"]|['"]$/g,'')) : null;
          rpcs.push({ ...record, name:first.text, keys });
        } else dynamic.push({ ...record, expression: first?.getText(source) });
      }
      if (name === 'invoke' && node.expression.expression.getText(source).includes('.functions') && first && ts.isStringLiteralLike(first)) functions.push({ ...record, name:first.text });
    }
    ts.forEachChild(node,visit);
  };
  visit(source);
}
const migrationFiles = walk(path.join(root,'supabase/migrations')).filter(file=>file.endsWith('.sql'));
const localMigrations = migrationFiles.map(file=>({ version:path.basename(file).split('_')[0], file:path.relative(root,file), sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
const applied = new Set(server.migrations);
const pending = localMigrations.filter(item=>!applied.has(item.version));
const missing = [...new Set(rpcs.filter(item=>!server.functions.some(fn=>fn.name===item.name)).map(item=>item.name))].map(name=>({
  name, callers:rpcs.filter(item=>item.name===name),
  migrations:migrationFiles.filter(file=>new RegExp('(?:function|procedure)\\s+(?:public\\.)?"?'+name+'"?\\s*\\(','i').test(fs.readFileSync(file,'utf8'))).map(file=>path.relative(root,file)),
}));
const unknownArguments = rpcs.filter(call=>call.keys?.length && server.functions.some(fn=>fn.name===call.name) && !server.functions.filter(fn=>fn.name===call.name).some(fn=>{
  const names = fn.arguments.split(',').map(part=>part.trim().split(/\s+/)[0].replaceAll('"',''));
  return call.keys.every(key=>names.includes(key));
}));
const sourceManifest = files.sort().map(file=>({ file:path.relative(root,file), bytes:fs.statSync(file).size, sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
const report = {
  checkedAt:new Date().toISOString(), serverCheckedAt:server.checkedAt,
  scope:'Preparation only; no schema writes, deploy, OTA, payments, pushes or business mutations.',
  projectRef:fs.readFileSync(path.join(root,'supabase/.temp/project-ref'),'utf8').trim(),
  gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  counts:{sourceFiles:sourceManifest.length,rpcCalls:rpcs.length,rpcNames:new Set(rpcs.map(item=>item.name)).size,serverFunctions:server.functions.length,localMigrations:localMigrations.length,remoteMigrations:applied.size},
  pendingMigrations:pending, missingRpcs:missing, unknownArguments, dynamicRpcs:dynamic, edgeFunctionCalls:functions,
  migrationWarning:'Pending is not an apply list. Some old timestamps contain previously reconciled remote history; inspect each mismatch and dependency before selecting an upgrade.',
};
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify(sourceManifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'rpc-contracts.json'),JSON.stringify(rpcs,null,2)+'\n');
fs.writeFileSync(path.join(out,'compatibility-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ ...report.counts,pendingVersions:pending.map(x=>x.version),missingRpcs:missing.map(x=>x.name),unknownArguments:unknownArguments.map(x=>({name:x.name,file:x.file,line:x.line})),dynamicRpcCalls:dynamic.length,edgeFunctions:[...new Set(functions.map(x=>x.name))]},null,2));
