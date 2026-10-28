import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import React from 'react';
import { Platform, View } from 'react-native';

import { useAccessAppearance } from './access-premium';
import { CustomerPopupClose } from './customer-popup-close';
export function CustomerPopupHeader({title,subtitle,icon,onClose,disabled=false,compact=false}:{title:string;subtitle?:string;icon:React.ComponentProps<typeof Ionicons>['name'];onClose:()=>void;disabled?:boolean;compact?:boolean}){
 const {palette:p}=useAccessAppearance();
 return <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:18,paddingVertical:compact?12:18,borderBottomWidth:1,borderBottomColor:p.line}}>
  <View style={{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:p.field,borderWidth:1,borderColor:p.border}}><Ionicons name={icon} size={21} color={p.ink}/></View>
  <View style={{flex:1,minWidth:0,gap:4}}><Text accessibilityRole="header" style={{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontWeight:'400',fontSize:compact?21:24,lineHeight:compact?27:30,color:p.ink}}>{title}</Text>{subtitle&&!compact?<Text style={{fontSize:12,lineHeight:18,color:p.muted}}>{subtitle}</Text>:null}</View>
  <CustomerPopupClose onPress={onClose} disabled={disabled} accessibilityLabel={`Chiudi ${title}`}/>
 </View>;
}
