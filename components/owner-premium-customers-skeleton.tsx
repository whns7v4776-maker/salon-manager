import React from 'react';
import { View } from 'react-native';
import { useAccessAppearance } from './access-premium';
import { OwnerStartupSkeletonPulse, OwnerStartupSkeletonItem } from '../src/context/OwnerStartupLoadingContext';
/** Mirrors the native directory geometry without inventing missing customer data. */
export function NativeCustomersSkeleton(){
 const {palette:p}=useAccessAppearance();
 const fill=p.night?'rgba(219,212,197,.14)':'rgba(185,175,158,.23)';
 const glass=p.night?'rgba(38,41,43,.80)':'rgba(255,253,250,.67)';
 const line=(width:number|`${number}%`,height=12)=><OwnerStartupSkeletonItem style={{width,height,borderRadius:height/2,backgroundColor:fill}}/>;
 return <OwnerStartupSkeletonPulse style={{gap:12,width:'100%'}}>
  <View style={{padding:14,gap:14,borderRadius:20,borderWidth:1,borderColor:p.border,backgroundColor:glass}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:34}}>{line('48%',19)}{line(28,28)}</View>
   <View style={{height:46,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.field,paddingHorizontal:13,justifyContent:'center'}}>{line('65%')}</View>
   <View style={{flexDirection:'row',gap:8}}>{line(80,30)}{line(100,30)}</View>
  </View>
  {[0,1,2].map(index=><View key={index} style={{width:'100%',minHeight:164,padding:14,gap:13,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:glass}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:12}}>{line(48,48)}<View style={{flex:1,gap:9}}>{line('64%',17)}{line('84%',11)}</View>{line(26,26)}</View>
   <View style={{gap:8,marginLeft:60}}>{line('65%',11)}{line('46%',11)}</View>
   <View style={{flexDirection:'row',gap:8,justifyContent:'flex-end'}}>{line(72,30)}{line(72,30)}{line(30,30)}</View>
  </View>)}
 </OwnerStartupSkeletonPulse>;
}
