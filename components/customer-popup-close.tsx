import React from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from './ui/haptic-touchable';
import { useCustomerPremiumAppearance } from './owner-premium-customers-style';
export function CustomerPopupClose({children,style,...props}:React.ComponentProps<typeof HapticTouchable>){
 const p=useCustomerPremiumAppearance();
 if(!p)return <HapticTouchable {...props} style={style}>{children}</HapticTouchable>;
 return <HapticTouchable {...props} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel || 'Chiudi finestra'} style={{alignSelf:'center',flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',minHeight:40,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Text style={{color:p.ink,fontSize:12}}>Chiudi</Text><Ionicons name="close-outline" size={18} color={p.ink}/></HapticTouchable>;
}
