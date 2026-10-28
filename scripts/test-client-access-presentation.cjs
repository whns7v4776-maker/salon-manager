/* Exercise the production render gates while logout, hydration and session recovery are pending. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync('app/cliente-screen.tsx','utf8');
const ast=ts.createSourceFile('cliente-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();let screen;
function walk(node){
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&!declarations.has(node.name.text))declarations.set(node.name.text,node.initializer.getText(ast));
 if(ts.isFunctionDeclaration(node)&&node.name?.text==='ClienteFrontendScreenContent')screen=node;
 ts.forEachChild(node,walk);
}
walk(ast);assert.ok(screen);
const names=['shouldShowFrontendAccessForm','shouldReturnToNativeClientEntry','shouldReturnToWebClientEntry'];
const conditions=['shouldReturnToNativeClientEntry','shouldReturnToWebClientEntry','!isRegistered'];
const gates=conditions.map(condition=>{
 const statement=screen.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(ast)===condition);
 assert.ok(statement,condition);return statement;
});
const authenticatedReturn=screen.body.statements.find(node=>ts.isReturnStatement(node));
assert.ok(gates.every(gate=>gate.pos<authenticatedReturn.pos),'Every unregistered state is intercepted before legacy markup');
const code=ts.transpileModule(`exports.render=()=>{${names.map(name=>`const ${name}=${declarations.get(name)};`).join('\n')}${gates.map(gate=>gate.getText(ast)).join('\n')}return {type:'authenticated'};};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const resumeFlags=['isRestoringFrontendWebSession','isFrontendAutoLoginPresentationPending','shouldAutoCompleteSavedProfileAccess','shouldBootstrapFrontendRequestsPage','shouldBootstrapLinkedSalonAccess','shouldHoldBiometricAutoLoginScreen'];
const busyFlags=['isSavingProfile','registrationPreparing','frontendBiometricBusy'];
function render(overrides={}){
 const bindings={exports:{},React:{createElement:(type,props)=>({type,props})},Redirect:'access',ClientBookingLoading:'transition',
  isWeb:true,hasHydratedFrontendSession:true,isRegistered:false,frontendLogoutPending:false,
  ...Object.fromEntries([...resumeFlags,...busyFlags].map(key=>[key,false])),profileSaveError:'',frontendAccessConflictError:'',
  resolvedOrIncomingSalonCode:'fixture-salon',activeAccessMode:'login',effectiveWorkspace:{id:'fixture'},connectedSalonBadgeLabel:'Fixture Salon',...overrides};
 vm.runInNewContext(code,bindings);return bindings.exports.render();
}
let cases=0;
for(const isWeb of [false,true])for(const mode of ['login','register']){
 const access=render({isWeb,activeAccessMode:mode});assert.equal(access.type,'access');
 assert.equal(access.props.href.pathname,'/');assert.equal(access.props.href.params.side,'client');
 assert.equal(access.props.href.params.salon,'fixture-salon');assert.equal(access.props.href.params.mode,mode);
 assert.ok(!('email'in access.props.href.params)&&!('phone'in access.props.href.params));
 if(isWeb)assert.equal(access.props.href.params.frontendLoggedOut,'1','Web access cannot automatically restore the session it just left');
 assert.equal(render({isWeb,hasHydratedFrontendSession:false}).type,'transition');
 assert.equal(render({isWeb,isRegistered:true,frontendLogoutPending:true}).type,'authenticated');
 for(const flag of [...resumeFlags,...busyFlags])assert.equal(render({isWeb,[flag]:true}).type,'transition',flag);
 for(const flag of busyFlags)assert.equal(render({isWeb,[flag]:true,profileSaveError:'Previous error'}).type,'transition',flag);
 cases+=16;
}
for(let mask=0;mask<512;mask++){
 const state=Object.fromEntries([...resumeFlags,...busyFlags].map((key,index)=>[key,Boolean(mask&(1<<index))]));
 assert.equal(render({...state,frontendLogoutPending:true}).type,'transition','Slow web logout never renders legacy access or redirects before cleanup');
 cases++;
}
assert.equal(render({profileSaveError:'Access failed'}).type,'access');
assert.equal(render({frontendAccessConflictError:'Session conflict'}).type,'access');
console.log(`PASS ${cases+2} access presentation scenarios: themed pending states, canonical access, credentials excluded, active sessions preserved.`);
