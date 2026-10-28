import {PremiumServiceContent} from './catalog-premium-cards';
import type {ServicePhaseConfig} from '../src/lib/service-phases';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import {HapticTouchable as Pressable} from './ui/haptic-touchable';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { NativeReadableText as Text, nativeSectionStyles, nativeSerif } from './owner-native-premium';

export function nativeServicesStyles<T extends Record<string,any>>(base:T,p:ReturnType<typeof useAccessAppearance>['palette']):T {
  const result:any=nativeSectionStyles(base,p);
  const set=(key:string,value:object)=>{if(base[key])result[key]={...result[key],...value};};
  set('container',{backgroundColor:'transparent'});
  set('heroCard',{display:'none'});
  set('content',{paddingTop:54,paddingBottom:132});
  for(const key of ['formCard','operatorsListCard','catalogOrderCard','publicCompositionSettingsCard'])set(key,{backgroundColor:p.surface,borderWidth:1,borderColor:p.border,borderRadius:20,shadowOpacity:0,elevation:0,padding:16,marginBottom:12});
  for(const key of ['serviceCardGlassGlow','serviceCardTintGlow','serviceCardDiagonalHighlight','serviceCardTopSheen','serviceCardInnerStroke','serviceRoleEmblemDepth','serviceRoleEmblemShine'])set(key,{opacity:0});
  set('formCardBody',{width:'100%',alignItems:'stretch',gap:14});
  set('desktopTopGrid',{marginBottom:0,gap:0});
  set('servicesListSectionTop',{backgroundColor:'transparent',borderWidth:0,paddingHorizontal:0,shadowOpacity:0,elevation:0});
  set('servicesListSectionBottom',{backgroundColor:'transparent',height:0});
  set('serviceGridRow',{gap:10,paddingHorizontal:0,backgroundColor:'transparent'});
  set('serviceGridItem',{minWidth:0});
  for(const key of ['input','catalogSearchInput'])set(key,{backgroundColor:p.field,color:p.ink,borderWidth:1,borderColor:p.line,borderRadius:13,minHeight:46,fontSize:15});
  for(const key of ['buttonDark','androidEditSaveButton','operatorSaveButton','customServiceContactSaveButton'])set(key,{backgroundColor:p.action,borderColor:p.border,minHeight:46});
  for(const key of ['buttonDarkText','androidEditSaveButtonText','operatorSaveButtonText','customServiceContactSaveButtonText'])set(key,{color:p.actionText});
  for(const key of ['serviceRoleFilterChipNativeActive','serviceCreationModeChoiceActive','serviceCreationModeCompositionChoiceActive'])set(key,{backgroundColor:p.action,borderColor:p.border});
  for(const key of ['serviceRoleFilterChipTextNativeActive','serviceCreationModeChoiceTitleActive','serviceCreationModeChoiceTextActive'])set(key,{color:p.actionText});
  for(const key of ['operatorName','listTitle','publicCompositionSettingsTitle','customServiceContactTitle'])set(key,{color:p.ink,fontFamily:nativeSerif,fontSize:21,lineHeight:28,textAlign:'left',fontWeight:'400'});
  for(const key of ['operatorCard','operatorCardNative','operatorCardNativePremium'])set(key,{backgroundColor:p.surface,borderColor:p.border,borderWidth:1,borderRadius:18,shadowOpacity:0,elevation:0});
  for(const key of ['operatorCardGlow','operatorCardShine','operatorCardDepth','operatorCardInnerStroke'])set(key,{opacity:0});
  for(const key of ['androidEditModalCard','androidOperatorEditModalCard'])set(key,{backgroundColor:p.night?'#202426':'#F5F2EC',borderColor:p.border});
  for(const key of ['successDialogCard','successDialogCardService','successDialogCardOperator'])set(key,{backgroundColor:p.night?'#242C28':'#F3F3E9',borderColor:p.border,borderWidth:1,borderRadius:22,padding:20});
  for(const key of ['successDialogTitle','successDialogBody','successDialogEyebrow'])set(key,{color:key==='successDialogBody'?p.muted:p.ink});
  for(const key of ['successDialogButton'])set(key,{backgroundColor:p.action,borderColor:p.action,minHeight:46,borderRadius:12,marginTop:16});
  set('successDialogButtonText',{color:p.actionText});
  for(const key of ['successDialogIconWrapService','successDialogIconWrapOperator'])set(key,{backgroundColor:p.night?'#344238':'#E2E9DB'});
  return result;
}

type Phase = ServicePhaseConfig;
export function NativeServiceCatalogCard({name,role,price,originalPrice,duration,accent,phases,linked,badge,online,onEdit,onArchive,onDelete,operators=[]}: {
  name:string;role:string;price:number;originalPrice?:number;duration:number;accent:string;phases?:Phase|null;linked?:string;badge?:string;online:boolean;onEdit:()=>void;onArchive?:()=>void;onDelete?:()=>void;operators?:{id:string;name:string;photo?:string}[];
}) {
  const {palette:p}=useAccessAppearance();
  const [expanded,setExpanded]=useState(false);
  return <View style={{backgroundColor:p.night?'#242D29':'#F7F5EE',borderColor:p.border,borderWidth:1,borderRadius:20,overflow:'hidden'}}><PremiumServiceContent name={name} role={role} price={price} originalPrice={originalPrice} duration={duration} accent={accent} phases={phases} linked={linked} badge={badge} online={online} operators={operators} expanded={expanded} onToggle={()=>setExpanded(v=>!v)} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete}/></View>;
}

export function NativeOperatorCatalogCard({name,role,availability,photo,services,onEdit,onArchive,onDelete}:{name:string;role:string;availability:string;photo?:string;services:string[];onEdit:()=>void;onArchive:()=>void;onDelete:()=>void}){
 const {palette:p}=useAccessAppearance();
 return <View style={{padding:16,gap:14,borderWidth:1,borderColor:p.border,borderRadius:18,backgroundColor:p.surface}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{width:44,height:44,borderRadius:22,backgroundColor:p.field,alignItems:'center',justifyContent:'center',overflow:'hidden'}}>{photo?<Image source={{uri:photo}} style={{width:44,height:44}}/>:<Ionicons name="person-outline" size={23} color={p.ink}/>}</View><View style={{flex:1,minWidth:0,gap:4}}><Text style={{fontFamily:nativeSerif,fontSize:21,lineHeight:27,color:p.ink}}>{name}</Text><Text style={{fontSize:13,color:p.muted}}>{role}</Text></View></View>
  <View style={{gap:6}}><Text style={{fontSize:12,lineHeight:18,color:p.muted}}>{availability}</Text>{services.length?<Text style={{fontSize:12,lineHeight:18,color:p.ink}}>{services.join(' · ')}</Text>:null}</View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[{label:'Modifica',icon:'create-outline' as const,run:onEdit},{label:'Archivia',icon:'archive-outline' as const,run:onArchive}].map(a=><Pressable key={a.label} accessibilityRole="button" accessibilityLabel={`${a.label} ${name}`} onPress={a.run} style={{flexGrow:1,flexBasis:110,minHeight:44,padding:12,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}><Ionicons name={a.icon} size={17} color={p.ink}/><Text style={{fontSize:13,color:p.ink}}>{a.label}</Text></Pressable>)}</View>
  <Pressable accessibilityRole="button" accessibilityLabel={`Elimina definitivamente ${name}`} onPress={onDelete} style={{alignSelf:'flex-start',minHeight:36,paddingVertical:8,paddingHorizontal:4}}><Text style={{fontSize:12,color:p.night?'#DCABB0':'#98525C'}}>Elimina definitivamente</Text></Pressable>
 </View>;
}
