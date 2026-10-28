const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const s=fs.readFileSync('components/owner-subscription-paywall.tsx','utf8');
const code=s.slice(s.indexOf('  const handleLocalActivation ='),s.indexOf('  const selectedPackage ='));
for(const dev of [true,false])for(const os of ['ios','android','web']){
 let calls=0;const c={__DEV__:dev,Platform:{OS:os},busyAction:null,setBusyAction:()=>{},Alert:{alert:()=>{}},onDevContinue:()=>calls++};vm.createContext(c);vm.runInContext(ts.transpile(code+'\nglobalThis.go=handleLocalActivation;'),c);c.go();assert.equal(calls,dev&&os!=='web'?1:0);
}
assert.ok(!code.includes('setSalonWorkspace'));
assert.ok(!code.includes('supabase'));
console.log('PASS: DEV-native only; release/web blocked; no subscription writes');
