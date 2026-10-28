const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('components/owner-subscription-paywall.tsx','utf8');
const start=source.indexOf('const normalizeLaunchOfferStatus =');
const end=source.indexOf('\n};',start)+3;
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const normalize=new Function('SALON_PRO_FOUNDER_LIMIT','REVENUECAT_FOUNDER_OFFERING_ID','REVENUECAT_STANDARD_OFFERING_ID',code+';return normalizeLaunchOfferStatus;')(100,'founder','default');
for(const used of [0,99,100,101]){
 const result=normalize([{founder_limit:100,founder_used:used,founder_available:true,offering_id:'founder'}]);
 assert.equal(result.offeringId,used<100?'founder':'default');
}
assert.throws(()=>normalize([]));assert.throws(()=>normalize(null));assert.throws(()=>normalize({}));
assert.ok(source.indexOf("onPress={() => setSelectedBillingPeriod('monthly')}")<source.indexOf("onPress={() => setSelectedBillingPeriod('annual')}"));
assert.match(source,/setSelectedBillingPeriod\(salonProPackages.monthly \? 'monthly' : 'annual'\)/);
assert.match(source,/currentOffer.offeringId!==launchOfferStatus.offeringId/);
assert.doesNotMatch(source,/selectSalonProOffering\(offerings/);
assert.match(source,/introPrice\?\.price === 0/);
assert.match(source,/defaultOption\?\.freePhase/);
console.log('PASS: monthly first, 99/100/101 paid threshold, malformed response rejected, no offering fallback, pre-purchase recheck, store free-trial checks.');
