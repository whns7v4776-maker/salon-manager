import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, type TextProps } from 'react-native';

/** Keep an action label at its normal size; shrink only its measured overflow. */
export function PremiumFitLabel({children,style,fontSize=13,minFontSize=11,...props}:TextProps & {fontSize?:number;minFontSize?:number}) {
 const nodeRef=useRef<any>(null);
 const [fitted,setFitted]=useState(fontSize);
 useEffect(()=>{
  if(Platform.OS!=='web'||typeof document==='undefined')return;
  const node=nodeRef.current as HTMLElement|null;
  const parent=node?.parentElement;
  if(!node||!parent)return;
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)return;
  const measure=()=>{
   const textStyle=getComputedStyle(node),parentStyle=getComputedStyle(parent);
   // Intrinsic-width actions already grow to their label: never shrink their own basis.
   if(parentStyle.flexGrow==='0'&&parentStyle.flexShrink==='0'&&parentStyle.flexBasis==='auto'){
    setFitted(previous=>previous===fontSize?previous:fontSize);
    return;
   }
   const horizontal=parentStyle.flexDirection.startsWith('row');
   const siblings=horizontal?Array.from(parent.children).filter(s=>s!==node&&getComputedStyle(s).display!=='none'):[];
   const padding=(parseFloat(parentStyle.paddingLeft)||0)+(parseFloat(parentStyle.paddingRight)||0);
   const gap=(parseFloat(parentStyle.columnGap)||0)*siblings.length;
   const occupied=siblings.reduce((width,s)=>width+s.getBoundingClientRect().width,0);
   const available=Math.max(0,parent.clientWidth-padding-gap-occupied);
   if(!available)return;
   context.font=`${textStyle.fontWeight} ${fontSize}px ${textStyle.fontFamily}`;
   const natural=context.measureText(node.textContent||'').width;
   const next=Math.min(fontSize,Math.max(minFontSize,Math.floor(fontSize*Math.min(1,available/Math.max(1,natural))*10)/10));
   setFitted(previous=>previous===next?previous:next);
  };
  measure();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  observer?.observe(parent);
  return()=>observer?.disconnect();
 },[children,fontSize,minFontSize]);
 return <Text {...props} ref={nodeRef} numberOfLines={Platform.OS==='web'?undefined:1} adjustsFontSizeToFit minimumFontScale={minFontSize/fontSize}
  style={[style,{fontSize:Platform.OS==='web'?fitted:fontSize,minWidth:0,flexShrink:1},Platform.OS==='web'?{whiteSpace:'nowrap'} as any:undefined]}>{children}</Text>;
}
