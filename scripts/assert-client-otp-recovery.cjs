const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,dependencies){
 const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',out)(id=>dependencies[id],module,module.exports);
 return module.exports;
}
(async()=>{
 const deadline=load('src/lib/client-request-deadline.ts',{});
 assert.equal(await deadline.withClientDeadline(Promise.resolve('ok'),30),'ok');
 await assert.rejects(deadline.withClientDeadline(new Promise(()=>{}),10),/request_timeout/);
 let response={data:{ok:true,expiresAt:'2026-09-09T20:00:00Z'},error:null};
 let payload;
 const supabase={functions:{invoke:async(_,args)=>{payload=args.body;if(response instanceof Error)throw response;return response;}},rpc:()=>({abortSignal:async()=>response})};
 const otp=load('src/lib/email-verification.ts',{'./supabase':{supabase},'./client-request-deadline':deadline});
 const input={email:' TEST@EXAMPLE.COM ',purpose:'client_registration',salonCode:' SALON '};
 assert.equal((await otp.requestEmailOtp(input)).ok,true);
 assert.equal(payload.email,'test@example.com');assert.equal(payload.salonCode,'salon');
 response=new Error('offline');assert.equal((await otp.requestEmailOtp(input)).error,'network_error');
 response={error:{message:'Failed to fetch'},data:null};assert.equal((await otp.requestEmailOtp(input)).error,'network_error');
 response={error:{context:{json:async()=>({error:'rate_limited',retryAfterSeconds:31})}},data:null};
 assert.equal((await otp.requestEmailOtp(input)).retryAfterSeconds,31);
 response={data:{ok:false,error:'invalid_code'},error:null};assert.equal((await otp.verifyEmailOtp({...input,code:'123456'})).error,'invalid_code');
 response={data:{ok:true,token:'same-token'},error:null};assert.equal((await otp.verifyEmailOtp({...input,code:'123456'})).token,'same-token');
 const completion=load('src/lib/client-email-completion.ts',{'./supabase':{supabase:{rpc:async()=>{throw new Error('offline');}}},'./client-request-deadline':deadline});
 assert.equal((await completion.completeSalonCustomerEmail({salonCode:'s',email:'a@b.it',phone:'1234567890',otpToken:'token'})).ok,false);
 const ui=fs.readFileSync('app/cliente-screen.tsx','utf8');
 assert.match(ui,/disabled=\{isSavingProfile \|\| registrationPreparing \|\| clientEmailOtpBusy/);
 assert.match(ui,/registrationRecovered.*passwordRequired===true/);
 assert.match(ui,/resendAvailableAt=\{clientEmailOtpRetryAfterAt\}/);
 assert.match(ui,/if\(hydratedSalonState\)applyMergedPublicSalonState/);
 const sql=fs.readFileSync('supabase/migrations/20260909210000_client_otp_response_recovery.sql','utf8');
 assert.match(sql,/v_hash<>v_row.code_hash/);assert.match(sql,/interval '15 minutes'/);
 assert.match(sql,/if v_row.consumed_at is null then/);
 console.log('PASS: deadlines, offline/transport failure, send success, cooldown response, invalid/valid OTP, completion exception, UI recovery contracts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
