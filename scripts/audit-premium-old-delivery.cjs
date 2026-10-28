/* Read-only public Expo manifests/assets. Does not publish updates or send personal data. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=path.resolve(__dirname,'../work/premium-switch-20261025');
const noticeOnly=process.argv.includes('--notice-only');
const expected=noticeOnly?require('../work/legacy-update-notice-20261021/PRODUCTION-RELEASE-VERIFIED.json').releases:[];
const cases=noticeOnly?expected.map(x=>[x.platform,x.runtime]):[['android','1.0.14'],['android','1.0.14-meta1'],['android','1.0.13'],['android','1.0.13-meta1'],['ios','1.0.7'],['ios','1.0.7-meta1']];
async function inspect([platform,runtime]){
 const r=await fetch('https://u.expo.dev/cde34c38-a843-4af6-a402-0631fb9f5779',{headers:{'expo-runtime-version':runtime,'expo-channel-name':'production','expo-platform':platform,'expo-protocol-version':'1',accept:'multipart/mixed,application/expo+json,application/json'},signal:AbortSignal.timeout(25000)});
 const text=await r.text(),type=r.headers.get('content-type')||'';
 let manifest,extensions={};
 const boundary=type.match(/boundary="?([^";]+)/)?.[1];
 const chunks=boundary?text.split('--'+boundary).map(p=>p.slice(p.search(/\r?\n\r?\n/)).trim()):[text];
 for(const chunk of chunks){if(!chunk.startsWith('{'))continue;try{const item=JSON.parse(chunk);if(item.runtimeVersion&&item.launchAsset)manifest=item;else if(item.assetRequestHeaders)extensions=item;}catch{}}
 if(!manifest)return {platform,runtime,status:r.status,manifest:false};
 const asset=await fetch(manifest.launchAsset.url,{headers:extensions.assetRequestHeaders?.[manifest.launchAsset.key]||{},signal:AbortSignal.timeout(40000)});
 if(!asset.ok)throw Error('Asset read failed '+platform+'/'+runtime+'/'+asset.status);
 const bytes=Buffer.from(await asset.arrayBuffer()),hash=crypto.createHash('sha256').update(bytes).digest('base64url');
 if(hash!==manifest.launchAsset.hash)throw Error('Asset hash mismatch '+runtime);
 const prior=expected.find(x=>x.platform===platform&&x.runtime===runtime);
 return {platform,runtime,status:r.status,manifest:true,updateId:manifest.id,createdAt:manifest.createdAt,bundleHash:hash,bundleBytes:bytes.length,
  matchesPreparedRelease:prior?manifest.id===prior.updateId&&crypto.createHash('sha256').update(bytes).digest('hex')===prior.sha256:undefined,
  preparedUpdateMessage:bytes.includes(Buffer.from("Per continuare a utilizzare SalonPro, aggiorna l'app.")),
  customerProofHeader:bytes.includes(Buffer.from('x-salonpro-customer-token')),
  proofIssuer:bytes.includes(Buffer.from('create_customer_portal_session_v1')),
  updateNoticeText:bytes.includes(Buffer.from('Aggiorna'))||bytes.includes(Buffer.from('aggiornamento'))};
}
(async()=>{const results=await Promise.all(cases.map(async item=>{try{return await inspect(item);}catch(error){return {platform:item[0],runtime:item[1],error:error.message};}}));fs.writeFileSync(path.join(out,noticeOnly?'update-notice-current.json':'old-delivery-audit.json'),JSON.stringify({at:new Date().toISOString(),readOnly:true,cases:results,limitation:'Offered updates are not proof that a specific installed device downloaded/applied them. String presence does not prove a complete supported runtime.'},null,2)+'\n');console.log(JSON.stringify(results,null,2));if(noticeOnly&&results.some(x=>!x.matchesPreparedRelease||!x.preparedUpdateMessage))process.exitCode=1;})();
