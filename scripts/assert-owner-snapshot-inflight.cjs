const fs = require('fs');
const assert = require('node:assert/strict');
const ts = require(process.cwd() + '/node_modules/typescript');
const source = fs.readFileSync('src/context/AppContext.tsx', 'utf8');
const start = source.indexOf('  const syncOwnerSnapshotForWorkspace = React.useCallback(');
const end = source.indexOf('  const enqueuePortalPublish = React.useCallback(', start);
const snippet = source.slice(start, end);
const code = ts.transpileModule(snippet, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness() {
  const writes = [];
  const env = {
    React:{useCallback: fn=>fn}, isAuthenticated:true, hasInitializedAuth:true,
    salonAccountEmail:'test@example.invalid',salonWorkspace:{},isWorkspaceAccessible:()=>true,isUuidValue:()=>true,
    ownerFinancialAppointmentsWorkspaceIdRef:{current:''},ownerFinancialAppointmentsRef:{current:[]},operatoriArchiviatiRef:{current:[]},serviceCardColorOverridesRef:{current:{}},roleCardColorOverridesRef:{current:{}},
    lastOwnerSnapshotSyncSignatureRef:{current:''}, pendingOwnerSnapshotSyncRef:{current:new Map()},
    getCriticalPersistenceCollectionCounts:()=>({servizi:1,operatori:1,appuntamenti:1,richiestePrenotazione:1}),
    hasSuspiciousCriticalPersistenceRegression:()=>false,
    supabase:{from:()=>({upsert:()=>new Promise(resolve=>writes.push(resolve))})},console,
  };
  for(const name of new Set([...snippet.matchAll(/\b(normalize\w+|sanitizeWorkspaceForDerivedSnapshots)\(/g)].map(m=>m[1])))env[name]=v=>v;
  return {fn:new Function(...Object.keys(env),code+'; return syncOwnerSnapshotForWorkspace;')(...Object.values(env)),writes,env};
}
(async()=>{
  const h=harness(); const payload={workspace:{id:'workspace-a'},clienti:[{id:'client-a'}]};
  const calls=Array.from({length:20},()=>h.fn('workspace-a',payload));
  assert.equal(h.writes.length,1,'concurrent identical inputs must produce one write');
  h.writes[0]({error:null});await Promise.all(calls);
  assert.equal(h.env.pendingOwnerSnapshotSyncRef.current.size,0);
  await h.fn('workspace-a',payload);assert.equal(h.writes.length,1,'successful unchanged payload must stay deduplicated');
  const changed=h.fn('workspace-a',{...payload,clienti:[{id:'client-b'}]});assert.equal(h.writes.length,2,'a real edit must still save');h.writes[1]({error:null});await changed;
  const f=harness();const failed=f.fn('workspace-a',payload);f.writes[0]({error:{code:'XX001',message:'temporary failure'}});await assert.rejects(failed);assert.equal(f.env.pendingOwnerSnapshotSyncRef.current.size,0);
  const retry=f.fn('workspace-a',payload);assert.equal(f.writes.length,2,'failed writes must remain retryable');f.writes[1]({error:null});await retry;
  console.log('PASS: 20 overlapping identical requests -> 1 write; real edits preserved; errors retryable; pending entries cleaned.');
})().catch(e=>{console.error(e);process.exitCode=1;});
