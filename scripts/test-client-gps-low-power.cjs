/* Execute the actual controller and native adapter with clock/native boundaries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const controllerSource=fs.readFileSync('src/lib/client-gps-reminder-controller.ts','utf8');const controllerExports={};
vm.runInNewContext(compile(controllerSource),{exports:controllerExports,Date,Promise});
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
const cases=[];const test=(name,fn)=>cases.push({name,fn});
function fixture(options={}){
 const clock={now:Date.parse('2026-10-11T12:00:00Z')};let id=0;const timers=new Map(),calls=[],listeners=[];
 const state={consent:{salonCode:'fixture',instanceId:'install'},window:{enabled:true,startsAt:new Date(clock.now-60_000).toISOString(),endsAt:new Date(clock.now+5*60_000).toISOString()},...options};
 const api=controllerExports.createClientGpsReminderController({now:()=>clock.now,consent:async()=>state.consent,
  window:async()=>{if(state.error)throw Error('offline');if(state.fetch) return state.fetch.promise;return state.window;},
  watch:async callback=>{calls.push('watch');listeners.push(callback);if(state.watch)await state.watch.promise;return state.denied?null:{remove(){calls.push('remove');}};},
  report:async (c,p)=>calls.push(['report',c,p]),setTimer(callback,delay){const key=++id;timers.set(key,{callback,at:clock.now+delay});return key;},clearTimer:key=>timers.delete(key)});
 return {api,clock,state,calls,listeners,timers,async advance(ms){clock.now+=ms;const due=[...timers].filter(([,t])=>t.at<=clock.now);due.forEach(([key,t])=>{if(timers.delete(key))t.callback();});await flush();}};
}
test('without consent no location subscription or server window',async()=>{const f=fixture({consent:null});f.api.refresh();await flush();assert(!f.calls.includes('watch'));f.api.pause();assert.equal(f.timers.size,0);});
test('no appointment, distant appointment and malformed window never start GPS',async()=>{for(const w of [{enabled:true,startsAt:null,endsAt:null},{enabled:true,startsAt:'2026-10-12T12:00:00Z',endsAt:'2026-10-12T12:10:00Z'},{enabled:true,startsAt:'bad',endsAt:'bad'},{enabled:false},{enabled:true,startsAt:'2026-10-11T11:00:00Z',endsAt:'2026-10-11T13:00:00Z'}]){const f=fixture({window:w});f.api.refresh();await flush();assert(!f.calls.includes('watch'));f.api.pause();}});
test('foreground window starts one watch and throttle limits reports',async()=>{const f=fixture();f.api.refresh();await flush();assert.equal(f.calls.filter(v=>v==='watch').length,1);f.listeners[0]({timestamp:1});f.listeners[0]({timestamp:2});await flush();assert.equal(f.calls.filter(v=>Array.isArray(v)).length,1);await f.advance(60_000);assert.equal(f.calls.filter(v=>v==='watch').length,1);f.listeners[0]({timestamp:3});await flush();assert.equal(f.calls.filter(v=>Array.isArray(v)).length,2);f.api.pause();});
test('background/logout pause immediately removes watch and all timers',async()=>{const f=fixture();f.api.refresh();await flush();f.api.pause();assert(f.calls.includes('remove'));assert.equal(f.timers.size,0);f.listeners[0]({timestamp:1});await flush();assert(!f.calls.some(v=>Array.isArray(v)));});
test('deadline stops GPS even if subsequent network check is hung',async()=>{const f=fixture();f.api.refresh();await flush();f.state.fetch=deferred();await f.advance(5*60_000);assert(f.calls.includes('remove'));f.api.pause();f.state.fetch.resolve(f.state.window);await flush();assert.equal(f.calls.filter(v=>v==='watch').length,1);});
test('canceled appointment, revoked consent or failed refresh stops existing watch',async()=>{for(const change of [{window:{enabled:true,startsAt:null,endsAt:null}},{consent:null},{error:true}]){const f=fixture();f.api.refresh();await flush();Object.assign(f.state,change);await f.advance(60_000);assert(f.calls.includes('remove'));f.api.pause();}});
test('late server response after background cannot start a watch',async()=>{const gate=deferred(),f=fixture({fetch:gate});f.api.refresh();await flush();f.api.pause();gate.resolve(f.state.window);await flush();assert(!f.calls.includes('watch'));assert.equal(f.timers.size,0);});
test('late native watch registration after background is removed',async()=>{const gate=deferred(),f=fixture({watch:gate});f.api.refresh();await flush();assert(f.calls.includes('watch'));f.api.pause();gate.resolve();await flush();assert(f.calls.includes('remove'));assert.equal(f.timers.size,0);});
test('an obsolete failed request cannot stop a newer active watch',async()=>{const gate=deferred(),f=fixture({fetch:gate});f.api.refresh();await flush();f.state.fetch=null;f.api.refresh();await flush();assert(f.calls.includes('watch'));gate.reject(Error('old failure'));await flush();assert(!f.calls.includes('remove'));f.api.pause();});
test('denied foreground location does not throw or manufacture observations',async()=>{const f=fixture({denied:true});f.api.refresh();await flush();assert(!f.calls.some(v=>Array.isArray(v)));f.api.pause();});
test('queued observation after identity switch cannot be reported',async()=>{const f=fixture();f.api.refresh();await flush();f.listeners[0]({timestamp:1});f.state.consent={salonCode:'other',instanceId:'other'};await flush();assert(!f.calls.some(v=>Array.isArray(v)));f.api.pause();});
const adapterSource=fs.readFileSync('src/lib/client-gps-reminders.ts','utf8');
function adapter(platform='ios',options={}){
 let now=Date.parse('2026-10-11T12:00:00Z'),timerId=0;const timers=new Map(),calls=[],appListeners=[],tasks=new Map();
 const consent={salonCode:'fixture',instanceId:'install'},storage=new Map([['salonpro-client-gps-reminders-v1',JSON.stringify(consent)],['salon_manager_frontend_client_app_instance_id','install']]);
 const state={legacy:true,foreground:true,services:true,session:{salonCode:'fixture',appInstanceId:'install'},window:{enabled:true,startsAt:'2026-10-11T11:59:00Z',endsAt:'2026-10-11T12:05:00Z'},...options};
 const app={currentState:'active',addEventListener(_n,cb){appListeners.push(cb);return {remove(){}};}};
 const location={Accuracy:{Balanced:3},hasStartedLocationUpdatesAsync:async()=>state.legacy,stopLocationUpdatesAsync:async()=>{calls.push('stop-legacy');state.legacy=false;},
  getForegroundPermissionsAsync:async()=>({granted:state.foreground}),hasServicesEnabledAsync:async()=>state.services,
  watchPositionAsync:async(_opts,cb)=>{calls.push('foreground-watch');state.onPoint=cb;return {remove(){calls.push('remove');}};},
  requestBackgroundPermissionsAsync(){throw Error('Background permission must never be requested');},startLocationUpdatesAsync(){throw Error('Background service must never be started');}};
 const dependencies={
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}},
  'react-native':{Platform:{OS:platform},AppState:app},'expo-modules-core':{requireOptionalNativeModule:()=>state.moduleMissing?null:{}},
  'expo-task-manager':{isTaskDefined:n=>tasks.has(n),defineTask:(n,cb)=>tasks.set(n,cb)},'expo-location':location,
  './client-native-session':{readNativeCustomerSession:async()=>state.session},'./client-gps-reminder-controller':controllerExports,
  './supabase':{publicSupabase:{rpc:(name,args)=>{calls.push([name,args]);const response=Promise.resolve( name==='get_client_gps_reminder_window_v1'?{data:state.window,error:state.offline?Error('offline'):null}:{data:true,error:state.disableOffline&&!args.p_enabled?Error('offline'):null});return {abortSignal:()=>response};}}},
 };
 const exports={};class Clock extends Date{static now(){return now;}}
 if(options.realSession){
  const sessionKey='salon_manager_frontend_native_active_session_v1',revisionKey='salon_manager_frontend_native_session_revision_v1';
  storage.set(revisionKey,'qa-revision');
  const secure=new Map([[sessionKey,JSON.stringify({version:1,platform,salonCode:'fixture',appInstanceId:'install',email:'qa@example.test',phone:'3331230042',customerId:'12345678-1234-4234-8234-123456789abc',passwordRequired:true,revocationId:'qa-revision'})]]);
  dependencies['expo-secure-store']={AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY:'qa',getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>secure.set(k,v),deleteItemAsync:async k=>secure.delete(k)};
  dependencies['./client-gps-reminders']=exports;
  const sessionExports={};vm.runInNewContext(compile(fs.readFileSync('src/lib/client-native-session.ts','utf8')),{exports:sessionExports,Date:Clock,Math,Promise,require:name=>{assert(dependencies[name],name);return dependencies[name];}});
  dependencies['./client-native-session']=sessionExports;state.sessionApi=sessionExports;
 }

 vm.runInNewContext(compile(adapterSource),{exports,Date:Clock,Promise,AbortController,setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),require:name=>{assert(dependencies[name],name);return dependencies[name];}});
 return {api:exports,state,storage,calls,tasks,timers,async emit(s){app.currentState=s;appListeners.forEach(cb=>cb(s));await flush();},async advance(ms){now+=ms;const due=[...timers].filter(([,t])=>t.at<=now);due.forEach(([id,t])=>{if(timers.delete(id))t.callback();});await flush();}};
}
for(const platform of ['ios','android']){
 test(`${platform}: offline disable persists and replays without restarting GPS`,async()=>{const f=adapter(platform);await flush();f.state.disableOffline=true;await assert.rejects(f.api.disableClientGpsReminders(),/connessione/);assert(!f.storage.has('salonpro-client-gps-reminders-v1'));assert(f.storage.has('salonpro-client-gps-reminders-v1-pending-disable'));assert(f.calls.includes('remove'));f.state.disableOffline=false;await f.emit('active');assert(!f.storage.has('salonpro-client-gps-reminders-v1-pending-disable'));assert.equal(f.calls.filter(v=>v==='foreground-watch').length,1);await f.emit('background');});
 test(`${platform}: actual secure session logout pauses actual GPS adapter`,async()=>{const f=adapter(platform,{realSession:true});await flush();assert(f.calls.includes('foreground-watch'));await f.state.sessionApi.invalidateNativeCustomerSession();await flush();assert(f.calls.includes('remove'));assert.equal(f.timers.size,0);assert.equal(await f.state.sessionApi.readNativeCustomerSession(),null);await f.emit('background');});
 test(`${platform}: OTA startup stops legacy service; background stops foreground watch`,async()=>{const f=adapter(platform);await flush();assert(f.calls.includes('stop-legacy'));assert(f.calls.includes('foreground-watch'));await f.emit('background');assert(f.calls.includes('remove'));assert.equal(f.timers.size,0);});
 test(`${platform}: enabling reminder without location permission reports consent only`,async()=>{const f=adapter(platform,{foreground:false});await flush();await f.api.enableClientGpsReminders('fixture');await flush();assert(!f.calls.includes('foreground-watch'));assert(f.calls.some(c=>Array.isArray(c)&&c[0]==='update_client_gps_reminder_v1'&&c[1].p_enabled));await f.emit('background');});
 test(`${platform}: no upcoming window never starts native location`,async()=>{const f=adapter(platform,{window:{enabled:true,startsAt:null,endsAt:null}});await flush();assert(f.calls.includes('stop-legacy'));assert(!f.calls.includes('foreground-watch'));await f.emit('background');});
 test(`${platform}: disable clears local consent and server state`,async()=>{const f=adapter(platform);await flush();await f.api.disableClientGpsReminders();assert(!f.storage.has('salonpro-client-gps-reminders-v1'));assert(f.calls.includes('remove'));assert(f.calls.some(c=>Array.isArray(c)&&c[0]==='update_client_gps_reminder_v1'&&!c[1].p_enabled));await f.emit('background');});
 test(`${platform}: expired session never subscribes and cannot opt in`,async()=>{const f=adapter(platform,{session:null});await flush();assert(!f.calls.includes('foreground-watch'));await assert.rejects(f.api.enableClientGpsReminders('fixture'),/Accedi/);await f.emit('background');});
 test(`${platform}: stale sample is not uploaded`,async()=>{const f=adapter(platform);await flush();f.state.onPoint({timestamp:1,coords:{latitude:45,longitude:9,accuracy:10,speed:0}});await flush();assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='update_client_gps_reminder_v1'));await f.emit('background');});
 test(`${platform}: old background callback stops service without uploading coordinates`,async()=>{const f=adapter(platform);await flush();await f.emit('background');f.state.legacy=true;await f.tasks.get('salonpro-client-gps-reminders-v1')({data:{locations:[{}]}});assert.equal(f.state.legacy,false);assert(!f.calls.some(c=>Array.isArray(c)&&c[0]==='update_client_gps_reminder_v1'));});
}
test('web does not start timers, task registration or native location',async()=>{const f=adapter('web');await flush();assert.equal(f.calls.length,0);assert.equal(f.tasks.size,0);assert.equal(f.timers.size,0);});
(async()=>{for(const {name,fn}of cases){await fn();console.log('PASS '+name);}const report={allPassed:true,passed:cases.length,sourceHashes:Object.fromEntries(['src/lib/client-gps-reminders.ts','src/lib/client-gps-reminder-controller.ts'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),realDeviceVerified:false};fs.writeFileSync('work/gps-reminders-20261011/native-runtime-verification.json',JSON.stringify(report,null,2));console.log(cases.length+' low-power runtime tests passed');})().catch(e=>{console.error(e);process.exitCode=1});
