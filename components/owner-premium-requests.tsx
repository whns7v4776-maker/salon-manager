import { useOwnerViewport } from '../src/context/OwnerViewportContext';
import { OwnerBrandMark } from './salon-brand-mark';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { OwnerStartupSkeletonPulse, OwnerStartupSkeletonItem } from '../src/context/OwnerStartupLoadingContext';
import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Platform, Pressable, StyleSheet, StatusBar, View, useWindowDimensions } from 'react-native';

import { AccessWordmark, useAccessAppearance } from './access-premium';
import { NativeHomeClock, NativeMedal } from './owner-premium-native-home';
const sans=Platform.OS==='ios'?'System':'sans-serif';
/** Presentation only; counts are supplied by the existing Requests selectors. */
export const NativeRequestsHeader=React.memo(function NativeRequestsHeader({today,pending,handled,cancelled,cancelledBySalon,cancelledByClient}:{today:string;pending:string;handled:string;cancelled:string;cancelledBySalon?:string;cancelledByClient?:string}){
 const {palette:p,toggle}=useAccessAppearance();
 const focused=useIsFocused();
 const sidebar=useOwnerViewport()?.sidebar;
 return <View style={{gap:12,marginTop:-9,marginBottom:16}}>
 {focused?<StatusBar barStyle={p.night?'light-content':'dark-content'}/>:null}
 {!sidebar?<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',height:64}}><OwnerBrandMark compact/><Pressable accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'} onPress={toggle} hitSlop={8} style={{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={p.night?'sunny-outline':'moon-outline'} size={19} color={p.ink}/></Pressable></View>:null}
 <View style={{gap:5}}><NativeHomeClock today={today}/><Text accessibilityRole="header" style={{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:27,lineHeight:34,letterSpacing:-.6,color:p.ink}}>Richieste</Text><Text style={{fontFamily:sans,fontSize:13,lineHeight:19,color:p.muted}}>Le prenotazioni, sotto controllo.</Text></View>
 <RequestsWebSummary pending={pending} handled={handled} cancelledBySalon={cancelledBySalon??cancelled} cancelledByClient={cancelledByClient??"—"}/>
 </View>;
});
export { nativeRequestsStyles } from './owner-premium-requests-style';

const waitingTone=(p:{night:boolean;ink:string})=>p.ink;
/** Same language as the Home income card: one hero number, three quiet stats with medallions. */
export function RequestsWebSummary({pending,handled,cancelledBySalon,cancelledByClient}:{pending:string;handled:string;cancelledBySalon:string;cancelledByClient:string}){
 const {palette:p}=useAccessAppearance();
 const {width}=useWindowDimensions();
 const compact=width<600;
 const loading=pending==='—';
 const waiting=!loading&&Number(pending)>0;
 const gold=waitingTone(p);
 const value=(text:string,style:any)=>text==='—'?<OwnerStartupSkeletonPulse><OwnerStartupSkeletonItem style={{width:40,height:style.lineHeight-6,borderRadius:8,backgroundColor:p.night?'rgba(219,212,197,.14)':'rgba(185,175,158,.23)'}}/></OwnerStartupSkeletonPulse>:<Text style={style}>{text}</Text>;
 const stats:{label:string;value:string;icon:React.ComponentProps<typeof Ionicons>['name']}[]=[{label:'Gestite',value:handled,icon:'checkmark-done-outline'},{label:compact?'Annullate salone':'Annullate dal salone',value:cancelledBySalon,icon:'storefront-outline'},{label:compact?'Annullate cliente':'Annullate dal cliente',value:cancelledByClient,icon:'person-remove-outline'}];
 return <View style={{borderWidth:1,borderColor:p.border,borderRadius:19,backgroundColor:p.night?'rgba(38,41,43,.9)':'rgba(255,253,250,.86)',padding:compact?15:18,marginBottom:16,shadowColor:'#302419',shadowOpacity:p.night?.28:.08,shadowRadius:14,shadowOffset:{width:0,height:6}}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
   <View style={{flex:1,minWidth:0,gap:3}}>
    {value(pending,{fontFamily:sans,fontSize:32,lineHeight:40,fontWeight:'600',letterSpacing:-1,fontVariant:['tabular-nums'],color:p.ink})}
    <Text style={{fontFamily:sans,fontSize:12,lineHeight:18,color:p.muted}}>Richieste da confermare</Text>
   </View>
   {loading?null:<View style={{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,minHeight:32,borderRadius:16,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}>
    {waiting?<View style={{width:7,height:7,borderRadius:4,backgroundColor:gold}}/>:<Ionicons name="checkmark" size={14} color={gold}/>}
    <Text style={{fontFamily:sans,fontSize:12,fontWeight:'600',color:gold}}>{waiting?'Da gestire':'Tutto in ordine'}</Text>
   </View>}
  </View>
  <View style={{height:StyleSheet.hairlineWidth,backgroundColor:p.line,marginVertical:13}}/>
  <View style={{flexDirection:'row'}}>
   {stats.map((item,i)=><View key={item.label} style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:compact?6:10,paddingHorizontal:compact?5:12,borderLeftWidth:i?StyleSheet.hairlineWidth:0,borderLeftColor:p.line}}>
    <NativeMedal icon={item.icon} size={compact?32:36} iconSize={compact?15:17}/>
    <View style={{flex:1,minWidth:0}}>
     {value(item.value,{fontFamily:sans,fontSize:19,lineHeight:24,fontWeight:'600',fontVariant:['tabular-nums'],color:p.ink})}
     <Text numberOfLines={1} style={{fontFamily:sans,fontSize:11,lineHeight:15,color:p.muted}}>{item.label}</Text>
    </View>
   </View>)}
  </View>
 </View>;
}
