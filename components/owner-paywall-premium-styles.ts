import React from 'react';
import { StyleSheet } from 'react-native';
import { useAccessAppearance } from './access-premium';

/** Palette-only adapter: billing periods, prices, purchase and restore handlers are unchanged. */
export function useOwnerPaywallPremiumStyles<T extends Record<string,any>>(base:T):T {
 const {palette:p}=useAccessAppearance();
 return React.useMemo(()=>{
  const result:Record<string,any>={};
  for(const [key,value] of Object.entries(base)){
   const style={...StyleSheet.flatten(value)} as Record<string,any>;
   const warning=/issue|BlockedNotice/i.test(key);
   if(style.color)style.color=warning?(p.night?'#D4B78C':'#805F32'):/note|subtitle|hint|caption|loading|disclosure/i.test(key)?p.muted:p.ink;
   if(style.backgroundColor&&style.backgroundColor!=='transparent')style.backgroundColor=warning?(p.night?'rgba(194,158,112,.10)':'rgba(194,158,112,.09)'):p.field;
   if(style.borderColor)style.borderColor=p.line;
   if(/Selected$/.test(key)){
    if(style.backgroundColor)style.backgroundColor=p.night?'rgba(216,194,155,.10)':'rgba(52,55,53,.065)';
    if(style.borderColor)style.borderColor=p.action;
   }
   if(style.shadowOpacity)style.shadowOpacity=0;
   result[key]=style;
  }
  for(const key of ['screen','scrollContent'])if(result[key])result[key].backgroundColor=p.canvas;
  if(result.panel)result.panel.backgroundColor=p.night?'#202526':'#F8F5EF';
  for(const key of ['primaryButton','founderPill'])if(result[key])result[key].backgroundColor=p.action;
  for(const key of ['primaryButtonText','founderPillText'])if(result[key])result[key].color=p.actionText;
  return result as T;
 },[base,p]);
}
