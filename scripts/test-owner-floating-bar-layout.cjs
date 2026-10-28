const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const file='app/(tabs)/_layout.tsx',source=fs.readFileSync(file,'utf8');
const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();let safeEdges;
function visit(node){
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&!declarations.has(node.name.text))declarations.set(node.name.text,node.initializer);
 if(ts.isJsxOpeningElement(node)&&node.tagName.getText(tree)==='SafeAreaView'){
  const edges=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.text==='edges');
  if(edges?.initializer&&ts.isJsxExpression(edges.initializer))safeEdges=edges.initializer.expression;
 }
 ts.forEachChild(node,visit);
}visit(tree);
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const names=['TAB_BAR_OUTER_BOTTOM_IOS','ANDROID_TAB_BAR_SAFE_GAP','tabBarBottomOffset','tabBarHorizontalPadding','availableBarWidth','tabSpacing','tabRowHorizontalPadding','tabItemWidth','theoreticalItemWidth','isUltraCompact','isCompact','tabBarHeight','indicatorWidth','indicatorRenderWidth','indicatorInset'];
const code=names.map(name=>{assert.ok(declarations.get(name),name);return `const ${name}=${declarations.get(name).getText(tree)};`;}).join('\n');
for(const os of ['ios','android'])for(const [width,height,left,right] of [[320,650,0,0],[360,800,0,0],[393,852,0,0],[844,390,44,44],[1200,900,0,0]])for(const bottom of [0,24,34,48]){
 const context={IS_WEB:false,IS_ANDROID:os==='android',IS_IOS:os==='ios',compactWebBar:false,viewportWidth:width,tabCount:7,safeAreaInsets:{left,right,bottom},Math};
 vm.createContext(context);vm.runInContext(compile(code)+'\nglobalThis.layout={availableBarWidth,tabBarBottomOffset,tabBarHorizontalPadding,tabItemWidth,tabRowHorizontalPadding,indicatorWidth,indicatorInset};',context);
 const l=context.layout;
 assert.ok(l.availableBarWidth+2*l.tabBarHorizontalPadding+left+right<=width,'Pill fits inside side safe areas');
 assert.ok(l.availableBarWidth<=620,'Wide bottom layout stays compact');
 assert.ok(l.tabItemWidth*7+2*l.tabRowHorizontalPadding<=l.availableBarWidth,'Seven hit areas share the same measured row');
 assert.ok(l.indicatorInset>=0&&6*l.tabItemWidth+l.indicatorInset+l.indicatorWidth<=l.availableBarWidth,'Indicator stays inside the pill');
 assert.equal(l.tabBarBottomOffset,os==='android'?10:Math.max(bottom,8),'Android adds only its gap; the native safe view supplies the inset before draw');
 const edges=vm.runInNewContext(`(${safeEdges.getText(tree)})`,context);
 assert.ok(edges.includes('left')&&edges.includes('right'));
 assert.equal(edges.includes('bottom'),os==='android','Do not double count the iOS hook inset');
}
const svgFile='components/ui/android-tab-bar-surface.tsx',svgSource=fs.readFileSync(svgFile,'utf8'),svgTree=ts.createSourceFile(svgFile,svgSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let radius;
function findRadius(n){if(ts.isVariableDeclaration(n)&&n.name.getText(svgTree)==='radius')radius=n.initializer;ts.forEachChild(n,findRadius);}findRadius(svgTree);
for(const premium of [undefined,{night:false},{night:true}])for(const selected of [false,true]){
 const value=vm.runInNewContext(`(${radius.getText(svgTree)})`,{premium,selected,customer:false,width:selected?54:348,height:selected?54:62,Math});
 assert.equal(value,selected?22:31,'The Android glass silhouette stays rounded in either theme');
}
console.log('PASS floating owner bar: actual layout expressions across portrait/landscape/tablet widths and system insets; native safe edges and rounded Android glass. Layout fixtures only, not physical-device proof.');
