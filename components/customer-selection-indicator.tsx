import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
/** Decorative state only: the enclosing radio retains its original handler. */
export function CustomerSelectionIndicator({selected,size=23}:{selected:boolean;size?:number}){
 const {palette:p}=useAccessAppearance();
 return <View accessible={false} style={{width:size,height:size,borderRadius:Math.ceil(size/2),borderWidth:selected?0:1.5,borderColor:p.night?'#A8A9A3':'#787A71',backgroundColor:selected?p.action:(p.night?'rgba(255,255,255,.06)':'rgba(255,255,255,.7)'),alignItems:'center',justifyContent:'center',flexShrink:0}}>{selected?<Ionicons name="checkmark" size={Math.round(size*.7)} color={p.actionText}/>:null}</View>;
}
