const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const source=fs.readFileSync('app/index.tsx','utf8'),tree=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let gate,clientPanel;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='wideAccessPanels')gate=n.initializer;
 if(ts.isJsxOpeningElement(n)&&n.tagName.getText(tree)==='AccessWidePanel'&&n.attributes.getText(tree).includes('client-authentication'))clientPanel=n;ts.forEachChild(n,visit);}
visit(tree);assert.ok(gate);assert.ok(clientPanel);assert.ok(clientPanel.attributes.getText(tree).includes('disabled={!hasAssociatedSalon}'),'The prerequisite uses the validated association, not typed code');
assert.equal(clientPanel.attributes.properties.find(p=>p.name?.getText(tree)==='enabled').initializer,undefined,'The client authentication panel stays separated at every width');
assert.ok(clientPanel.attributes.getText(tree).includes('stacked={!wideAccessPanels}'));
const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props||{},children})};
const p={night:false,ink:'#252623',muted:'#6E706B',surface:'rgba(255,255,255,.66)',border:'#ddd',line:'#aaa'};
for(const platform of ['web','ios','android']){
 const exports={};vm.runInNewContext(compile(fs.readFileSync('components/access-wide-panel.tsx','utf8')),{exports,require:name=>name==='react'?React:name==='react-native'?{Platform:{OS:platform},View:'View',Text:'Text'}:name==='@expo/vector-icons'?{Ionicons:'Icon'}:{AccessGlassReflection:'Reflection',useAccessAppearance:()=>({palette:p})}});
 for(const width of [320,390,768,999,1000,1280,1600])for(const associated of [false,true]){
  const enabled=vm.runInNewContext(compile(`(${gate.getText(tree)})`),{Platform:{OS:platform},responsive:{width}});
  assert.equal(enabled,platform==='web'&&width>=1000);
  const owner=exports.AccessWidePanel({enabled,children:'Original owner form'});
  if(!enabled){assert.equal(owner.type,'Fragment');assert.equal(owner.children[0],'Original owner form','Narrow/native owner access retains its form tree');}
  const view=exports.AccessWidePanel({enabled:true,stacked:!enabled,compact:width<=390,disabled:!associated,testID:'client-authentication',children:'Original form'});
  assert.equal(view.props.style.width,!enabled?'100%':undefined,'Stacked panels use the whole available width');
  assert.equal(view.props.style.flex,enabled?1:undefined,'Stacked panels must grow with their form instead of compressing it');
  const form=view.children.at(-1);
  assert.equal(form.props.pointerEvents,associated?'auto':'none');
  assert.equal(form.props.inert,!associated&&platform==='web'?true:undefined,'Web keyboard focus is gated as well as pointer input');
  assert.equal(form.props.accessibilityElementsHidden,!associated);
  assert.equal(form.props.importantForAccessibility,associated?'auto':'no-hide-descendants');
  assert.equal(form.props['aria-disabled'],!associated);
  assert.equal(form.props.style.opacity,associated?1:.48);
  assert.equal(form.children[0],'Original form');
  assert.equal(!!view.children[1],!associated,'The blocked form explains the required salon association');
 }
}
console.log('PASS access panels across web/iOS/Android widths: stacked client panels, validated association gate, pointer/keyboard/accessibility gating, and original narrow owner access. Isolated fixtures only.');
