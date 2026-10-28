/* Offline contract comparison of retained release sources, never an app deployment. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/premium-switch-20261025');
const server=require(path.join(out,'server-catalog.json'));
const known=new Set(server.functions.map(f=>f.name));
for(const name of fs.readdirSync(path.join(root,'supabase/migrations'))){if(!name.endsWith('.sql'))continue;for(const m of fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8').matchAll(/(?:function|procedure)\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi))known.add(m[1]);}
const cases=[
 ['1.0.17','work/legacy-client-access-20261020/candidate-1.0.17-meta1'],
 ['1.0.20','work/customer-private-access-20261018/release-source-1.0.20'],
 ['1.0.21','work/customer-private-access-20261018/release-source-1.0.21'],
 ['1.0.22','work/cards-122-audit-20261022/release-source-1.0.22'],
 ['Premium','.'],
];
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const reports=[];
for(const [version,dir]of cases){
 const base=path.join(root,dir),calls=[],references=[],dynamic=[],manifest=[];
 if(!fs.existsSync(base)){reports.push({version,source:dir,status:'SOURCE_NOT_AVAILABLE'});continue;}
 for(const folder of ['app','components','src']){
  if(!fs.existsSync(path.join(base,folder)))continue;
  for(const file of walk(path.join(base,folder)).filter(f=>/\.[jt]sx?$/.test(f))){
   const text=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   manifest.push([path.relative(base,file),crypto.createHash('sha256').update(text).digest('hex')]);
   const visit=node=>{
    const rec=()=>({file:path.relative(base,file),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1});
    if(ts.isStringLiteralLike(node)&&known.has(node.text))references.push({...rec(),name:node.text});
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='rpc'){
     const arg=node.arguments[0];if(arg&&ts.isStringLiteralLike(arg))calls.push({...rec(),name:arg.text});else dynamic.push({...rec(),expression:arg?.getText(source)});
    }
    ts.forEachChild(node,visit);
   };visit(source);
  }
 }
 const names=[...new Set([...calls,...references].map(x=>x.name))].sort();
 const missing=names.filter(name=>!server.functions.some(f=>f.name===name));
 reports.push({version,source:dir,sourceFingerprint:crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),files:manifest.length,literalRpcCalls:calls.length,rpcNamesIncludingWrapperReferences:names,missing,dynamicCallSites:dynamic,
  evidence:'Static source contract presence only; physical binaries and external services are separate checks.'});
}
fs.writeFileSync(path.join(out,'legacy-contracts.json'),JSON.stringify({at:new Date().toISOString(),cases:reports},null,2)+'\n');
console.log(JSON.stringify(reports.map(r=>({version:r.version,files:r.files,rpcNames:r.rpcNamesIncludingWrapperReferences?.length,missing:r.missing,status:r.status})),null,2));
