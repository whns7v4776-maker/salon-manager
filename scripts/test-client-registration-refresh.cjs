// Executes the actual client screen callback with deferred, local RPC results.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('app/cliente-screen.tsx','utf8');
const ast = ts.createSourceFile('cliente-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function walk(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'refreshCustomerRegistrationAccess') callback = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node,walk);
}
walk(ast); assert.ok(callback,'Actual admission refresh callback exists');
const key='audit|customer@example.invalid|3331234567';
const accessSource=fs.readFileSync('src/lib/customer-registration-access.ts','utf8');
const helperExports={};
// The helper is pure; CommonJS transpilation adds no imports or module effects.
const helper = {exports:helperExports};
vm.runInNewContext(ts.transpileModule(accessSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,helper);
const requests=[],notices=[],logouts=[];
const environment={
  customerRegistrationIdentityKey:key,isRegistered:true,effectiveWorkspace:{salonCode:'audit'},normalizedSelectedSalonCode:'audit',profile:{email:'customer@example.invalid',telefono:'3331234567'},
  customerRegistrationSessionGenerationRef:{current:0},customerRegistrationRefreshPromiseRef:{current:null},customerRegistrationMountedRef:{current:true},customerRegistrationIdentityRef:{current:key},customerRegistrationStatusRef:{current:'pending'},customerRegistrationRemovedIdentityRef:{current:''},
  state:{identityKey:key,status:'pending'},normalizeSalonCode:value=>value.trim().toLowerCase(),withClientDeadline:promise=>promise,
  publicSupabase:{rpc(name,args){assert.equal(name,'get_public_customer_registration_status_v1');let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});requests.push({args,resolve,reject});return promise;}},
  Platform:{OS:'ios'},Alert:{alert(title,message){notices.push({title,message});}},
  performFrontendLogoutRef:{current:async options=>{logouts.push(options);}},
  parseCustomerRegistrationAccess:helperExports.parseCustomerRegistrationAccess,buildCustomerRegistrationRemovalNotice:helperExports.buildCustomerRegistrationRemovalNotice,
  setCustomerRegistrationAccess(update){environment.state=update(environment.state);},
};
const refresh=vm.runInNewContext(ts.transpileModule('('+callback+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,environment);
const checks=[];
const check=async(name,run)=>{await run();checks.push(name);};
const reply = data=>requests.at(-1).resolve({data,error:null});
(async()=>{
  await check('Concurrent refreshes share one server read',async()=>{const before=requests.length;const first=refresh(),second=refresh();assert.equal(requests.length,before+1);reply({found:true,registrationStatus:'approved'});assert.equal((await first).status,'approved');assert.equal((await second).status,'approved');assert.equal(environment.state.status,'approved');});
  await check('Network error preserves last confirmed pending state',async()=>{environment.state={identityKey:key,status:'pending'};const pending=refresh();requests.at(-1).reject(new Error('offline'));assert.equal(await pending,null);assert.equal(environment.state.status,'pending');assert.equal(logouts.length,0);});
  await check('RPC error does not remove the customer',async()=>{const pending=refresh();requests.at(-1).resolve({data:{found:false},error:{message:'timeout'}});assert.equal(await pending,null);assert.equal(environment.state.status,'pending');assert.equal(logouts.length,0);});
  await check('Incomplete authority response cannot approve pending',async()=>{const pending=refresh();reply({found:true});assert.equal(await pending,null);assert.equal(environment.state.status,'pending');});
  await check('Old salon response cannot replace current admission',async()=>{const pending=refresh();environment.customerRegistrationIdentityRef.current='another|customer@example.invalid|3331234567';reply({found:false});assert.equal(await pending,null);assert.equal(logouts.length,0);environment.customerRegistrationIdentityRef.current=key;});
  await check('Logout and re-login with same identity invalidate old response',async()=>{const pending=refresh();environment.customerRegistrationSessionGenerationRef.current++;reply({found:false});assert.equal(await pending,null);assert.equal(logouts.length,0);});
  await check('New session read remains active after old generation settles',async()=>{const old=refresh();environment.customerRegistrationSessionGenerationRef.current++;const fresh=refresh();const newInFlight=environment.customerRegistrationRefreshPromiseRef.current;requests.at(-2).resolve({data:{found:false},error:null});assert.equal(await old,null);assert.equal(environment.customerRegistrationRefreshPromiseRef.current,newInFlight);reply({found:true,registrationStatus:'pending'});assert.equal((await fresh).status,'pending');assert.equal(logouts.length,0);});
  await check('Unmounted screen ignores successful authority response',async()=>{const pending=refresh();environment.customerRegistrationMountedRef.current=false;reply({found:false});assert.equal(await pending,null);assert.equal(logouts.length,0);environment.customerRegistrationMountedRef.current=true;});
  await check('Confirmed approval releases cached pending state',async()=>{const pending=refresh();reply({found:true,registrationStatus:'approved'});assert.equal((await pending).status,'approved');assert.equal(environment.state.status,'approved');});
  await check('Confirmed removal triggers one scoped logout notice',async()=>{environment.customerRegistrationStatusRef.current='pending';const pending=refresh();reply({found:false});assert.equal((await pending).status,'removed');assert.equal(logouts.length,1);assert.equal(logouts[0].customerRemoved,true);assert.equal(notices[0].title,'Registrazione non approvata');});
  await check('Repeated removal does not duplicate alerts or logout',async()=>{const pending=refresh();reply({found:false});await pending;assert.equal(logouts.length,1);assert.equal(notices.length,1);});
  await check('Unregistered session performs no RPC',async()=>{environment.isRegistered=false;const before=requests.length;assert.equal(await refresh(),null);assert.equal(requests.length,before);});
  console.log(JSON.stringify({passed:checks.length,failed:0,checks,limitations:['Actual callback and pure helper executed; native rendering, focus lifecycle and remote server are outside this fixture.']},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
