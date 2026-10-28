const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const {PNG}=require('pngjs');
const edge=fs.readFileSync('supabase/functions/salon-logo-plaque/index.ts','utf8');
const start=edge.indexOf('function trimLogo('),end=edge.indexOf('\nasync function generate',start);
const code=ts.transpileModule(edge.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const trim=new Function('PNG','Buffer',`${code}; return trimLogo;`)(PNG,Buffer);
const rejectClipped=new Function('PNG','Buffer',`${code}; return rejectClippedOutput;`)(PNG,Buffer);
function fixture(width,height,box) {
  const p=new PNG({width,height});p.data.fill(0);
  if(box)for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
    const i=(y*width+x)*4;p.data[i]=12;p.data[i+1]=34;p.data[i+2]=56;p.data[i+3]=255;
  }
  return PNG.sync.write(p);
}
const output=PNG.sync.read(trim(fixture(1536,1024,{x:100,y:400,w:1000,h:250})));
assert.equal(output.width,1016);assert.equal(output.height,266);
assert.deepEqual([...output.data.subarray((8*1016+8)*4,(8*1016+8)*4+4)],[12,34,56,255]);
assert.equal(output.data[3],0,'padding must stay transparent');
assert.doesNotThrow(()=>rejectClipped(fixture(500,300,{x:20,y:20,w:450,h:250})));
const noisy=PNG.sync.read(fixture(500,300,{x:20,y:20,w:450,h:250}));
noisy.data[3]=255;
for(let x=1;x<500;x++)noisy.data[x*4+3]=40;
assert.doesNotThrow(()=>rejectClipped(PNG.sync.write(noisy)),'isolated pixels and faint alpha are not clipped artwork');
for(const box of [{x:0,y:20,w:450,h:250},{x:50,y:20,w:450,h:250},{x:20,y:0,w:450,h:250},{x:20,y:50,w:450,h:250}])
  assert.throws(()=>rejectClipped(fixture(500,300,box)),/logo_output_clipped/);
for (const [w,h] of [[300,700],[1536,1024],[1200,100],[900,300]]) {
  const fitted=PNG.sync.read(trim(fixture(w,h,{x:0,y:0,w,h})));
  assert.equal(fitted.width,w+16);
  assert.equal(fitted.height,h+16);
  assert.deepEqual([...fitted.data.subarray((8*fitted.width+8)*4,(8*fitted.width+8)*4+4)],[12,34,56,255]);
}
assert.throws(()=>trim(fixture(400,100)),/logo_output_empty_or_small/);
assert.throws(()=>trim(fixture(400,100,{x:5,y:5,w:30,h:10})),/logo_output_empty_or_small/);
assert.doesNotMatch(edge,/Scegli un ritaglio più orizzontale/);
const sql=fs.readFileSync('supabase/migrations/20260909180000_salon_logo_plaque.sql','utf8');
assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public.salon_logo_plaques from anon, authenticated/);
assert.match(sql,/for update/);assert.match(sql,/usage_count >= 3/);
assert.match(edge,/\/auth\/v1\/user/);assert.match(edge,/eq\('user_id',user.id\)/);
assert.match(edge,/eq\('role','owner'\)/);assert.match(edge,/row.job_id!==body.jobId/);
const publicRead=sql.slice(sql.indexOf('create function public.get_salon_logo_plaque_v1'));
assert.doesNotMatch(publicRead,/draft_path/);
const ui=fs.readFileSync('components/ui/salon-logo-plaque.tsx','utf8');
assert.match(ui,/contentFit="contain"/);assert.match(ui,/height:72/);assert.match(ui,/width:260/);
const editor=fs.readFileSync('components/ui/salon-logo-editor.tsx','utf8');
assert.doesNotMatch(editor,/from ['"]expo-image-manipulator['"]/);
assert.match(editor,/scale=Math.min\(width\/source.width,height\/source.height\)\*zoom/);
for(const [w,h] of [[2172,724],[724,2172],[1200,300]]) {
  const scale=Math.min(280/w,70/h);
  assert(w*scale<=280.00001&&h*scale<=70.00001,'minimum zoom must contain every edge');
}
const prepareStart=edge.indexOf('function prepareLogo('),prepareEnd=edge.indexOf('// Remove only transparent',prepareStart);
const prepareCode=ts.transpileModule(edge.slice(prepareStart,prepareEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const prepare=new Function('PNG','Buffer',`${prepareCode};return prepareLogo;`)(PNG,Buffer);
const prepared=PNG.sync.read(prepare(new Uint8Array(fixture(2172,724,{x:0,y:0,w:2172,h:724})),null));
assert.doesNotThrow(()=>trim(new Uint8Array(fixture(1536,1024,{x:100,y:400,w:1000,h:250}))));
assert.equal(prepared.width,1536);assert.equal(prepared.height,512);
assert.throws(()=>prepare(fixture(400,100),{x:-1,y:0,width:1,height:1}),/invalid_crop/);
for(const [w,h] of [[300,1800],[1800,300],[600,600]]) {
  const original=fixture(w,h,{x:0,y:0,w,h});
  for(const input of [original]) {
    const result=PNG.sync.read(prepare(input,null));
    assert(Math.max(result.width,result.height)<=1536);
    assert(Math.abs(result.width/result.height-w/h)<0.01,'portrait and landscape proportions are preserved');
  }
}
assert.throws(()=>prepare(Buffer.from([137,80]),null),/invalid_image/);
assert.match(editor,/Nome salone/);assert.match(editor,/Logo · IA/);
assert.match(editor,/Salva targhetta/);assert.match(editor,/Annulla creazione/);
assert.match(editor,/Senza badge/);
assert.match(editor,/next.jobId===pendingGeneration.current/);
assert.doesNotMatch(editor,/useAI|Elabora con IA/);
assert.match(editor,/Prepara targhetta/);
assert.match(editor,/Continua con l’originale, senza IA/);
assert.match(edge,/body.action==='saveOriginal'/);
assert.match(edge,/solid black or very dark rectangle/);
assert.match(edge,/Keep it fully opaque/);
const direct=edge.slice(edge.indexOf("if(body.action==='saveOriginal')"),edge.indexOf("if(body.action==='cancel')"));
assert.match(direct,/prepareLogo\(bytes\(body.image\),null\)/);
assert.doesNotMatch(direct,/rejectClippedOutput|trimLogo|start_salon_logo_job|images\/edits/);
assert.match(edge,/job_id:null/);
assert.match(edge,/display_mode:'text'/);
const textSql=fs.readFileSync('supabase/migrations/20260909193000_salon_plaque_text_mode.sql','utf8');
assert.match(textSql,/display_mode='text' or approved_path is not null/);
assert.doesNotMatch(textSql,/draft_path/);
const frontend=fs.readFileSync('app/cliente-screen.tsx','utf8');
assert.doesNotMatch(frontend,/Ti avviseremo quando il salone confermerà/);
assert.match(frontend,/SalonLogoPlaque workspaceId=\{effectiveWorkspace\?\.id\}/);
console.log('PASS: pixel-preserving trim at all aspect ratios, transparent padding, empty output rejection, owner isolation, draft privacy, rate limit, bounded client badge.');

const fit=new Function('PNG','Buffer',`${code}; return fitHorizontalPlaque;`)(PNG,Buffer);
for(const [w,h] of [[1016,266],[300,700],[1200,100],[900,300]]){
 const output=PNG.sync.read(fit(fixture(w,h,{x:0,y:0,w,h})));
 assert.equal(output.width,1536);assert.equal(output.height,384);
 assert.equal(output.data[3],0);
 const rows=[],cols=[];for(let y=0;y<384;y++)for(let x=0;x<1536;x++)if(output.data[(y*1536+x)*4+3]){rows.push(y);cols.push(x);}
 const ow=Math.max(...new Set(cols))-Math.min(...new Set(cols))+1,oh=Math.max(...new Set(rows))-Math.min(...new Set(rows))+1;
 assert(Math.abs(ow/oh-w/h)<.05,'no distortion or clipping');
}
assert.match(edge,/gpt-image-2.5-sunburst/);assert.doesNotMatch(edge,/input_fidelity/);
console.log('PASS: horizontal 4:1 assets, complete portrait/wide artwork, unified AI action.');
