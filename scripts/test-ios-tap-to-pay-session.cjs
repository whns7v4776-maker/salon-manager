const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const requestExports={},exportsObject={};
const transpile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(transpile('src/lib/ios-terminal-request.ts'),{exports:requestExports,setTimeout,clearTimeout,AbortController});
vm.runInNewContext(transpile('src/lib/ios-tap-to-pay-controller.ts'),{exports:exportsObject,require:name=>{assert.equal(name,'./ios-terminal-request');return requestExports;}});
const {IosTapToPayController}=exportsObject;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const allEvents=[];
function fixture({terms=false,permission=true,result='paid',throwProcess=false,locations=[{id:'loc_1',name:'Sede'}],timeout}={}) {
 const events=[];
 allEvents.push(events);
 let initialized=false;
 const cleanup=async action=>{
  events.push([action]);
  if(!initialized){events.push(['unsafe-native-cleanup',action]);throw Error('Terminal.shared before initialize');}
 };
 const adapter={
  call:async(action,extra)=>{events.push([action,extra]);return action==='terminal-status'?{enabled:true,locations}:action==='terminal-token'?{secret:'token'}:action==='terminal-intent'?{clientSecret:'secret'}:{status:result==='paid'?'paid':'open',outcome:result,receipt:result==='paid'?'Ricevuta':'Esito'};},
  permission:async(request)=>{events.push(['permission',request]);return permission;},
  initialize:async()=>{events.push(['initialize']);initialized=true;return {};},supported:async()=>({readerSupportResult:true}),
  connect:async(_loc,accept)=>{events.push(['connect',accept]);if(!terms&&!accept)return {error:{message:'Terms required'}};terms=true;return {};},
  disconnect:()=>cleanup('disconnect'),clear:()=>cleanup('clear'),cancel:()=>cleanup('cancel'),
  retrieve:async()=>({paymentIntent:{id:'pi_1'}}),process:async()=>{events.push(['process']);if(throwProcess)throw Error('network timeout');return {};},
  education:async(force,identity)=>{events.push(['education',force,identity]);return true;},
 };
 const controller=new IosTapToPayController(adapter,timeout);controller.setIdentity('salon_1:owner');
 return {controller,adapter,events};
}
(async()=>{
 {
  const {controller,events}=fixture({permission:false});await controller.warmup();
  assert(events.some(e=>e[0]==='permission'&&e[1]===false));
  assert(!events.some(e=>e[0]==='connect'||e[0]==='terminal-intent'));
  await controller.cancelRead();controller.setIdentity('');await tick();
  assert(!events.some(e=>['initialize','cancel','disconnect','clear'].includes(e[0])),'Login, missing permission and logout do not touch an uninitialized SDK');
 }
 {
  const {controller,events}=fixture({permission:false,locations:[{id:'loc_1',name:'Uno'},{id:'loc_2',name:'Due'}]});
  await controller.warmup();await controller.select('loc_2');
  assert.equal(controller.state.selected,'loc_2');
  assert(!events.some(e=>['initialize','disconnect','clear'].includes(e[0])),'Location selection is safe before initialization');
 }
 {
  const {controller,adapter,events}=fixture();
  adapter.initialize=async()=>({error:{message:'Initialization failed'}});
  await assert.rejects(controller.warmup(),/Initialization failed/);
  controller.setIdentity('');await tick();
  assert(!events.some(e=>['cancel','disconnect','clear'].includes(e[0])),'Failed initialization must not enable native cleanup');
 }
 {
  const {controller,adapter,events}=fixture({terms:true});let finishInitialize;
  const initialize=adapter.initialize;
  adapter.initialize=()=>new Promise(resolve=>{finishInitialize=async()=>resolve(await initialize());});
  const first=controller.warmup();
  while(!finishInitialize)await tick();
  controller.setIdentity('salon_2:owner');
  assert(!events.some(e=>e[0]==='cancel'),'Account switch cannot cancel an SDK still initializing');
  const rejected=assert.rejects(first,/Accesso al salone cambiato/);
  adapter.initialize=initialize;
  const second=controller.warmup();await finishInitialize();await rejected;await second;
  const initialization=events.map(e=>e[0]);
  assert(initialization.indexOf('clear')>initialization.indexOf('initialize'),'Late initialization is cleaned after the old account exits');
  assert(initialization.lastIndexOf('initialize')>initialization.indexOf('clear'),'Next account initializes only after credential cleanup');
  assert.equal(controller.state.ready,true);
  controller.setIdentity('');await tick();
  assert.equal(events.filter(e=>e[0]==='clear').length,2,'Initialized logout retains merchant cleanup');
 }
 {
  const {controller,events}=fixture();await controller.warmup();assert.equal(controller.state.ready,false);
  await controller.activate();assert.equal(controller.state.ready,true);
  assert.deepEqual(events.filter(e=>e[0]==='connect').map(e=>e[1]),[false,true]);
  assert(events.findIndex(e=>e[0]==='education')>events.findIndex(e=>e[0]==='connect'&&e[1]));
  assert(!events.some(e=>e[0]==='terminal-intent'),'Setup outside checkout cannot reserve a payment');
  await controller.warmup();assert.equal(events.filter(e=>e[0]==='connect').length,2,'Ready session is retained across foreground/navigation');
  let paid=0;await controller.pay('m_1',()=>paid++);assert.equal(paid,1);
  assert.equal(events.filter(e=>e[0]==='initialize').length,2,'Checkout reuses the ready reader');
  assert.equal(controller.state.outcome,'paid');controller.observeMovement('m_2');assert.equal(controller.state.receipt,undefined);
 }
 for(const result of ['pending','declined','paid']) {
  const {controller,events}=fixture({terms:true,result,throwProcess:true});let paid=0;
  await controller.pay('m_1',()=>paid++);
  assert(events.some(e=>e[0]==='terminal-check'),'SDK exceptions still require authoritative verification');
  assert.equal(paid,result==='paid'?1:0);assert.equal(controller.state.outcome,result);
 }
 {
  const {controller,events}=fixture();
  await controller.guide();assert(!events.some(e=>e[0]==='education'),'Education requires confirmed merchant acceptance');
  assert(!events.some(e=>['terminal-status','permission','initialize','connect'].includes(e[0])),'Help does not require configuration or silently accept Apple terms');
  const first=controller.activate();const duplicate=controller.pay('m_1',()=>assert.fail('Duplicate tap cannot start payment'));
  await assert.rejects(duplicate,/Attendi/);await first;
  await controller.guide();assert(events.some(e=>e[0]==='education'&&e[1]===true));
 }
 {
  const {controller,adapter,events}=fixture({terms:true});let resolveConnect;
  adapter.connect=()=>new Promise(resolve=>{resolveConnect=resolve;});
  const pending=controller.pay('old_movement',()=>assert.fail('Old account result cannot settle UI'));
  while(!resolveConnect)await tick();controller.setIdentity('salon_2:owner');resolveConnect({});
  await assert.rejects(pending,/Accesso al salone cambiato/);
  assert(!events.some(e=>e[0]==='terminal-intent'||e[0]==='education'));
  assert.equal(controller.state.ready,false);assert.equal(controller.state.receipt,undefined);
  const message=controller.state.message;controller.progress('Old native update');controller.disconnected();assert.equal(controller.state.message,message);
  await assert.rejects(controller.token(),/Seleziona la sede/);
 }
 {
  const {controller,adapter,events}=fixture({terms:true});let releaseToken;
  const original=adapter.call;adapter.call=(action,extra)=>action==='terminal-token'?new Promise(resolve=>{releaseToken=resolve;}):original(action,extra);
  await controller.warmup();const token=controller.token();controller.setIdentity('');releaseToken({secret:'old-token'});
  await assert.rejects(token,/Accesso al salone cambiato/);
  assert(events.some(e=>e[0]==='cancel'));
 }
 {
  const {controller,events}=fixture({locations:[]});
  await controller.activate();assert.equal(controller.state.busy,false);
  assert.equal(controller.state.ready,false);assert.match(controller.state.message,/sede italiana/);
  await controller.guide();assert.equal(controller.state.busy,false);
  assert(!events.some(e=>['initialize','permission','connect','terminal-intent','education'].includes(e[0])),'Missing location cannot start native setup, terms or a payment');
 }
 {
  const {controller,adapter}=fixture();
  let signal;
  adapter.call=(action,extra)=>requestExports.callIosTerminal((_body,options)=>{signal=options.signal;return new Promise(()=>{});},action,extra,10);
  await assert.rejects(controller.activate(),/non risponde/);
  assert.equal(signal.aborted,true);assert.equal(controller.state.busy,false);assert.equal(controller.state.ready,false);
  adapter.call=async()=>({enabled:true,locations:[]});
  await controller.activate();assert.equal(controller.state.busy,false,'A timed-out auth/request releases the setup lock for retry');
 }
 {
  const {controller,adapter,events}=fixture({timeout:10});let finishInitialize;
  const initialize=adapter.initialize;
  adapter.initialize=()=>new Promise(resolve=>{finishInitialize=async()=>resolve(await initialize());});
  await assert.rejects(controller.activate(),/configurazione del telefono non risponde/);
  assert.equal(controller.state.busy,false);assert.equal(controller.state.recovering,true);
  assert(!events.some(e=>['cancel','clear','disconnect'].includes(e[0])),'Timed-out initial SDK startup still forbids unsafe cleanup');
  await assert.rejects(controller.activate(),/interrompendo/);
  controller.setIdentity('salon_2:owner');
  await assert.rejects(controller.warmup(),/interrompendo/);
  adapter.initialize=initialize;await finishInitialize();
  for(let i=0;i<12;i++)await tick();
  assert.equal(controller.state.recovering,false,'Native recovery unlocks the new account without restoring old account state');
  await controller.activate();assert.equal(controller.state.ready,true);
  assert(events.findIndex(e=>e[0]==='clear')>events.findIndex(e=>e[0]==='initialize'),'Late native startup is fenced and cleaned before retry on another account');
 }
 {
  const {controller,adapter,events}=fixture({terms:true,timeout:10});let finishConnect;
  const connect=adapter.connect;
  adapter.connect=()=>new Promise(resolve=>{finishConnect=resolve;});
  await assert.rejects(controller.pay('not_started',()=>assert.fail('No payment after setup timeout')),/non risponde/);
  assert.equal(controller.state.busy,false);assert.equal(controller.state.recovering,true);
  await assert.rejects(controller.pay('not_started',()=>assert.fail('No overlapping payment')),/interrompendo/);
  finishConnect({});for(let i=0;i<12;i++)await tick();
  assert.equal(controller.state.ready,false);assert.equal(controller.state.recovering,false);
  assert(!events.some(e=>e[0]==='terminal-intent'),'Late connection cannot resume a timed-out checkout');
  adapter.connect=connect;await controller.activate();assert.equal(controller.state.ready,true);
 }
 {
  const {controller,adapter,events}=fixture({terms:true,timeout:10});let finishEducation;
  adapter.education=()=>new Promise(resolve=>{finishEducation=resolve;});
  await assert.rejects(controller.pay('not_started',()=>assert.fail('No payment before education')),/non risponde/);
  finishEducation(true);for(let i=0;i<12;i++)await tick();
  assert.equal(controller.state.busy,false);assert.equal(controller.state.ready,false);
  assert(!events.some(e=>e[0]==='terminal-intent'),'Late education dismissal cannot start an abandoned payment');
 }
 {
  const {controller,adapter}=fixture({terms:true,timeout:10});
  await controller.activate();let finishCancel;
  adapter.cancel=()=>new Promise(resolve=>{finishCancel=resolve;});
  controller.setIdentity('salon_2:owner');
  await assert.rejects(controller.warmup(),/interruzione della configurazione non risponde/);
  assert.equal(controller.state.busy,false);assert.equal(controller.state.recovering,true);
  await assert.rejects(controller.activate(),/interrompendo/);
  finishCancel();for(let i=0;i<12;i++)await tick();
  assert.equal(controller.state.recovering,false);
  await controller.activate();assert.equal(controller.state.ready,true,'A stalled account cleanup is fenced until actual completion');
 }
 assert(allEvents.every(events=>!events.some(e=>e[0]==='unsafe-native-cleanup')),'No native cleanup may access Terminal.shared before successful initialization');
 console.log('PASS bounded activation/recovery, missing location/help, safe native startup and late cleanup, Apple terms, persistent reader, authoritative outcomes, account/token isolation and receipts.');
})().catch(error=>{console.error(error);process.exitCode=1;});
