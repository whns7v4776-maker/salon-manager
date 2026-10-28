(() => {
 const links=[...document.querySelectorAll('[data-premium-static-action="true"]')];
 const before=links.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
 let changes=0;
 for(let i=0;i<9;i++) for(const link of links){link.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));links.forEach((e,index)=>{const r=e.getBoundingClientRect();if([r.x,r.y,r.width,r.height].some((v,n)=>Math.abs(v-before[index][n])>.05))changes++;});}
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;top:0;width:300px;height:300px';document.body.appendChild(frame);
 try{
  const doc=frame.contentDocument,css=[];
  const walk=rules=>{for(const r of rules){if(r.style&&(r.style.scale||r.style.transform||r.style.translate))css.push(r.cssText.replaceAll(':active','[data-fixture-active="true"]'));if(r.cssRules)walk(r.cssRules);}};
  for(const sheet of document.styleSheets){try{walk(sheet.cssRules)}catch{}}
  const style=doc.createElement('style');style.textContent=css.join('\n');doc.head.appendChild(style);
  const scales=links.map(e=>{const clone=e.cloneNode(true);clone.setAttribute('data-fixture-active','true');doc.body.appendChild(clone);const s=frame.contentWindow.getComputedStyle(clone);return {scale:s.scale,transform:s.transform,translate:s.translate};});
  return JSON.stringify({links:links.length,hoverCycles:9,geometryChanges:changes,active:scales,ok:links.length===3&&changes===0&&scales.every(s=>s.scale==='1'&&s.transform==='none'&&s.translate==='none')});
 }finally{frame.remove()}
})()
