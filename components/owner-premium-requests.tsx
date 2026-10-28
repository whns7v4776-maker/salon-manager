import { useOwnerViewport } from '../src/context/OwnerViewportContext';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { OwnerStartupSkeletonPulse, OwnerStartupSkeletonItem } from '../src/context/OwnerStartupLoadingContext';
import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Platform, Pressable, StyleSheet, StatusBar, View, useWindowDimensions } from 'react-native';

import { AccessWordmark, useAccessAppearance } from './access-premium';
import { NativeHomeClock } from './owner-premium-native-home';
const sans=Platform.OS==='ios'?'System':'sans-serif';
/** Presentation only; counts are supplied by the existing Requests selectors. */
export const NativeRequestsHeader=React.memo(function NativeRequestsHeader({today,pending,handled,cancelled,cancelledBySalon,cancelledByClient}:{today:string;pending:string;handled:string;cancelled:string;cancelledBySalon?:string;cancelledByClient?:string}){
 const {palette:p,toggle}=useAccessAppearance();
 const focused=useIsFocused();
 const sidebar=useOwnerViewport()?.sidebar;
 return <View style={{gap:12,marginTop:-9,marginBottom:16}}>
 {focused?<StatusBar barStyle={p.night?'light-content':'dark-content'}/>:null}
 {!sidebar?<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',height:64}}><AccessWordmark compact/><Pressable accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggle} hitSlop={8} style={{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={p.night?'sunny-outline':'moon-outline'} size={19} color={p.ink}/></Pressable></View>:null}
 <View style={{gap:5}}><NativeHomeClock today={today}/><Text accessibilityRole="header" style={{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:27,lineHeight:34,letterSpacing:-.6,color:p.ink}}>Richieste</Text><Text style={{fontFamily:sans,fontSize:13,lineHeight:19,color:p.muted}}>Le prenotazioni, sotto controllo.</Text></View>
 <RequestsWebSummary pending={pending} handled={handled} cancelledBySalon={cancelledBySalon??cancelled} cancelledByClient={cancelledByClient??"—"}/>
 </View>;
});
export { nativeRequestsStyles } from './owner-premium-requests-style';

/** Same summary hierarchy as the app; all four existing web metrics remain visible. */
export function RequestsWebSummary({pending,handled,cancelledBySalon,cancelledByClient}:{pending:string;handled:string;cancelledBySalon:string;cancelledByClient:string}){
 const {palette:p}=useAccessAppearance();
 const {width}=useWindowDimensions();
 const compact=width<600;
 const entries=[{label:'In attesa',value:pending,tint:'#A899C9'},{label:'Già gestite',value:handled,tint:'#9BB39B'},{label:'Annullate dal salone',value:cancelledBySalon,tint:'#CBAE91'},{label:'Annullate dal cliente',value:cancelledByClient,tint:'#C296A4'}];
 return <View style={{flexDirection:'row',flexWrap:'wrap',borderWidth:1,borderColor:p.border,borderRadius:19,backgroundColor:p.night?'rgba(38,41,43,.82)':'rgba(255,253,250,.68)',marginBottom:16,overflow:'hidden'}}>
  {entries.map((entry,index)=><View key={entry.label} style={{flexBasis:compact?'50%':'25%',minWidth:0,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:10,paddingVertical:18,borderLeftWidth:index%(compact?2:4)?StyleSheet.hairlineWidth:0,borderLeftColor:p.line,borderTopWidth:compact&&index>=2?StyleSheet.hairlineWidth:0,borderTopColor:p.line}}>
   {entry.value==='—'?<OwnerStartupSkeletonPulse><OwnerStartupSkeletonItem style={{width:48,height:33,borderRadius:9,backgroundColor:p.night?'rgba(219,212,197,.14)':'rgba(185,175,158,.23)'}}/></OwnerStartupSkeletonPulse>:<Text style={{fontSize:27,lineHeight:33,fontWeight:'600',fontVariant:['tabular-nums'],color:p.ink}}>{entry.value}</Text>}
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:entry.tint}}/><Text style={{fontSize:11,lineHeight:16,color:p.muted,flexShrink:1,textAlign:'center'}}>{entry.label}</Text></View>
  </View>)}
 </View>;
}
