const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom'),React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const dom=new JSDOM('<div id="root"></div>');Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:id=>deps[id]||{},console});return exports;}
const Appearance=React.createContext(null),Viewport=React.createContext(null);let setAppearance,setPreference,preference='auto',saved=[],fail=false,night=false,railWidth=224;
const appearance={useAccessAppearance:()=>React.useContext(Appearance)},viewport={useOwnerViewport:()=>React.useContext(Viewport)};
const rn={Platform:{OS:'ios'},StyleSheet:{create:x=>x,absoluteFill:{},hairlineWidth:1},View:({children,testID})=>h('div',{'data-testid':testID},children),ScrollView:({children})=>h('div',null,children),Text:({children,accessibilityRole,accessibilityLiveRegion})=>h('span',{role:accessibilityRole,'aria-live':accessibilityLiveRegion},children),Pressable:({children,onPress,accessibilityRole,accessibilityState,accessibilityLabel,disabled})=>h('button',{onClick:onPress,role:accessibilityRole,'aria-label':accessibilityLabel,'aria-checked':accessibilityState?.checked,'aria-selected':accessibilityState?.selected,disabled},children)};
const policy=load('src/lib/owner-navigation-layout.ts',{});
const choices={useOwnerNavigationPreference:()=>{const [state,change]=React.useState(preference);setPreference=change;return {preference:state,hydrated:true,saving:false,error:fail?'Scelta applicata a questa sessione, ma non salvata sul dispositivo. Riprova.':null,setPreference:async value=>{preference=value;change(value);saved.push(value);if(fail)throw Error('storage');}};}};
const native={NativeReadableText:rn.Text,nativeSerif:'Georgia'};
const panel=load('components/settings-native-appearance.tsx',{react:React,'react-native':rn,'@expo/vector-icons':{Ionicons:()=>null},'./access-premium':appearance,'./owner-native-premium':native,'../src/lib/owner-navigation-preference':choices,'../src/lib/use-owner-native-navigation':{useOwnerNativeNavigation:()=>policy.resolveOwnerNavigationLayout({width:900,height:1200,preference})}}).SettingsNativeAppearance;
const names=['Home','Agenda','Richieste','Clienti','Servizi','Cassa','Impostazioni'];let route='clienti',pressed=[];
const keys=['index','agenda','prenotazioni','clienti','servizi','cassa','settings'];
let consoleMounts=0,consoleUnmounts=0,attentionCalls=[];
function Console({onClose}){const [draft,setDraft]=React.useState('');React.useEffect(()=>{consoleMounts++;return()=>consoleUnmounts++;},[]);return h('section',{role:'dialog'},h('input',{'aria-label':'Bozza prodotto',value:draft,onInput:e=>setDraft(e.currentTarget.value)}),h('button',{'aria-label':'Chiudi Shop',onClick:onClose},'Chiudi Shop'));}
const shopModule=load('components/shop/shop-entry.tsx',{react:React,'react-native':rn,'expo-router':{useLocalSearchParams:()=>({shopOrderId:'order-from-link'})},'../owner-native-premium':{useNativePremium:()=>false},'./shop-section-tone':{shopSectionTone:()=>({soft:'#ddd'})},'../../src/lib/use-shop-attention':{useShopAttention:(id,active)=>{attentionCalls.push(active);return null;}},'./shop-attention':{shopSectionHasAttention:()=>false},'./shop-console':{ShopConsole:Console}});
let sidebarVisible=true;
const Sidebar=load('components/owner-native-sidebar.tsx',{react:React,'react-native':rn,'expo-blur':{BlurView:()=>null},'@expo/vector-icons':{Ionicons:()=>null},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:20,left:0})},'./access-premium':appearance,'./salon-brand-mark':{OwnerBrandMark:()=>h('span',null,'SalonPro')},'./shop/shop-entry':shopModule,'../src/context/AppContext':{useAppContext:()=>({salonWorkspace:{id:'isolated'}})},'../src/lib/salon-modules':{SALON_MODULES:Object.fromEntries(keys.map(k=>[k,{icon:{inactive:'mock'}}]))},'../src/context/OwnerViewportContext':viewport}).OwnerNativeSidebar;
function Harness({children}){const [mode,change]=React.useState(night?'night':'day');setAppearance=change;const p={night:mode==='night',ink:mode==='night'?'#EEE':'#222',muted:'#777',line:'#aaa',border:'#bbb',surface:'#eee',field:'#ddd',action:'#333',actionText:'#fff'};return h(Appearance.Provider,{value:{palette:p,mode,setMode:change}},h(Viewport.Provider,{value:{sidebar:sidebarVisible,railWidth,width:1142}},children));}
const root=createRoot(document.getElementById('root'));
const render=async children=>act(async()=>root.render(h(Harness,null,children)));
const click=async label=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label);assert.ok(b,'missing '+label);await act(async()=>b.click());};
const items=()=>keys.map((key,i)=>({key,label:names[i],selected:key===route,badge:key==='prenotazioni'?172:0,onPress:()=>{route=key;pressed.push(key);}}));
(async()=>{
 for(const mode of ['day','night']){
  await render(h(Sidebar,{items:items()}));await act(async()=>setAppearance(mode));
  for(const name of names)assert.ok(document.body.textContent.includes(name),name);
  assert.ok(document.querySelector('[role=tab][aria-selected=true]').textContent.includes('Clienti'));
  await click('Richieste, 172 da leggere');assert.equal(route,'prenotazioni');
  await render(h(Sidebar,{items:items()}));assert.ok(document.querySelector('[role=tab][aria-selected=true]').textContent.includes('Richieste'));
  assert.equal(document.querySelector('[role=dialog]'),null,'rail must not duplicate the Home order deep link');
  await click('Apri Shop e magazzino');assert.ok(document.querySelector('[role=dialog]'));
  await click('Chiudi Shop');await click('Aspetto automatico');
  route='clienti';
 }
 await render(h(Sidebar,{items:items()}));await click('Apri Shop e magazzino');
 const input=document.querySelector('input');
 await act(async()=>{const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;setter.call(input,'Prodotto in modifica');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const mountsBefore=consoleMounts,unmountsBefore=consoleUnmounts;
 for(sidebarVisible of [false,true,false,true]){await render(h(Sidebar,{items:items()}));assert.ok(document.querySelector('[role=dialog]'),'shop stays open across layout switches');assert.equal(consoleMounts,mountsBefore);assert.equal(consoleUnmounts,unmountsBefore);assert.equal(document.querySelector('input').value,'Prodotto in modifica','shop draft survives rotation');}
 await click('Chiudi Shop');assert.equal(consoleUnmounts,unmountsBefore+1);
 sidebarVisible=false;await render(h(Sidebar,{items:items()}));assert.equal(attentionCalls.at(-1),false,'hidden phone rail does not subscribe to Shop');sidebarVisible=true;
 await render(h(panel));
 await click('Menu laterale');assert.equal(saved.at(-1),'sidebar');assert.ok(document.body.textContent.includes('manca lo spazio necessario'));
 await click('Barra in basso');assert.equal(saved.at(-1),'bottom');await click('Automatica');assert.equal(saved.at(-1),'auto');
 await click('Tema scuro');await click('Tema chiaro');await click('Tema automatico');
 fail=true;await render(h(panel));await click('Menu laterale');assert.ok(document.querySelector('[role=alert]'));
 fail=false;await render(h(panel));assert.equal(document.querySelector('[role=alert]'),null);
 await act(async()=>root.unmount());
 console.log('PASS native navigation UI: full row selection, route/badge/shop callbacks, selected tab, day/night/theme controls, all navigation choices, narrow-window explanation and storage error. Mocked native primitives only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
