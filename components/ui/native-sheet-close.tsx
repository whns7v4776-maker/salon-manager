import React from 'react';
import {Platform, Pressable, Text} from 'react-native';
import {useAccessAppearance} from '../access-premium';

export function NativeSheetClose({onClose}:{onClose:()=>void}) {
  const {palette:p}=useAccessAppearance();
  if(Platform.OS==='web')return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={onClose} hitSlop={4} style={{width:38,height:38,flexShrink:0,borderRadius:12,borderWidth:1,borderColor:p.line,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,lineHeight:28,color:p.ink}}>×</Text></Pressable>;
}
