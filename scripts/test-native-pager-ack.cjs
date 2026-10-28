/* Exercise the installed adapter handlers. Native events and animated nodes are simulated. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),cp=require('node:child_process');
function harness(file,os='android'){
 let slots=[],cursor=0,effects=[],values=[],callbacks={},frameId=0,nativeProps,api,routes=Array.from({length:7},(_,i)=>({key:String(i)})),commits=[],commands=[],frameCallbacks=new Map();
 const scalar=initial=>({value:initial,setValue(v){this.value=v;},addListener(fn){this.listener=fn;return 'x';},removeListener(){delete this.listener;}});
 const memo=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={value:fn(),deps};return slots[i].value;};
 const ref=v=>{const i=cursor++;return slots[i]??={current:v};};
 const pager={setPageWithoutAnimation:i=>commands.push(['direct',i]),setPage:i=>commands.push(['animated',i])};
 const element=(type,props)=>{nativeProps=props;props.ref.current=pager;return {type,props};};
 const React={useRef:ref,useMemo:memo,useEffect(fn,deps){memo(()=>{effects.push(fn);},deps);},createElement:element};
 const rn={Platform:{OS:os},Keyboard:{dismiss(){}},StyleSheet:{create:x=>x},Animated:{createAnimatedComponent:x=>x,add:(a,b)=>({get value(){return a.value+b.value;}}),event:entries=>event=>{const nodes=entries[0].nativeEvent;nodes.position.setValue(event.nativeEvent.position);nodes.offset.setValue(event.nativeEvent.offset);}}};
 const exports={},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require(id){if(id==='react')return React;if(id==='react-native')return rn;if(id==='react-native-pager-view')return 'NativePager';if(id==='use-latest-callback')return fn=>fn;if(id==='./useAnimatedValue'||id==='./useAnimatedValue.js')return {useAnimatedValue:initial=>{const v=ref(scalar(initial)).current;if(!values.includes(v))values.push(v);return v;}};if(id==='react/jsx-runtime')return {jsx:element};return {};},requestAnimationFrame:fn=>{const id=++frameId;frameCallbacks.set(id,fn);return id;},cancelAnimationFrame:id=>frameCallbacks.delete(id),setTimeout,clearTimeout});
 const render=index=>{cursor=0;effects=[];exports.PagerViewAdapter({navigationState:{index,routes},animationEnabled:false,onIndexChange:i=>commits.push(i),onTabSelect:({index:i})=>{callbacks.selected=i;},children:next=>{api=next;return next.render(null);}});effects.forEach(fn=>fn());};
 render(0);
 return {render,commits,commands,callbacks,values,jump:i=>api.jumpTo(String(i)),selected:i=>nativeProps.onPageSelected({nativeEvent:{position:i}}),scroll:(position,offset)=>nativeProps.onPageScroll({nativeEvent:{position,offset}}),state:pageScrollState=>nativeProps.onPageScrollStateChanged({nativeEvent:{pageScrollState}}),flushFrames(){const frames=[...frameCallbacks.values()];frameCallbacks.clear();frames.forEach(fn=>fn());},get frameCount(){return frameCallbacks.size;}};
}
for(const file of ['node_modules/react-native-tab-view/src/PagerViewAdapter.tsx','node_modules/react-native-tab-view/lib/module/PagerViewAdapter.js']){
 let a=harness(file);
 a.jump(6);assert.deepEqual(a.commits,[6]);assert.equal(a.commands[0][0],'direct');
 // A late native scroll can update Animated after the synchronous tab command.
 a.scroll(1,.7);a.selected(2);assert.equal(a.values[0].value,1,'ignore stale selected event while another target is pending');
 a.selected(6);assert.equal(a.values[0].value,6);assert.equal(a.values[1].value,0,'ack clears stale interactive offset');assert.deepEqual(a.commits,[6],'ack must not navigate twice');assert.equal(a.frameCount,0);
 a.render(0);assert.equal(a.commands.length,1,'late React route must not move pager back');
 a.render(6);a.state('idle');a.flushFrames();assert.equal(a.values[0].value,6);a.selected(2);assert.deepEqual(a.commits,[6],'late idle events cannot change active tab');
 a.state('dragging');a.scroll(5,.3);a.selected(5);assert.equal(a.commits.at(-1),5,'actual swipe retains native authority');a.render(6);assert.equal(a.commands.length,1,'stale React props cannot override native swipe');a.state('idle');a.render(5);a.flushFrames();assert.equal(a.values[0].value,5);assert.equal(a.values[1].value,0);
 // A new tap supersedes a pending tap; only its ack is accepted.
 a.jump(1);a.jump(4);a.selected(1);a.scroll(0,.4);a.selected(4);assert.equal(a.values[0].value,4);assert.equal(a.values[1].value,0);assert.equal(a.commits.at(-1),4);
 const ios=harness(file,'ios');ios.jump(5);assert.deepEqual(ios.commits,[5]);assert.equal(ios.values[1].value,0);ios.render(0);assert.equal(ios.commands.length,1);ios.selected(5);assert.deepEqual(ios.commits,[5],'iOS immediate commit is not duplicated by acknowledgement');
}
const paths=['node_modules/react-native-tab-view/src/PagerViewAdapter.tsx','node_modules/react-native-tab-view/lib/module/PagerViewAdapter.js'];const before=paths.map(p=>fs.readFileSync(p,'utf8'));
cp.execFileSync(process.execPath,['scripts/patch-react-native-tab-view-native-jump.js'],{stdio:'pipe'});paths.forEach((p,i)=>assert.equal(fs.readFileSync(p,'utf8'),before[i],'postinstall must be idempotent'));
console.log('PASS pager acknowledgement: stale offsets, delayed events/React props, fast taps, real swipe authority, iOS retention, source/module parity and idempotent installer. Simulated native events, not device proof.');
