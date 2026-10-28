import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from '../access-premium';

/** Layout only: callers keep their inputs, selection state and callbacks. */
type ToolbarProps={children:React.ReactNode;style?:StyleProp<ViewStyle>;enabled?:boolean;onClose?:()=>void};
export function PremiumSearchToolbar({enabled=true,...props}:ToolbarProps) {
 return enabled?<SearchToolbarContent {...props}/>:<>{props.children}</>;
}
function SearchToolbarContent({children,style,onClose}:ToolbarProps) {
 const {palette:p}=useAccessAppearance();
 const [searchOpen,setSearchOpen]=useState(false);
 const host=useRef<View>(null);
 useEffect(()=>{if(searchOpen&&Platform.OS==='web'){const element=host.current as unknown as HTMLElement|null;element?.querySelector<HTMLInputElement>('input')?.focus();}},[searchOpen]);
 if(Platform.OS!=='web')return style?<View style={style}>{children}</View>:<>{children}</>;
 return <View ref={host} {...{dataSet:{premiumSearchToolbar:'true',premiumSearchOpen:searchOpen?'true':'false'},onFocusCapture:(event:React.FocusEvent<HTMLElement>)=>{if((event.target as HTMLElement).tagName==='INPUT')setSearchOpen(true);}}} style={[{minWidth:0,marginBottom:0,position:'relative'},style]}>
  {React.createElement('style',null,`
  [data-premium-search-toolbar] {display:grid!important;grid-template-columns:minmax(0,1fr) minmax(110px,.9fr);align-items:center;gap:10px!important;}
  [data-premium-search-toolbar] > style {display:none;}
  [data-premium-search-trigger] {display:none!important;}
  [data-premium-search-toolbar] > [data-premium-toolbar-filters] {grid-column:1;grid-row:1;min-width:0!important;width:100%!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;}
  [data-premium-search-toolbar] > :has(input):not([data-premium-toolbar-filters]), [data-premium-search-toolbar] > input {grid-column:2;grid-row:1;min-width:0!important;width:100%!important;max-width:100%!important;margin:0!important;overflow:hidden;}
  [data-premium-search-toolbar]:not(:has([data-premium-toolbar-filters])) > :has(input), [data-premium-search-toolbar]:not(:has([data-premium-toolbar-filters])) > input {grid-column:1 / -1;}
  [data-premium-toolbar-filters] > [aria-label^="Filtri"], [data-premium-toolbar-filters] [data-premium-filter-decoration] {display:none!important;}
  [data-premium-toolbar-filters] {overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none;flex-wrap:nowrap!important;gap:7px!important;}
  [data-premium-toolbar-filters]::-webkit-scrollbar {display:none;}
  [data-premium-toolbar-filters] [role="button"] {flex-shrink:0!important;min-height:40px!important;height:40px!important;padding:9px 13px!important;border-radius:12px!important;gap:5px!important;background:${p.field}!important;border:1px solid ${p.line}!important;box-shadow:none!important;transform:none!important;}
  [data-premium-toolbar-filters] [role="button"] [dir="auto"] {color:${p.ink}!important;white-space:nowrap!important;}
  [data-premium-toolbar-filters] [role="button"][aria-selected="true"], [data-premium-toolbar-filters] [role="button"][aria-pressed="true"], [data-premium-toolbar-filters] [data-agenda-booking-filter="selected"] {background:${p.action}!important;border-color:${p.action}!important;}
  [data-premium-toolbar-filters] [role="button"][aria-selected="true"] [dir="auto"], [data-premium-toolbar-filters] [role="button"][aria-pressed="true"] [dir="auto"], [data-premium-toolbar-filters] [data-agenda-booking-filter="selected"] [dir="auto"] {color:${p.actionText}!important;}
  [data-premium-search-toolbar] > :has(input):not([data-premium-toolbar-filters]), [data-premium-search-toolbar] > input {
    border:1px solid ${p.line}!important;border-radius:15px!important;
    background:${p.night?'rgba(35,40,42,.86)':'rgba(255,253,249,.84)'}!important;
    backdrop-filter:blur(18px) saturate(1.15);box-shadow:0 4px 14px ${p.night?'#00000018':'#443A290A'};
  }
  [data-premium-search-toolbar] > :has(input):not([data-premium-toolbar-filters]) input {border:0!important;background:transparent!important;border-radius:14px!important;}
  [data-premium-search-toolbar] input:focus-visible {outline:1px solid var(--premium-focus-ring)!important;outline-offset:-1px!important;}
  [data-premium-search-toolbar] input {min-width:0!important;max-width:100%!important;flex-shrink:1!important;min-height:42px!important;text-align:left!important;}
  @media(min-width:600px) {
   [data-premium-search-toolbar][data-premium-search-open="true"] input {padding-right:78px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] :has(> [aria-label="Svuota campo"]) {right:40px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] > [data-premium-search-trigger] {display:flex!important;position:absolute!important;grid-column:2;grid-row:1;left:auto!important;right:6px;top:50%;transform:translateY(-50%);width:34px!important;height:34px!important;min-height:34px!important;border:0!important;border-radius:10px!important;background:transparent!important;z-index:5;}
   [data-premium-search-toolbar][data-premium-search-open="true"]:not(:has([data-premium-toolbar-filters])) > [data-premium-search-trigger] {grid-column:1 / -1;}
  }
  @media(max-width:599px) {
   [data-premium-search-toolbar] {grid-template-columns:minmax(0,1fr) 42px;gap:8px!important;}
   [data-premium-search-toolbar] > [data-premium-search-trigger] {display:flex!important;grid-column:2;grid-row:1;}
   [data-premium-search-toolbar] > :has(input):not([data-premium-toolbar-filters]), [data-premium-search-toolbar] > input {display:none!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] {grid-template-columns:minmax(0,1fr)!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] > [data-premium-toolbar-filters] {grid-column:1!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] > :has(input):not([data-premium-toolbar-filters]), [data-premium-search-toolbar][data-premium-search-open="true"] > input {
     display:flex!important;position:relative!important;grid-column:1!important;grid-row:2!important;
     width:100%!important;min-height:46px!important;margin:0!important;padding:0!important;
     border:1px solid ${p.line}!important;border-radius:15px!important;overflow:hidden!important;
     background:${p.night?'rgba(35,40,42,.86)':'rgba(255,253,249,.84)'}!important;
     backdrop-filter:blur(18px) saturate(1.15);box-shadow:0 5px 16px ${p.night?'#00000024':'#443A2910'};
   }
   [data-premium-search-toolbar][data-premium-search-open="true"]:not(:has([data-premium-toolbar-filters])) > :has(input), [data-premium-search-toolbar][data-premium-search-open="true"]:not(:has([data-premium-toolbar-filters])) > input {grid-row:1!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] input {padding-left:14px!important;padding-right:78px!important;min-height:44px!important;border:0!important;background:transparent!important;border-radius:14px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] input:focus-visible {outline:1px solid var(--premium-focus-ring)!important;outline-offset:-1px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] > input {padding-left:14px!important;padding-right:46px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] :has(> [aria-label="Svuota campo"]) {right:40px!important;}
   [data-premium-search-toolbar][data-premium-search-open="true"] > [data-premium-search-trigger] {
     position:absolute!important;grid-column:1 / -1!important;grid-row:auto!important;left:auto!important;right:6px!important;bottom:6px!important;width:34px!important;height:34px!important;
     min-height:34px!important;border:0!important;border-radius:10px!important;background:transparent!important;z-index:5;
   }
  }
  `)}{children}<Pressable {...{dataSet:{premiumSearchTrigger:'true'}}} accessibilityRole="button" accessibilityLabel={searchOpen?'Chiudi ricerca':'Apri ricerca'} aria-expanded={searchOpen} onPress={()=>{if(searchOpen)onClose?.();setSearchOpen(value=>!value);}} style={{width:42,height:42,borderRadius:12,borderWidth:1,borderColor:p.line,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={searchOpen?'close-outline':'search-outline'} size={19} color={p.ink}/></Pressable>
 </View>;
}
