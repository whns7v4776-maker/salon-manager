const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let credentials,options,logout=0,owner=true,verifiedId='owner',authError=null,sessionChanges=0;
const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:owner?{user_id:'owner'}:null,error:null};}};
const main={auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@isolated.test'}}}),signInWithPassword(){sessionChanges++;}},rpc:async()=>({data:'isolated-salon'}),from:()=>query};
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cash-owner-verification.native.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,Error,require:id=>id==='./supabase'?{supabase:main,supabaseUrl:'https://isolated.test',supabaseAnonKey:'public-fixture'}:{createClient:(_url,_key,config)=>{options=config;return {auth:{signInWithPassword:async input=>{credentials=input;return {data:{user:{id:verifiedId}},error:authError};},signOut:async()=>{logout++;}}};}}});
(async()=>{
 const verify=exportsObject.verifyCashOwnerPassword;
 await assert.rejects(()=>verify('fixture','other@isolated.test'),/titolare/);assert.equal(credentials,undefined);
 owner=false;await assert.rejects(()=>verify('fixture','owner@isolated.test'),/titolare/);assert.equal(credentials,undefined);owner=true;
 verifiedId='someone-else';await assert.rejects(()=>verify('fixture','owner@isolated.test'),/non valida/);assert.equal(logout,1);
 verifiedId='owner';authError=new Error('wrong');await assert.rejects(()=>verify('fixture','owner@isolated.test'),/non valida/);assert.equal(logout,2);
 authError=null;await verify('fixture',' OWNER@isolated.test ');assert.equal(options.auth.persistSession,false);assert.equal(options.auth.autoRefreshToken,false);assert.equal(options.auth.detectSessionInUrl,false);assert.equal(logout,3);assert.equal(sessionChanges,0);assert.equal(credentials.email,'owner@isolated.test');
 console.log('PASS native owner verification: current identity, owner membership, exact user match, isolated nonpersistent auth and cleanup; mocked server, no credential retained.');
})().catch(e=>{console.error(e);process.exitCode=1;});
