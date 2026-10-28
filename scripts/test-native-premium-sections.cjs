// Real React interactions over native primitives, with local fixtures only. This is not device layout proof.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://native-fixture.test'});
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React,h=React.createElement;
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:name=>deps[name]||{},Date,Intl,Error,Math});return exports;}
let night=false;
const appearance={AccessWordmark:()=>null,useAccessAppearance:()=>({palette:{night,ink:night?'#eee':'#222',muted:'#777',line:'#aaa',border:'#bbb',field:'#ddd',surface:'#eee',action:'#222',actionText:'#fff'},toggle(){night=!night;}})};
const textProps=[];
const rn={Platform:{OS:'ios'},StyleSheet:{flatten:x=>x},View:({children})=>h('div',null,children),ScrollView:({children})=>h('div',null,children),Text:({children,...props})=>{textProps.push(props);return h('span',null,children);},TextInput:({value,onChangeText,accessibilityLabel})=>h('input',{'aria-label':accessibilityLabel,value,onInput:e=>onChangeText(e.currentTarget.value)}),Pressable:({children,onPress,disabled,accessibilityLabel})=>h('button',{onClick:onPress,disabled,'aria-label':accessibilityLabel},children),Image:()=>null,StatusBar:()=>null,ActivityIndicator:()=>h('span',null,'Caricamento')};
const native=load('components/owner-native-premium.tsx',{react:React,'react-native':rn,'@expo/vector-icons':{Ionicons:()=>null},'@react-navigation/native':{useIsFocused:()=>true},'./access-premium':appearance,'../src/context/OwnerViewportContext':{useOwnerViewport:()=>null}});
const service=load('components/services-native-premium.tsx',{react:React,'react-native':rn,'@expo/vector-icons':{Ionicons:()=>null},'./access-premium':appearance,'./owner-native-premium':native,'../src/lib/service-accents':{withServiceAccentAlpha:()=> '#eeeeee'}}).NativeServiceCatalogCard;
const popup={NativeSettingsPopup:({title,children,onClose})=>h('section',{role:'dialog'},h('h2',null,title),children,h('button',{onClick:onClose},'Chiudi'))};
const cash=load('components/cash-native-workspace.tsx',{react:React,'react-native':rn,'@expo/vector-icons':{Ionicons:()=>null},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},'./access-premium':appearance,'./owner-native-premium':native,'./native-settings-popup':popup,'./ui/native-date-picker-modal':{NativeDatePickerModal:()=>null},'../src/lib/cash-summary':{formatCash:n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n)}}).CashNativeWorkspace;
const root=createRoot(document.getElementById('root'));
const render=async child=>act(async()=>root.render(h(native.NativePremiumScope.Provider,{value:true},child)));
const click=async label=>{const target=[...document.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label);assert.ok(target,'Missing '+label);await act(async()=>target.click());};
(async()=>{
 await render(h(native.NativeReadableText,{numberOfLines:1,ellipsizeMode:'tail',minimumFontScale:.5},'Un nome completo molto lungo che deve restare intero'));
 assert.equal(textProps.at(-1).numberOfLines,undefined);assert.equal(textProps.at(-1).ellipsizeMode,undefined);
 await render(h(native.NativeReadableText,{minimumFontScale:.4},['123456,78',' €']));assert.equal(textProps.at(-1).numberOfLines,1);assert.equal(textProps.at(-1).minimumFontScale,.85);
 let edited=0;
 for(night of [false,true]){
 await render(h(service,{name:'Colore personalizzato e piega professionale',role:'Hair Stylist',price:120.5,duration:100,accent:'#bbaaff',online:true,operators:[{id:'op',name:'Operatrice con nome completo'}],phases:{initialLabel:'Colore',initialDurationMinutes:40,processingDurationMinutes:30,finalServiceName:'Piega',finalDurationMinutes:30},onEdit:()=>edited++}));
 await click('Colore personalizzato e piega professionale, 120,50 €, 100 minuti. Mostra dettagli');
 for(const label of ['Colore','Posa','Piega','40 min','30 min','Operatrice con nome completo'])assert.ok(document.body.textContent.includes(label),label);
 await click('Modifica servizio');assert.ok(edited>0);
 // Reset local expansion for the next appearance.
 await render(h('div'));
 }
 let saved=0,exported=0,methodChanges=0;
 const model={period:'all',onPeriod:v=>{model.period=v;},periodLabel:'Storico',loading:false,disabled:false,total:120,cash:50,card:70,pending:25,query:'',onQuery:v=>{model.query=v;},page:1,pages:1,onPage(){},shop:null,description:'',onDescription:v=>{model.description=v;},amount:'',onAmount:v=>{model.amount=v;},method:'Contanti',onMethod:v=>{model.method=v;},services:[{id:'s',nome:'Servizio lungo completo',prezzo:25}],onService:id=>{assert.equal(id,'s');model.description='Servizio lungo completo';model.amount='25';},canSave:true,saving:false,onSave:async()=>{saved++;},onExport:async()=>{exported++;},exporting:false,movements:[{id:'m',title:'Cliente con nome completo e servizio',importo:25,stamp:'24 ott, 10:30',methodLabel:'—'}],getMovement:id=>model.movements.find(m=>m.id===id),onSetMethod:async(id,method)=>{model.movements[0].metodo=method;methodChanges++;},stripeAvailable:false,loyalty:()=>null};
 const view=()=>h(cash,{model,access:{enabled:false,onConfigure(){},onLock(){}}});
 await render(view());await click('+ Nuovo incasso');await click('Scegli un servizio');await click('Servizio lungo completo · 25,00 €');assert.equal(document.querySelectorAll('[role=dialog]').length,1,'Service selection stays in the same native sheet');
 await click('Registra incasso');assert.equal(saved,1);await click('Chiudi');await click('Report');await click('Esporta report');assert.equal(exported,1);await click('Chiudi');
 await click('Cliente con nome completo e servizio, 25,00 €, da incassare');await click('Incassato con contanti');assert.equal(methodChanges,1);await click('Chiudi');
 await act(async()=>root.unmount());console.log('PASS native sections: full text, numeric minimum scale, phases from actual duration fields, both themes, edit, service selection, income/save/export/method callbacks; mocked primitives, no salon writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
