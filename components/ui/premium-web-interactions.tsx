import {installWebModalScrollLock} from '../../src/lib/modal-scroll-lock';
import React from 'react';
import {Platform} from 'react-native';
import {clientNotificationActionCss} from '../client-notification-actions';

/** Shared browser feedback, including portal dialogs. Native gestures stay untouched. */
export function PremiumWebInteractions({night}:{night:boolean}){
 React.useEffect(()=>{
  if(Platform.OS!=='web'||typeof document==='undefined')return;
  const releaseScrollLock=installWebModalScrollLock();
  let frame=0;
  const marked=new Set<Element>();
  const update=()=>{
   frame=0;
   const modals=Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(node=>!node.parentElement?.closest('[aria-modal="true"]')&&node.getClientRects().length>0);
   for(const node of marked)if(!modals.includes(node)||modals.indexOf(node)===0){node.removeAttribute('data-premium-nested-modal');marked.delete(node);}
   modals.slice(1).forEach(node=>{node.setAttribute('data-premium-nested-modal','true');marked.add(node);});
  };
  const containsModal=(node:Node)=>node instanceof Element&&(node.matches('[aria-modal="true"]')||!!node.querySelector('[aria-modal="true"]'));
  const observer=new MutationObserver(records=>{
   if(!frame&&records.some(record=>record.type==='attributes'||Array.from(record.addedNodes).some(containsModal)||Array.from(record.removedNodes).some(containsModal)))frame=requestAnimationFrame(update);
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal']});
  update();
  // Transparent text actions can stretch across a row in React Native Web.
  // Keep their feedback on the glyphs; painted buttons and cards retain their hover.
  const textActions=new Set<Element>();
  const classifyTextAction=(event:Event)=>{
   const source=event.target;
   if(!(source instanceof Element))return;
   const action=source.closest('button,a[href],[role="button"],[role="tab"],[role="link"],[data-web-clickable="true"]');
   if(!action||textActions.has(action))return;
   const transparent=(color:string)=>color==='transparent'||color==='rgba(0, 0, 0, 0)';
   const painted=(node:Element)=>{
    const style=getComputedStyle(node);
    return !transparent(style.backgroundColor)||style.backgroundImage!=='none'||
     ['Top','Right','Bottom','Left'].some(side=>parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`))>0&&!transparent(style.getPropertyValue(`border-${side.toLowerCase()}-color`))&&style.getPropertyValue(`border-${side.toLowerCase()}-style`)!=='none');
   };
   const textOnly=!!action.textContent?.trim()&&!action.querySelector('img,svg,canvas,input,textarea,select,[role="img"],button,[role="button"]')&&
    !painted(action)&&!Array.from(action.querySelectorAll('*')).some(painted);
   if(textOnly){action.setAttribute('data-premium-text-action','true');textActions.add(action);}
   else{action.removeAttribute('data-premium-text-action');textActions.delete(action);}
  };
  document.addEventListener('pointerover',classifyTextAction,true);
  return()=>{releaseScrollLock();document.removeEventListener('pointerover',classifyTextAction,true);for(const node of textActions)node.removeAttribute('data-premium-text-action');observer.disconnect();if(frame)cancelAnimationFrame(frame);for(const node of marked)node.removeAttribute('data-premium-nested-modal');};
 },[]);
 if(Platform.OS!=='web')return null;
 const target=':is(button,a[href],[role="button"],[role="tab"],[role="checkbox"],[role="radio"],[tabindex="0"]):not(input):not(textarea):not(select):not([role="slider"]):not([role="scrollbar"]):not([aria-disabled="true"]):not(:disabled):not([data-salon-cursor="grab"]):not([data-salon-cursor="resize-y"])';
 return React.createElement('style',{'data-premium-interactions':'true'},`
 :root{--premium-field-fill:${night?'#25292B':'#F5F2EC'};--premium-field-ink:${night?'#F1EEE7':'#262725'};--premium-focus-ring:${night?'#D8C29B':'#55745E'};color-scheme:${night?'dark':'light'};}
 input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus,input:-webkit-autofill:active {
  -webkit-text-fill-color:var(--premium-field-ink)!important;caret-color:var(--premium-field-ink)!important;
  -webkit-box-shadow:0 0 0 1000px var(--premium-field-fill) inset!important;box-shadow:0 0 0 1000px var(--premium-field-fill) inset!important;
  background-color:var(--premium-field-fill)!important;background-image:none!important;
 }
 input:autofill {color:var(--premium-field-ink)!important;background:var(--premium-field-fill)!important;box-shadow:0 0 0 1000px var(--premium-field-fill) inset!important;}
 :is(input,textarea,select):focus-visible{outline:1px solid var(--premium-focus-ring);outline-offset:1px;border-color:var(--premium-focus-ring)!important;}
 [data-premium-service-action]:hover,[data-premium-service-action]:focus-visible{outline:none!important;filter:none!important;}
 [data-premium-service-choice]:has([data-premium-service-action]:focus-visible){outline:2px solid var(--premium-focus-ring);outline-offset:-2px;}
 @media(hover:hover){[data-premium-service-choice]:has([data-premium-service-action]:hover){background:${night?'rgba(216,194,155,.075)':'rgba(255,255,255,.64)'};}}
 @media(prefers-reduced-motion:reduce){[data-premium-skeleton-sheen]{display:none!important;}}
 @media(hover:hover) and (pointer:fine){
  ${target}:hover{outline:1px solid ${night?'rgba(234,221,194,.48)':'rgba(99,115,100,.38)'};outline-offset:-2px;filter:brightness(${night?'1.12':'.965'});}
 }
 html body [data-premium-static-action="true"]:active{scale:1!important;translate:none!important;transform:none!important;}
 @media(hover:hover) and (pointer:fine){
  html body [data-premium-text-action="true"]{border-radius:12px;}
  html body [data-premium-text-action="true"][data-premium-text-action="true"][data-premium-text-action="true"]:hover{box-shadow:inset 0 0 0 1000px ${night?'rgba(216,194,155,.12)':'rgba(155,144,125,.12)'}!important;outline:none!important;filter:none!important;background-color:transparent!important;}
  html body [data-premium-text-action="true"]:hover [dir="auto"]{background:transparent!important;box-shadow:none!important;text-shadow:none!important;}

 }
 /* Bottom-bar feedback belongs to the outer tab; its visual layers stay inert. */
 @media(hover:hover) and (pointer:fine){
  html body [data-premium-bottom-bar="true"] [role="tab"]:hover {outline:none!important;box-shadow:none!important;background:transparent!important;filter:none!important;}
  html body [data-premium-bottom-bar="true"] [role="tab"] *:hover,
  html body [data-premium-bottom-bar="true"] [role="tab"] *:focus-visible {outline:none!important;box-shadow:none!important;filter:none!important;}
 }
 ${target}:focus-visible{outline:2px solid ${night?'#D8C29B':'#55745E'};outline-offset:-3px;}
 [data-premium-nested-modal="true"] {
   backdrop-filter:blur(8px) saturate(.88)!important;
   -webkit-backdrop-filter:blur(8px) saturate(.88)!important;
   background-color:${night?'rgba(12,16,18,.22)':'rgba(62,56,46,.16)'}!important;
 }

 :is([role="menu"],[role="listbox"],[data-premium-search-results]) {
   border:1px solid ${night?'rgba(237,230,215,.18)':'rgba(67,65,56,.17)'}!important;
   border-radius:16px!important;background:${night?'rgba(32,37,39,.96)':'rgba(250,248,243,.96)'}!important;
   backdrop-filter:blur(20px) saturate(1.1);box-shadow:0 10px 28px #00000020;
 }
 :is([role="menu"],[role="listbox"]) :is([role="menuitem"],[role="option"]):not([aria-label^="Elimina"]):not([aria-label^="Rimuovi"]) [dir="auto"] {color:${night?'#F1EEE7':'#30342F'}!important;}
 :is([role="menu"],[role="listbox"]) :is([role="menuitem"],[role="option"]):not([aria-selected="true"]) {background:transparent!important;border-color:transparent!important;}
 @media(hover:hover) and (pointer:fine){
  :is([role="menu"],[role="listbox"]) :is([role="menuitem"],[role="option"]):not([aria-selected="true"]):hover {background:${night?'rgba(216,194,155,.09)':'rgba(57,61,56,.055)'}!important;}
 }
 :is([role="menu"],[role="listbox"]) :is([role="menuitem"],[role="option"])[aria-selected="true"] {background:${night?'rgba(216,194,155,.18)':'rgba(57,61,56,.10)'}!important;border-color:var(--premium-focus-ring)!important;}

 @media(hover:hover) and (pointer:fine){
  html body [data-client-reading-control="true"]:not(:disabled):not([aria-disabled="true"]):hover {filter:none!important;outline:none!important;box-shadow:inset 0 1px 0 ${night?'rgba(255,255,255,.08)':'rgba(255,255,255,.7)'}!important;}
  html body [data-client-reading-control="true"] [role="tab"]:not(:disabled):not([aria-disabled="true"]):hover {filter:none!important;outline:none!important;box-shadow:inset 0 0 0 1000px ${night?'rgba(255,255,255,.025)':'rgba(38,39,37,.035)'}!important;}
 }
 html body [data-client-reading-control="true"]:focus-visible,
 html body [data-client-reading-control="true"] [role="tab"]:focus-visible {outline:2px solid var(--premium-focus-ring)!important;outline-offset:2px;}
 @media(hover:hover) and (pointer:fine){
  html body [data-client-bottom-bar="true"] [role="tab"]:not(:disabled):not([aria-disabled="true"]):hover {box-shadow:none!important;filter:none!important;outline:none!important;background-color:transparent!important;}
 }
 ${clientNotificationActionCss(night)}
 `);
}
