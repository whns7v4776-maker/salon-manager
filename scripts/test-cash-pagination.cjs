const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
async function scenario(count,failPage,voidFirst=0){
 const all=Array.from({length:count},(_,i)=>({id:String(i).padStart(8,'0'),booking_voided:i<voidFirst}));let calls=0;
 const supabase={from:()=>{let after='';const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,gt:(_,v)=>{after=v;return q},then:resolve=>{calls++;resolve(calls===failPage?{data:null,error:{message:'offline'}}:{data:all.filter(x=>x.id>after).slice(0,500),error:null});}};return q;}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cash-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>({supabase})});
 return {result:await exports.fetchCashRows('workspace'),calls};
}
(async()=>{const full=await scenario(1201);assert.equal(full.result.data.length,1201);assert.equal(full.calls,3);const empty=await scenario(0);assert.equal(empty.result.data.length,0);const failed=await scenario(1201,2);assert(failed.result.error);assert.equal(failed.result.data.length,0);const cancelled=await scenario(1201,undefined,600);assert.equal(cancelled.result.data.length,601);assert.equal(cancelled.calls,3);console.log('PASS pagination 1201 rows, cancelled balances, empty ledger, interrupted read never accepted as complete.');})().catch(e=>{console.error(e);process.exit(1)});
