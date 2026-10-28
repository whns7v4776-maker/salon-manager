const modalSelector='[aria-modal="true"],dialog[open]';
const scrollSelector='[data-scrollview],[style*="overflow"],textarea';
const marker='data-salon-page-scroll-locked';
const rootMarker='data-salon-modal-scroll-locked';
const installations=new WeakMap<Document,{users:number;dispose:()=>void}>();
const elementOf=(target:EventTarget|null):Element|null=>{
 const node=target as Node|null;return node?.nodeType===1?node as Element:node?.parentElement??null;
};

/** Contain browser scroll in the active modal, including Safari boundary gestures. */
function createLock(page:Document){
 const view=page.defaultView!;
 let active:Element|null=null,touch:{x:number;y:number}|null=null;
 const marked=new Map<Element,{attribute:string|null;x:number;y:number}>();
 const positions=new WeakMap<Element,{x:number;y:number}>();
 // Production RN Web uses opaque atomic class names. Read overflow rules
 // rather than depending on development-only class-name prefixes.
 let cachedSheets:CSSStyleSheet[]=[],cachedCounts:number[]=[],selectors=scrollSelector;
 const scrollNodes=()=>{
  const sheets=Array.from(page.styleSheets),rules=sheets.map(sheet=>{try{return sheet.cssRules;}catch{return null;}});
  const counts=rules.map(list=>list?.length??-1);
  if(sheets.length!==cachedSheets.length||sheets.some((sheet,i)=>sheet!==cachedSheets[i]||counts[i]!==cachedCounts[i])){
   const found=new Set<string>([scrollSelector]);
   const read=(list:CSSRuleList|null)=>{if(!list)return;for(const rule of Array.from(list)){
    const style=(rule as CSSStyleRule).style;
    if(style&&/(^|\s)(auto|scroll)(\s|$)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)){
     const selector=(rule as CSSStyleRule).selectorText;
     if(selector){try{page.querySelector(selector);found.add(selector);}catch{}}
    }
    const nested=(rule as CSSGroupingRule).cssRules;if(nested)read(nested);
   }};
   rules.forEach(read);selectors=Array.from(found).join(',');cachedSheets=sheets;cachedCounts=counts;
  }
  return Array.from(page.querySelectorAll(selectors));
 };
 const previousRoot=page.documentElement.getAttribute(rootMarker);
 const sheet=page.createElement('style');
 sheet.textContent=`html[${rootMarker}="true"],html[${rootMarker}="true"] body{overflow:hidden!important;overscroll-behavior:none!important;}[${marker}="true"]{overflow:hidden!important;overscroll-behavior:none!important;scrollbar-gutter:stable;scroll-behavior:auto!important;}html[${rootMarker}="true"] ${modalSelector.replace(',',`,html[${rootMarker}="true"] `)}{overscroll-behavior:none!important;}`;
 page.head.appendChild(sheet);
 const restore=(node:Element,value:{attribute:string|null})=>{if(value.attribute===null)node.removeAttribute(marker);else node.setAttribute(marker,value.attribute);};
 const update=()=>{
  const dialogs=Array.from(page.querySelectorAll(modalSelector)).filter(node=>
   !node.parentElement?.closest(modalSelector)&&!node.closest('[hidden],[aria-hidden="true"]')&&node.getClientRects().length>0&&view.getComputedStyle(node).visibility!=='hidden');
  const roleDialogs=dialogs.filter(node=>node.getAttribute('role')==='dialog');
  active=roleDialogs[roleDialogs.length-1]??dialogs[dialogs.length-1]??null;
  if(!active){
   for(const [node,value]of marked)restore(node,value);marked.clear();
   if(previousRoot===null)page.documentElement.removeAttribute(rootMarker);else page.documentElement.setAttribute(rootMarker,previousRoot);
   for(const node of scrollNodes())positions.set(node,{x:node.scrollLeft,y:node.scrollTop});
   return;
  }
  page.documentElement.setAttribute(rootMarker,'true');
  for(const [node,value]of marked)if(!node.isConnected||active.contains(node)){restore(node,value);marked.delete(node);}
  for(const node of scrollNodes()){
   if(node===page.body||node===page.documentElement||active.contains(node)||marked.has(node))continue;
   const style=view.getComputedStyle(node);
   if((/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)||(/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+1)){
    const before=positions.get(node)??{x:node.scrollLeft,y:node.scrollTop};
    marked.set(node,{attribute:node.getAttribute(marker),...before});node.setAttribute(marker,'true');
    if(Math.abs(node.scrollTop-before.y)>.5)node.scrollTop=before.y;
    if(Math.abs(node.scrollLeft-before.x)>.5)node.scrollLeft=before.x;
   }
  }
 };
 const schedule=update;
 const observer=new MutationObserver(records=>{
  if(records.some(record=>record.type==='childList'||(record.target instanceof Element&&(record.target.matches(modalSelector)||!!record.target.querySelector(modalSelector)))))schedule();
 });
 observer.observe(page.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','role','open','hidden','aria-hidden','style','class']});
 const current=()=>{
  if(active&&!active.isConnected||!active&&page.querySelector(modalSelector)){update();}
  return active;
 };
 const canScroll=(target:Element|null,modal:Element,delta:number,horizontal=false)=>{
  for(let node:Element|null=target;node&&modal.contains(node);node=node.parentElement){
   const style=view.getComputedStyle(node),axis=horizontal?'X':'Y';
   if(!/auto|scroll/.test(style[`overflow${axis}`]))continue;
   const host=node as HTMLElement,max=horizontal?host.scrollWidth-host.clientWidth:host.scrollHeight-host.clientHeight;
   if(max<=1)continue;
   const position=horizontal?host.scrollLeft:host.scrollTop;
   if(horizontal&&style.direction==='rtl'||delta<0&&position>1||delta>0&&position<max-1)return true;
  }
  return false;
 };
 const block=(event:Event,outside:boolean)=>{if(event.cancelable)event.preventDefault();if(outside)event.stopPropagation();};
 const wheel=(event:WheelEvent)=>{
  const modal=current();if(!modal||event.ctrlKey||event.metaKey)return;
  const target=elementOf(event.target),outside=!target||!modal.contains(target);
  const horizontal=event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY);
  const delta=horizontal?event.deltaX||event.deltaY:event.deltaY;
  if(outside||delta&&!canScroll(target,modal,delta,horizontal))block(event,outside);
 };
 const start=(event:TouchEvent)=>{touch=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;};
 const move=(event:TouchEvent)=>{
  const modal=current();if(!modal||!touch||event.touches.length!==1)return;
  const next=event.touches[0],dx=touch.x-next.clientX,dy=touch.y-next.clientY;touch={x:next.clientX,y:next.clientY};
  const target=elementOf(event.target),outside=!target||!modal.contains(target);
  if(!outside){for(let node:Element|null=target;node&&modal.contains(node);node=node.parentElement)if(view.getComputedStyle(node).touchAction==='none')return;}
  const horizontal=Math.abs(dx)>Math.abs(dy),delta=horizontal?dx:dy;
  if(outside||delta&&!canScroll(target,modal,delta,horizontal))block(event,outside);
 };
 const key=(event:KeyboardEvent)=>{
  const modal=current();if(!modal||event.ctrlKey||event.metaKey||event.altKey)return;
  const delta=['ArrowDown','PageDown','End'].includes(event.key)?1:['ArrowUp','PageUp','Home'].includes(event.key)?-1:event.key===' '?(event.shiftKey?-1:1):0;
  if(!delta)return;
  const target=elementOf(event.target),outside=!target||!modal.contains(target);
  if(!outside&&target?.closest('input,textarea,select,[contenteditable="true"],[role="slider"],[role="scrollbar"],[role="listbox"],[role="menu"],[role="tablist"]'))return;
  if(!outside&&event.key===' '&&target?.closest('button,[role="button"],a[href]'))return;
  if(outside||!canScroll(target,modal,delta))block(event,outside);
 };
 // Focusing an input or a browser scrollIntoView can move overflow:hidden
 // ancestors too. Restore their frozen position before React scroll listeners
 // can trigger pagination/loading behind the modal.
 const freezeBackground=(event:Event)=>{
  current();
  const node=elementOf(event.target),saved=node?marked.get(node):undefined;
  if(!node)return;
  if(!saved){positions.set(node,{x:node.scrollLeft,y:node.scrollTop});return;}
  event.stopImmediatePropagation();
  saved.y=Math.min(saved.y,Math.max(0,node.scrollHeight-node.clientHeight));
  const maxX=Math.max(0,node.scrollWidth-node.clientWidth);
  saved.x=saved.x<0?Math.max(saved.x,-maxX):Math.min(saved.x,maxX);
  if(Math.abs(node.scrollTop-saved.y)>.5)node.scrollTop=saved.y;
  if(Math.abs(node.scrollLeft-saved.x)>.5)node.scrollLeft=saved.x;
 };
 page.addEventListener('scroll',freezeBackground,true);
 page.addEventListener('wheel',wheel,{capture:true,passive:false});
 page.addEventListener('touchstart',start,{capture:true,passive:true});
 page.addEventListener('touchmove',move,{capture:true,passive:false});
 page.addEventListener('keydown',key,true);
 update();
 return()=>{
  observer.disconnect();
  page.removeEventListener('scroll',freezeBackground,true);page.removeEventListener('wheel',wheel,true);page.removeEventListener('touchstart',start,true);page.removeEventListener('touchmove',move,true);page.removeEventListener('keydown',key,true);
  for(const [node,value]of marked)restore(node,value);marked.clear();
  if(previousRoot===null)page.documentElement.removeAttribute(rootMarker);else page.documentElement.setAttribute(rootMarker,previousRoot);
  sheet.remove();
 };
}
export function installWebModalScrollLock(page:Document|undefined=typeof document==='undefined'?undefined:document):()=>void {
 if(!page?.body||!page.defaultView)return()=>{};
 let state=installations.get(page);if(state)state.users++;else{state={users:1,dispose:createLock(page)};installations.set(page,state);}
 let released=false;
 return()=>{if(released)return;released=true;if(--state.users===0){state.dispose();installations.delete(page);}};
}
