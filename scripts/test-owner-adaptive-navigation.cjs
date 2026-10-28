/* Local runtime checks with React and mocked native primitives. No salon writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="root"></div>');
Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
function load(file,deps={}){
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>deps[name]||{},console,Date,Error,Set,Promise});return exports;
}
const policy=load('src/lib/owner-navigation-layout.ts');
const resolve=(width,height,preference='auto',extra={})=>policy.resolveOwnerNavigationLayout({width,height,preference,...extra});
for(const [width,height,auto,manual] of [[320,640,false,false],[390,844,false,false],[844,390,false,false],[768,1024,false,false],[1024,768,false,false],[1100,800,false,true],[1194,834,false,true],[1200,800,true,true],[1366,1024,true,true],[1024,1366,false,false],[1300,1600,false,true],[1366,500,false,false]]){
 assert.equal(resolve(width,height).sidebar,auto,`${width}×${height} auto`);
 assert.equal(resolve(width,height,'sidebar').sidebar,manual,`${width}×${height} manual`);
 assert.equal(resolve(width,height,'bottom').sidebar,false);
 assert.equal(resolve(width,height).contentWidth,width-resolve(width,height).railWidth);
}
assert.equal(resolve(1200,800,'auto',{insetLeft:24,insetRight:24}).sidebar,false);
assert.equal(resolve(1366,1024,'auto',{insetLeft:24}).railWidth,248);
assert.equal(resolve(1200,800,'auto',{fontScale:1.5}).sidebar,false);
assert.equal(resolve(1366,1024,'auto',{fontScale:1.5}).sidebar,true);
assert.equal(resolve(1100,800,'sidebar',{fontScale:1.5}).sidebar,false);
const orientations=()=>load('src/lib/tablet-modal-orientations.ts',{'react-native':{Platform:{OS:'ios',isPad:true}}}).TABLET_MODAL_ORIENTATIONS;
assert.deepEqual([...orientations()],['portrait','portrait-upside-down','landscape-left','landscape-right']);
assert.equal(load('src/lib/tablet-modal-orientations.ts',{'react-native':{Platform:{OS:'ios',isPad:false}}}).TABLET_MODAL_ORIENTATIONS,undefined);
const root=createRoot(document.getElementById('root')),h=React.createElement;
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
let storage=new Map(),getCount=0,read=null,write=null,failRead=false,failWrite=false,model;
const asyncStorage={getItem:async key=>{getCount++;if(read)return read;if(failRead)throw Error('read');return storage.get(key)||null;},setItem:async(key,value)=>{if(write)await write;if(failWrite)throw Error('write');storage.set(key,value);}};
function createStore(){return load('src/lib/owner-navigation-preference.ts',{'@react-native-async-storage/async-storage':asyncStorage,react:React,'react-native':{Platform:{OS:'ios'}}});}
let store=createStore();
function Observer(){model=store.useOwnerNavigationPreference();return h('p',null,model.preference);}
const mount=async()=>{await act(async()=>root.render(h(Observer,{key:Math.random()})));};
const select=async value=>act(async()=>{await store.setOwnerNavigationPreference(value);});
(async()=>{
 await mount();assert.equal(model.preference,'auto');assert.equal(model.hydrated,true);assert.equal(getCount,1);
 await select('sidebar');assert.equal([...storage.values()][0],'sidebar');
 store=createStore();await mount();assert.equal(model.preference,'sidebar','preference survives module/device-session reload');
 await select('bottom');assert.equal(model.preference,'bottom');
 // A late initial read cannot overwrite a newer user selection.
 let release;read=new Promise(r=>release=r);store=createStore();await mount();assert.equal(model.hydrated,false);
 await select('sidebar');await act(async()=>release('bottom'));await flush();assert.equal(model.preference,'sidebar');read=null;
 // Rapid changes are serialized so the last choice survives reload.
 let resume;write=new Promise(r=>resume=r);
 let first,last;await act(async()=>{first=store.setOwnerNavigationPreference('bottom');last=store.setOwnerNavigationPreference('auto');});
 await act(async()=>{resume();await Promise.all([first,last]);});write=null;
 assert.equal([...storage.values()][0],'auto');assert.equal(model.saving,false);
 failWrite=true;await act(async()=>{await assert.rejects(store.setOwnerNavigationPreference('sidebar'));});
 assert.equal(model.preference,'sidebar');assert.match(model.error,/non salvata/);
 failWrite=false;await select('sidebar');assert.equal(model.error,null);
 failRead=true;store=createStore();await mount();assert.equal(model.preference,'auto');assert.equal(model.hydrated,true);assert.match(model.error,/leggere/);failRead=false;
 // The actual native hook observes window size, insets, text scale and IME.
 let dimensions={width:1366,height:1024,fontScale:1},insets={left:0,right:0},listeners={},navigation;
 const nativeHook=load('src/lib/use-owner-native-navigation.ts',{react:React,'react-native':{Platform:{OS:'android'},useWindowDimensions:()=>dimensions,Keyboard:{metrics:()=>null,addListener:(name,fn)=>{listeners[name]=fn;return {remove:()=>delete listeners[name]};}}},'react-native-safe-area-context':{useSafeAreaInsets:()=>insets},'./owner-navigation-layout':policy,'./owner-navigation-preference':{useOwnerNavigationPreference:()=>({preference:model.preference,hydrated:true})}}).useOwnerNativeNavigation;
 let draft,setDraft,mounts=0,unmounts=0;
 function Scene(){[draft,setDraft]=React.useState('Bozza non salvata');React.useEffect(()=>{mounts++;return()=>unmounts++;},[]);navigation=nativeHook();return h('p',null,draft);}
 const renderScene=async()=>act(async()=>root.render(h(Scene)));
 // model is auto after the simulated read failure.
 await renderScene();assert.equal(navigation.sidebar,true);
 await act(async()=>setDraft('Colore e piega, ancora in modifica'));
 dimensions={...dimensions,width:1024,height:1366};await renderScene();assert.equal(navigation.sidebar,false);
 dimensions={...dimensions,width:1366,height:1024};await renderScene();assert.equal(navigation.sidebar,true);
 dimensions={...dimensions,width:680,height:1024};await renderScene();assert.equal(navigation.sidebar,false,'split view fallback');
 dimensions={...dimensions,width:1366,height:800};await renderScene();assert.equal(navigation.sidebar,true);
 await act(async()=>{listeners.keyboardDidShow({endCoordinates:{height:340}});dimensions={...dimensions,height:460};});await renderScene();assert.equal(navigation.sidebar,true,'IME must not hide the rail while typing');
 await act(async()=>{listeners.keyboardDidHide();dimensions={...dimensions,height:800};});await renderScene();assert.equal(navigation.sidebar,true);
 assert.equal(draft,'Colore e piega, ancora in modifica');assert.equal(mounts,1);assert.equal(unmounts,0);
 await act(async()=>root.unmount());assert.equal(unmounts,1);assert.equal(Object.keys(listeners).length,0);
 // Actual navigator remains a single unkeyed instance; only scene padding changes.
 const source=ts.createSourceFile('tabs.tsx',fs.readFileSync('app/(tabs)/_layout.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let navigators=[];function visit(n){if(ts.isJsxOpeningElement(n)&&n.tagName.getText(source)==='ExpoRouterMaterialTopTabs')navigators.push(n);ts.forEachChild(n,visit);}visit(source);
 assert.equal(navigators.length,1);assert.ok(!navigators[0].attributes.properties.some(p=>p.name?.getText(source)==='key'));
 console.log('PASS adaptive navigation: size/orientation/split/text/insets matrix, local persistence/reload/races/errors, Android keyboard, React draft/lifecycle retention and unkeyed navigator. No physical-device proof.');
})().catch(e=>{console.error(e);process.exitCode=1;});
