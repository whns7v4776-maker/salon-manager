import { useOwnerViewport } from '../src/context/OwnerViewportContext';
import { OwnerBrandMark } from './salon-brand-mark';
import React, { createContext, forwardRef, useContext } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text as RNText, View, type TextProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { AccessWordmark, useAccessAppearance } from './access-premium';

/** Scope native presentation to the renewed sections; Agenda keeps its own layout. */
export const NativePremiumScope = createContext(false);
export const nativeSerif = Platform.OS === 'android' ? 'serif' : 'Georgia';
export function useNativePremium() { return useContext(NativePremiumScope) && Platform.OS !== 'web'; }

/** Content grows vertically. A numeric value may shrink only slightly, never to a tiny label. */
export const NativeReadableText = forwardRef<RNText, TextProps>(function NativeReadableText(props, ref) {
  const native = useNativePremium();
  if (!native) return <RNText ref={ref} {...props}/>;
  const { numberOfLines: _lines, ellipsizeMode: _ellipsis, minimumFontScale: _scale, ...rest } = props;
  const leaves=React.Children.toArray(props.children);
  const value=leaves.every(child=>typeof child==='string'||typeof child==='number')?leaves.join(''):'';
  const numeric = /^[\s\d.,:+−–/%€-]+$/.test(value) && /\d/.test(value);
  return <RNText ref={ref} {...rest} numberOfLines={numeric ? 1 : undefined}
    adjustsFontSizeToFit={numeric} minimumFontScale={0.85}
    style={[{flexShrink: 1, minWidth: 0}, props.style]}/>;
});

export function NativeSectionHeader({title, subtitle, action, onPress}: {
  title: string; subtitle?: string; action?: string; onPress?: () => void;
}) {
  const { palette: p, toggle } = useAccessAppearance();
  const focused = useIsFocused();
  const sidebar = useOwnerViewport()?.sidebar;
  // Same rhythm as the native Home: 64pt wordmark row, tight title block.
  return <View style={{gap: 12, marginTop: -9, marginBottom: 16}}>
    {focused ? <StatusBar barStyle={p.night ? 'light-content' : 'dark-content'}/> : null}
    {!sidebar ? <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between', minHeight:64}}>
      <View style={{width:154, flexShrink:1}}><OwnerBrandMark compact/></View>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'}
        style={{width:40,height:40,flexShrink:0,borderRadius:20,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}>
        <Ionicons name={p.night?'sunny-outline':'moon-outline'} size={20} color={p.ink}/>
      </Pressable>
    </View> : null}
    <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10}}>
      <NativeReadableText accessibilityRole="header" style={{fontFamily:nativeSerif,fontSize:27,lineHeight:34,letterSpacing:-.6,color:p.ink}}>{title}</NativeReadableText>
      {action && onPress ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onPress}
        style={{minHeight:44,paddingHorizontal:14,paddingVertical:11,borderRadius:13,backgroundColor:p.action,flexDirection:'row',alignItems:'center',gap:7,maxWidth:'100%'}}>
        <Ionicons name="add" size={19} color={p.actionText}/><NativeReadableText style={{fontSize:13,fontWeight:'600',color:p.actionText}}>{action}</NativeReadableText>
      </Pressable>:null}
    </View>
    {subtitle ? <NativeReadableText style={{fontSize:13,lineHeight:19,color:p.muted}}>{subtitle}</NativeReadableText>:null}
  </View>;
}

/** Palette adapter for existing native controllers. Never changes handlers or gestures. */
export function nativeSectionStyles<T extends Record<string, any>>(base:T, p:ReturnType<typeof useAccessAppearance>['palette']):T {
  const result:Record<string,any> = {};
  for (const [key, original] of Object.entries(base)) {
    const v = {...StyleSheet.flatten(original)};
    // Match intentional tint names, not the tInt substring in slotInterval.
    const semantic = /danger|delete|error|warning|success|status|swatch|colorPreview|accent|jewel/i.test(key) || /(?:^tint|Tint)/.test(key);
    const selected = /Active$|Selected$|Enabled$/.test(key) && !/Inactive|Disabled/.test(key);
    if (!semantic) {
      if (v.color) v.color = /hint|subtitle|caption|helper|description|note|meta/i.test(key) ? p.muted : p.ink;
      if (v.backgroundColor && v.backgroundColor !== 'transparent') v.backgroundColor = p.field;
      for (const edge of ['borderColor','borderBottomColor','borderTopColor']) if (v[edge]) v[edge]=p.line;
      if (selected && v.backgroundColor) v.backgroundColor=p.action;
      if (selected && v.color) v.color=p.actionText;
    }
    if (!semantic && /^(primary|save|confirm)$|PrimaryButton$|SaveButton$|buttonDark$/.test(key) && v.backgroundColor) v.backgroundColor=p.action;
    if (!semantic && /^(primaryText|saveText|confirmText)$|PrimaryButtonText$|SaveButtonText$|buttonDarkText$/.test(key)) v.color=p.actionText;
    if (typeof v.height==='number' && v.height>55 && /Card$|Panel$|Row$/.test(key) && !/avatar|icon|chart|photo|picker|wheel/i.test(key)) {v.minHeight=v.height;delete v.height;}
    if (v.fontFamily) v.fontFamily=Platform.OS==='ios'?'System':'sans-serif';
    if (/backdrop|scrim/i.test(key)&&v.backgroundColor&&v.backgroundColor!=='transparent') v.backgroundColor='rgba(0,0,0,.38)';
    if (/scrimVignette|cardTint/.test(key)) v.opacity=0;
    if (v.fontWeight && Number(v.fontWeight)>600) v.fontWeight='600';
    if (typeof v.fontSize==='number' && v.fontSize<12) {v.fontSize=12;if(v.lineHeight)v.lineHeight=Math.max(v.lineHeight,17);}
    if (v.shadowOpacity) {v.shadowOpacity=.035;v.elevation=0;}
    if (/input|textarea/i.test(key) && v.fontSize) Object.assign(v,{color:p.ink,backgroundColor:p.field,borderColor:p.line,minHeight:46,fontSize:15,textAlign:'left'});
    if (/^(title|heading|sectionTitle)$|ModalTitle$|EditorTitle$/.test(key)) Object.assign(v,{fontFamily:nativeSerif,fontWeight:'400',color:p.ink});
    if (/ModalCard$|DialogCard$|Sheet$|^sheet$/.test(key) && v.backgroundColor) Object.assign(v,{backgroundColor:p.night?'#202426':'#F5F2EC',borderColor:p.border});
    if (/Card$|Row$|Copy$|Title$|Content$/.test(key)) v.minWidth=0;
    result[key]=v;
  }
  return result as T;
}

/** Neutral legacy icon inks follow the native theme; semantic colors stay meaningful. */
export function NativePremiumIcon(props:React.ComponentProps<typeof Ionicons>){
 const native=useNativePremium();const {palette:p}=useAccessAppearance();
 const neutral=/^#(?:0f172a|111111|13213a|334155|475569|526781|64748b|1d4ed8|245588|29465b|244b65)$/i.test(String(props.color??''));
 return <Ionicons {...props} color={native&&neutral?p.ink:props.color}/>;
}
