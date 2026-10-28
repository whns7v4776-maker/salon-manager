const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), ts=require('typescript');
const {JSDOM}=require(process.env.JSDOM_MODULE||'/tmp/salonpro-appearance-test/node_modules/jsdom');
const dom=new JSDOM('<div id="root"></div>');global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'), {act}=React, {createRoot}=require('react-dom/client');
const load=(file,deps)=>{const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:out,require:id=>{assert.ok(deps[id],id);return deps[id];},setTimeout,clearTimeout,Map,Set});return out;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
(async()=>{
 let root=createRoot(document.getElementById('root')), result, listener, applied=[], writes=[], rejectSave=false;
 let read=deferred();
 const modeAPI={setMode:(...args)=>applied.push(args),subscribeModeChanges:fn=>{listener=fn;return()=>{listener=null;};}};
 const {useCustomerAppearance}=load('components/use-customer-appearance.ts',{react:React,'./access-premium':{useAccessAppearance:()=>modeAPI},'../src/lib/customer-appearance':{readCustomerAppearance:()=>read.promise,saveCustomerAppearance:async(identity,mode)=>{writes.push([identity.email,mode]);if(rejectSave)throw new Error('server unavailable');}}});
 function Theme({identity}){result=useCustomerAppearance(identity);return null;}
 const identity={salonCode:'salon',email:'a@example.test',phone:'3330000001'};
 await act(async()=>root.render(React.createElement(Theme,{identity})));
 await act(async()=>read.resolve('night'));assert.equal(applied[0][0],'night');assert.equal(applied[0][1].localOnly,true);assert.equal(writes.length,0,'hydration must never overwrite the server');
 await act(async()=>{listener('day');listener('night');});assert.deepEqual(writes.map(x=>x[1]),['day','night']);assert.equal(result.status,'saved');
 rejectSave=true;await act(async()=>listener('system'));assert.equal(result.status,'error');rejectSave=false;await act(async()=>result.retry());assert.equal(writes.at(-1)[1],'system');assert.equal(result.status,'saved','retry sends unsaved mode instead of reverting to server mode');
 await act(async()=>root.unmount());assert.equal(listener,null);
 root=createRoot(document.getElementById('root'));read=deferred();applied=[];writes=[];
 await act(async()=>root.render(React.createElement(Theme,{identity})));
 await act(async()=>listener('day'));await act(async()=>read.resolve('night'));assert.equal(applied.length,0,'late read must not undo a newer manual choice');assert.deepEqual(writes.map(x=>x[1]),['day']);
 await act(async()=>root.unmount());
 for(const os of ['ios','android','web']){
  const handlers=new Map();let metrics=null,visible=false,dismissed=0,blurred=0,y=420,inputY=820;const calls=[];
  const Keyboard={addListener:(name,fn)=>{handlers.set(name,fn);return{remove:()=>handlers.delete(name)};},metrics:()=>metrics,isVisible:()=>visible,dismiss:()=>dismissed++};
  const {useNativeBookingNote}=load('components/use-native-booking-note.ts',{react:React,'react-native':{Platform:{OS:os},Keyboard}});
  const scrollY={current:y};const scroll={current:{scrollTo:arg=>{calls.push(arg);inputY-=arg.y-scrollY.current;scrollY.current=arg.y;}}};
  const input={measureInWindow:fn=>fn(20,inputY,320,90),blur:()=>blurred++};
  function Note(){result=useNativeBookingNote(scroll,scrollY);return null;}
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Note)));
  await act(async()=>result.onFocus(input));
  if(os==='web'){assert.equal(calls.length,0);assert.equal(result.active,false);}
  else {
   visible=true;metrics={screenY:600,height:300};await act(async()=>{handlers.get('keyboardDidShow')({endCoordinates:metrics});await wait(100);});
   assert.equal(result.active,true);assert.equal(result.clearance,332);assert.ok(inputY+90<=576,'whole note must clear the keyboard by 24px');
   result.onTouchStart({nativeEvent:{pageX:40,pageY:inputY+15}});assert.equal(blurred,0,'caret taps keep editing');
   result.onTouchStart({nativeEvent:{pageX:4,pageY:50}});assert.equal(blurred,1);assert.equal(dismissed,1,'outside tap dismisses without intercepting');
   visible=false;metrics=null;await act(async()=>{handlers.get('keyboardDidHide')();await wait(100);});assert.equal(result.active,false);assert.equal(result.clearance,0);assert.equal(calls.at(-1).y,y,'restore original scroll after dismissal');
  }
  await act(async()=>root.unmount());assert.equal(handlers.size,0,'keyboard listeners cleaned up');
 }
 dom.window.close();console.log('PASS customer sync: hydration, sequential quick changes, failed-save retry, stale read, cleanup; note keyboard: iOS/Android clearance, outside/caret taps, restore; web unchanged. Mocked React/native geometry, not device acceptance.');
})().catch(error=>{console.error(error);process.exitCode=1;});
