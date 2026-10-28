const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('app/(tabs)/agenda.tsx','utf8');
const tree=ts.createSourceFile('agenda.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let renderer,pan;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='renderWeekAppointmentBaseContent')renderer=node.initializer.arguments[0];
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='gesture'&&node.getText(tree).includes('const isResizeHandleTouch')){
  function find(child){if(ts.isCallExpression(child)&&ts.isPropertyAccessExpression(child.expression)&&child.expression.name.text==='enabled'&&child.arguments[0]?.getText(tree).includes('IS_WEB || !nativeInteractionDisabled'))pan=child.arguments[0];ts.forEachChild(child,find);}find(node);
 }
 ts.forEachChild(node,visit);
}
visit(tree);assert.ok(renderer);assert.ok(pan,'The native body guard must be an actual recognizer input');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const evaluate=(node,context)=>vm.runInNewContext(transpile(`(${node.getText(tree)})`),context);
for(const web of [false,true])for(const disabled of [false,true])for(const protectedBody of [false,true]){
 assert.equal(evaluate(pan,{IS_WEB:web,disabled,nativeInteractionDisabled:protectedBody}),!disabled&&(web||!protectedBody));
}
const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
const time=value=>`${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;
for(const web of [false,true]){
 let kind='operator';
 const positions=new Map(),benefits=new Map();
 const ctx={IS_WEB:web,weekVisibleColWidth:280,appointmentGroupDisplayPositionById:positions,appointmentBenefits:benefits,
  React:{createElement:(type,props,...children)=>({type,props,children})},AgendaPremiumAppointmentContent:'PremiumCard',AppointmentBenefitBadges:'BenefitBadges',
  normalizeServicePhaseConfig:value=>value??null,normalizeServicePhaseOverlapOverrides:value=>value??null,
  getAppointmentBusySegmentStartingAt:item=>item.phaseConfig?{phase:item.renderedPhase||'initial',durationMinutes:item.renderedPhase==='final'?item.phaseConfig.finalDurationMinutes:item.phaseConfig.initialDurationMinutes}:null,
  getAppointmentDurationMinutes:item=>item.durataMinuti??60,getAppointmentEndTime:item=>time(minutes(item.ora)+(item.durataMinuti??60)),timeToMinutes:minutes,minutesToTime:time,
  renderWeekAppointmentSourceBadge:()=>null,getEffectiveWeekAppointmentSourceBadge:()=>kind,getWeekAppointmentTone:()=>({text:'#222222',border:'#77AA88'}),getWebWeekResizeIndicatorHeight:()=>27,getNativeWeekResizeIndicatorHeight:()=>18,
 };
 const render=evaluate(renderer,ctx);
 const simple={id:'isolated-simple',cliente:'Nome cliente completo',servizio:'Taglio e piega',ora:'09:00',durataMinuti:45,operatoreNome:'Alex'};
 const card=render(simple,180,220);
 assert.equal(card.type,'PremiumCard');
 assert.equal(card.props.client,simple.cliente);assert.equal(card.props.service,simple.servizio);assert.equal(card.props.duration,45);assert.equal(card.props.time,'09:00–09:45');assert.equal(card.props.footer,web?27:18);assert.equal(card.props.operator,'Alex');
 assert.equal(render(simple,180,220,'lane').props.operator,'','Lane identity already lives in the heading');
 assert.equal(render(simple,180,220,'lane',null,false,null,null,false).props.footer,0,'A preview without a handle must keep its whole body');
 kind='salon';assert.equal(render(simple,180).props.origin,'Salone');kind=null;assert.equal(render(simple,180).props.origin,'Cliente');
 const phased={...simple,phaseConfig:{initialLabel:'Colore',initialDurationMinutes:20,processingDurationMinutes:30,finalServiceName:'Piega',finalDurationMinutes:20,finalPhaseEnabled:true},renderedPhase:'initial'};
 const first=render(phased,180,220,'lane');assert.equal(first.props.time,'09:00–09:20');assert.equal(first.props.duration,20);assert.equal(first.props.service,'Colore');assert.equal(first.props.phase,'Fase 1/2 · Posa 30 min');
 const last=render({...phased,renderedPhase:'final'},180,220,'lane',null,false,'09:50');assert.equal(last.props.time,'09:50–10:10');assert.equal(last.props.service,'Piega');assert.equal(last.props.phase,'Fase 2/2 · Ripresa');
 for(const posa of [15,45])assert.ok(render({...phased,phaseConfig:{...phased.phaseConfig,processingDurationMinutes:posa}},180).props.phase.includes(`Posa ${posa} min`),'The label follows shortened and extended draft timing');
 positions.set(simple.id,'3/3');assert.equal(render(phased,180).props.phase,'Fase 3/3 · Posa 30 min');
 assert.ok(render({...phased,phaseOverlapOverrides:{initial:true}},180).props.phase.includes('Sovrapposto'));
 assert.equal(render({...simple,syntheticRequestStatus:'In attesa'},180).props.pending,true);
 assert.equal(render(simple,180,220,'lane',null,true).props.pending,true);
 benefits.set(simple.id,['subscription']);assert.equal(render(simple,180).props.benefits.type,'BenefitBadges');
}
console.log('PASS real Agenda card projection: simple/phased/processing/final/group/overlap/origin/benefits/pending/footer contracts and native protected-body matrix. Isolated fixtures only.');
