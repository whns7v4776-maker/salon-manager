const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function harness(file,name){
 let slots=[],i=0,effects=[],opens=[],dismisses=[],props;
 const React={createElement:()=>null,useRef(v){const n=i++;return slots[n]??=( {current:v});},useMemo:f=>f(),useCallback:f=>f,useState(v){const n=i++;if(!(n in slots))slots[n]=v;return [slots[n],v=>{slots[n]=v;}];},useEffect(fn,deps){const n=i++;const old=slots[n];if(!old||deps.some((v,j)=>v!==old.deps[j])){effects.push(()=>{old?.cleanup?.();slots[n]={deps,cleanup:fn()};});}}};
 const native={open:o=>opens.push(o),dismiss:m=>{dismisses.push(m);return Promise.resolve();}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{exports:module.exports,module,require(id){if(id==='react')return React;if(id.includes('access-premium'))return {useAccessAppearance:()=>({palette:{night:false}})};if(id.includes('owner-native-premium'))return {useNativePremium:()=>false};if(id.includes('settings-web-styles'))return {useSettingsWebStyles:x=>x};if(id.includes('web-picker-styles'))return {useWebPickerStyles:()=>({})};if(id==='react-native')return {Platform:{OS:'android'},StyleSheet:{create:x=>x,absoluteFillObject:{}}};if(id==='@react-native-community/datetimepicker')return {DateTimePickerAndroid:native};if(id.includes('haptics'))return {haptic:{light:()=>Promise.resolve(),error:()=>Promise.resolve()}};return {};},Date,console});
 return {opens,dismisses,render(p){props=p;i=0;effects=[];module.exports[name](p);effects.forEach(f=>f());},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
for(const [file,name,initial,mode] of [['native-time-picker-modal','NativeTimePickerModal','09:17','time'],['native-date-picker-modal','NativeDatePickerModal','2026-10-02','date']]){
 const h=harness(`components/ui/${file}.tsx`,name);let confirmed=[],closed=0;
 const p={visible:false,title:'Test',initialValue:initial,onClose:()=>closed++,onConfirm:v=>confirmed.push(v)};
 h.render(p);assert.equal(h.opens.length,0);
 h.render({...p,visible:true});assert.equal(h.opens.length,1);assert.equal(h.opens[0].display,'spinner');
 h.render({...p,visible:true});assert.equal(h.opens.length,1,'rerender must not duplicate native dialog');
 h.opens[0].onChange({type:'dismissed'});assert.equal(confirmed.length,0);assert.equal(closed,1);
 h.render(p);h.render({...p,visible:true});assert.equal(h.opens.length,2,'must reopen after cancel');
 h.opens[1].onChange({type:'set'},new Date(2026,9,7,14,37));assert.equal(confirmed[0],mode==='date'?'2026-10-07':'14:37');assert.equal(closed,2);
 h.render(p);h.render({...p,visible:true});h.unmount();assert.equal(h.dismisses.at(-1),mode,'closing parent dismisses native picker');
 h.opens[2].onChange({type:'set'},new Date());assert.equal(confirmed.length,1,'stale callback after unmount must not save');
}
console.log('PASS: native spinner open, no duplicate on render, cancel, reopen, confirm, parent cleanup and stale callbacks.');
