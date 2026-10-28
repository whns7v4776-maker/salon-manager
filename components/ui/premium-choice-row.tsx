import React from 'react';
import { ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

/** Compact choice groups keep full labels and their original controlled actions. */
export function PremiumChoiceRow({children,style}:{children:React.ReactNode;style?:StyleProp<ViewStyle>}) {
 const {width}=useWindowDimensions();
 if(width>600)return <View style={style}>{children}</View>;
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" directionalLockEnabled
  style={{maxWidth:'100%',minWidth:0,flexGrow:0,flexShrink:0}}
  contentContainerStyle={[style,{flexDirection:'row',flexWrap:'nowrap',alignItems:'center',gap:7,paddingBottom:2}]}>{children}</ScrollView>;
}
