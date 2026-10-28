import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AccessBackdrop, useAccessAppearance } from './access-premium';

// Backdrop-only treatment: the night mask is restricted to the upper-right glare.
export function OwnerWebBackdrop() {
 const {palette:p}=useAccessAppearance();
 return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
  <AccessBackdrop/>
  {p.night?<View style={[StyleSheet.absoluteFill,{backgroundImage:'radial-gradient(ellipse 24% 18% at 91% 29%, rgba(15,17,18,.43) 0%, rgba(15,17,18,.24) 45%, transparent 100%)'} as any]}/>:null}
  {!p.night?<View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(62,53,42,.08)'}]}/>:null}
 </View>;
}
