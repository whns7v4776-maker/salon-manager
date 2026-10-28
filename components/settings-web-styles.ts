import React from 'react';
import { nativeSectionStyles, useNativePremium } from './owner-native-premium';
import { Platform, StyleSheet } from 'react-native';
import { useAccessAppearance } from './access-premium';
import { popupGlass, premiumWebCardStyles } from './premium-web-surfaces';

/** Presentation only: existing settings controllers retain their actions. */
export function useSettingsWebStyles<T extends Record<string, any>>(base: T, nativeEnabled=false): T {
  const { palette: p } = useAccessAppearance();
  const scopedNative=useNativePremium();
  const native=scopedNative||nativeEnabled;
  return React.useMemo(() => {
    if (Platform.OS !== 'web') return native ? nativeSectionStyles(base,p) : base;
    const result: Record<string, any> = {};
    for (const [key, original] of Object.entries(base)) {
      const value: any = { ...StyleSheet.flatten(original) };
      if (!/error|danger|warning|success|statusOn/i.test(key)) {
        if (value.color) value.color = /body|hint|description|note|caption|eyebrow/i.test(key) ? p.muted : p.ink;
        if (value.backgroundColor && value.backgroundColor !== 'transparent') value.backgroundColor = p.field;
      }
      for (const edge of ['borderColor','borderBottomColor','borderTopColor']) if(value[edge]) value[edge] = p.line;
      if(typeof value.fontSize==='number'&&value.fontSize<13){value.fontSize=13;if(value.lineHeight)value.lineHeight=Math.max(value.lineHeight,18);}
      if (value.fontWeight && Number(value.fontWeight)>600) value.fontWeight='500';
      if (/^(title|section|heading)$/.test(key) && value.fontSize) {value.fontFamily='Georgia';value.fontWeight='400';}
      if ((/^(save|primary|choiceActive|toggleEnabled|confirm)$/.test(key)||/PrimaryButton$|DarkButton$/i.test(key))||/Selected$|Active$/.test(key)&&value.backgroundColor) value.backgroundColor=p.action;
      if ((/^(saveText|primaryText|choiceActiveText|toggleTextEnabled|confirmText)$/.test(key)||/PrimaryButtonText$|DarkButtonText$/i.test(key))||/TextSelected$|TextActive$|ActiveText$|SelectedText$/.test(key)) value.color=p.actionText;
      if(/Card$|Panel$/.test(key)&&value.backgroundColor)Object.assign(value,popupGlass(p,'panel'));
      if (/^card$/.test(key)) Object.assign(value,{backgroundColor:'transparent',borderWidth:0,shadowOpacity:0,padding:0,marginBottom:0});
      if (/input|textarea/i.test(key)) Object.assign(value,{fontSize:14,color:p.ink,borderRadius:11,borderColor:p.line,backgroundColor:p.field});
      if (/save$|secondary$|primary$|choice$/.test(key)) Object.assign(value,{minHeight:44,borderRadius:11,paddingHorizontal:16,paddingVertical:12});
      if(/backdrop/i.test(key))Object.assign(value,{backgroundColor:p.night?'rgba(0,0,0,.52)':'rgba(40,35,29,.28)',backdropFilter:'blur(8px)'});
      if(key==='scheduleRowStackedMobile')Object.assign(value,{maxWidth:'100%',alignItems:'stretch'});
      if(key==='scheduleDayInfoWideMobile')Object.assign(value,{alignItems:'flex-start'});
      if(key==='scheduleRowDesktop')Object.assign(value,{flexWrap:'wrap'});
      if(key==='scheduleDayInfoDesktop')Object.assign(value,{width:'auto',minWidth:0,maxWidth:'100%',flexBasis:220,flexGrow:1});
      if(key==='scheduleControlsRowDesktop')Object.assign(value,{width:'auto',minWidth:0,maxWidth:'100%',flexBasis:260,flexGrow:1});
      if (value.shadowOpacity) value.shadowOpacity=0;
      result[key]=value;
    }
    return premiumWebCardStyles(result,p) as T;
  },[base,p,native]);
}
