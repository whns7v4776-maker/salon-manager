const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('app/(tabs)/agenda.tsx','utf8');
const tree=ts.createSourceFile('agenda.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['baseAgendaStyles','styles','availabilityBaseStyles']);
// Execute eager module style declarations in their real source order. This
// catches startup errors that types alone miss inside a deferred map callback.
const statements=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(tree))));
assert.equal(statements.length,3);
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
for(const platform of ['android','ios','web']){
 const StyleSheet={create:v=>v,flatten:v=>v,hairlineWidth:1,absoluteFillObject:{position:'absolute',top:0,bottom:0,left:0,right:0}};
 const context={StyleSheet,Platform:{OS:platform,select:choices=>choices[platform]??choices.default},IS_WEB:platform==='web',IS_ANDROID:platform==='android',IS_IOS:platform==='ios',Math,premiumFilterStyles:new Proxy({},{get:()=>({})}),PALETTE:new Proxy({},{get:()=>'#777777'})};
 for(const name of ['AGENDA_DENSITY_THUMB_SIZE','AGENDA_LIST_CONTENT_TOP_PADDING','ANDROID_TEXT_BREATHING_ROOM','DAY_CARD_GAP','DAY_CARD_WIDTH','WEEK_PLANNER_COLUMN_GAP','WEEK_PLANNER_DAY_HEADER_TOTAL_HEIGHT','WEEK_PLANNER_DAY_WIDTH','WEEK_PLANNER_EDGE_BLEED_LEFT','WEEK_PLANNER_LANE_HEADER_HALF_SPACER','WEEK_PLANNER_LANE_HEADER_HEIGHT','WEEK_PLANNER_RIGHT_CLIP_GUARD','WEEK_PLANNER_ROW_GAP','WEEK_PLANNER_ROW_HEIGHT','WEEK_PLANNER_TIME_BOUNDARY_ROW_HEIGHT','WEEK_PLANNER_TIME_BOUNDARY_ROW_OFFSET','WEEK_PLANNER_TIME_COL_TOTAL'])context[name]=40;
 vm.createContext(context);
 vm.runInContext(compile(statements.map(n=>n.getText(tree)).join('\n'))+'\nglobalThis.result={base:baseAgendaStyles,availability:availabilityBaseStyles};',context);
 assert.ok(Object.keys(context.result.availability).length>100);
 for(const [key,value] of Object.entries(context.result.availability))assert.ok(value,`${platform}: undefined style ${key}`);
 const exported={};
 vm.runInNewContext(compile(fs.readFileSync('components/agenda-premium-style.ts','utf8')),{exports:exported,require:name=>name==='react'?{createContext:()=>({})}:name==='react-native'?{Platform:context.Platform,StyleSheet}:null});
 const before=JSON.stringify(context.result.base);
 for(const night of [false,true]){
  const palette={night,ink:night?'#F7F3EC':'#252623',muted:night?'#BBB9B4':'#6E706B',action:'#343735',actionText:'#FFFFFF',line:'#999999',border:'#AAAAAA',field:'#EEEEEE',surface:'#DDDDDD'};
  const themed=exported.createAgendaPremiumStyles(context.result.base,palette);
  assert.equal(themed.weekPlannerTableShell.borderRadius,20);
  assert.equal(themed.weekPlannerTimeColumn.borderTopLeftRadius,19);
  assert.equal(themed.weekPlannerTimeColumnOverflow.borderTopLeftRadius,19);
  assert.equal(themed.weekPlannerTableShell.overflow,'visible','The drag host must not clip appointments or return animations');
  assert.equal(themed.weekPlannerTimeLabelHour.color,palette.ink);
  // The measured row and lane dimensions remain under the existing engine.
  for(const key of ['weekPlannerRow','weekPlannerLaneRow','weekPlannerCellWrap'])for(const prop of ['height','minHeight','width'])assert.equal(themed[key]?.[prop],context.result.base[key]?.[prop]);
 }
 assert.equal(JSON.stringify(context.result.base),before,'theme must not mutate shared base styles');
}
console.log('PASS Agenda module style initialization and day/night presentation on Android/iOS/web; measured row/lane sizes retained. Mocked native primitives only.');
