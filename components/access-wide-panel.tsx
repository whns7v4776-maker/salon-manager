import React from 'react';
import {Platform,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AccessGlassReflection,useAccessAppearance} from './access-premium';

/** Shared frame for side-by-side access and vertically stacked client panels. */
export function AccessWidePanel({enabled,disabled=false,stacked=false,compact=false,testID,children}:{enabled:boolean;disabled?:boolean;stacked?:boolean;compact?:boolean;testID:string;children:React.ReactNode}){
 const {palette:p}=useAccessAppearance();
 if(!enabled)return <>{children}</>;
 return <View testID={testID} style={{flex:stacked?undefined:1,width:stacked?'100%':undefined,minWidth:0,alignSelf:stacked?'stretch':'flex-start',padding:compact?16:24,borderRadius:24,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,...(Platform.OS==='web'?{backdropFilter:'blur(20px)',boxShadow:p.night?'inset 0 1px 0 rgba(255,255,255,.08),0 12px 32px rgba(0,0,0,.12)':'inset 0 1px 0 rgba(255,255,255,.65),0 12px 32px rgba(72,58,38,.06)'}:{})}}>
  <View pointerEvents="none" style={{position:'absolute',top:0,bottom:0,left:0,right:0,borderRadius:24,overflow:'hidden'}}><AccessGlassReflection/></View>
  {disabled?<View style={{flexDirection:'row',gap:9,alignItems:'flex-start',paddingBottom:18,marginBottom:18,borderBottomWidth:1,borderBottomColor:p.line}}><Ionicons name="lock-closed-outline" size={18} color={p.muted}/><Text accessibilityLiveRegion="polite" style={{flex:1,fontSize:13,lineHeight:19,color:p.muted}}>Associa prima un salone per accedere o registrarti.</Text></View>:null}
  <View aria-disabled={disabled} pointerEvents={disabled?'none':'auto'} accessibilityElementsHidden={disabled} importantForAccessibility={disabled?'no-hide-descendants':'auto'} {...(disabled&&Platform.OS==='web'?{inert:true}:{})} style={{width:'100%',opacity:disabled?.48:1,...(disabled&&Platform.OS==='web'?{filter:'grayscale(1)'}:{})}}>{children}</View>
 </View>;
}
