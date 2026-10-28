/* Actual retained client session/transport modules, with fully mocked RPC/storage. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/premium-switch-20261025');
const cases=require(path.join(out,'legacy-contracts.json')).cases;
const script=path.join(root,'work/customer-private-access-20261018/test-client.cjs');
const harness=path.join(out,'legacy-runtime-harness.cjs');
const original=fs.readFileSync(script,'utf8');
const marker="(async()=>{for(const [name,run] of tests){await run();console.log('PASS',name)}console.log(`${tests.length} client runtime cases passed`);})().catch(e=>{console.error(e);process.exitCode=1});";
if(!original.includes(marker))throw Error('Review updated runtime harness before using it');
fs.writeFileSync(harness,original.replace(marker,"(async()=>{let passed=0;const failures=[];for(const [name,run] of tests){try{await run();passed++;console.log('PASS',name)}catch(error){failures.push({name,error:error.message});console.log('FAIL',name)}}console.log('RESULT_JSON '+JSON.stringify({passed,total:tests.length,failures}));if(failures.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});"));
const results=[];
for(const item of cases){
 const run=spawnSync(process.execPath,[harness],{cwd:path.join(root,item.source),encoding:'utf8',timeout:45000});
 const output=(run.stdout||'')+(run.stderr||'');
 fs.writeFileSync(path.join(out,'legacy-runtime-'+item.version+'.log'),output);
 const detail=/RESULT_JSON (.+)/.exec(output);
 results.push({version:item.version,status:run.status===0?'PASS':'FAIL',...(detail?JSON.parse(detail[1]):{}),sourceFingerprint:item.sourceFingerprint,error:run.error?.message});
}
fs.writeFileSync(path.join(out,'legacy-runtime-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
