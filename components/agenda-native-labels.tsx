import {AgendaSlotFeedbackContext} from './agenda-slot-feedback';
import React from 'react';
import {Image,StyleSheet,Text,View,type StyleProp,type TextStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AgendaOperatorSurface} from './agenda-approved-surface';

/** Flow layout keeps Yoga from resolving icons against a zero-width text host. */
export function NativeAgendaCaption({label,icon,color,textStyle,bold=false}:{label:string;icon?:'cafe-outline'|'lock-closed-outline';color:string;textStyle?:StyleProp<TextStyle>;bold?:boolean}) {
 const pressed=React.useContext(AgendaSlotFeedbackContext);
 return <View pointerEvents="none" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',maxWidth:'100%',gap:pressed?6:0}}>
  <View style={{width:icon?20:0,alignItems:'center',justifyContent:'center',flexShrink:0}}>{icon?<Ionicons name={icon} size={12} color={color}/>:null}</View>
  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.78} style={[textStyle,{fontSize:10,lineHeight:15,color,fontWeight:bold?'700':'600',textAlign:'center',flexShrink:1}]}>{label}</Text>
  {pressed?<Text style={{fontSize:18,lineHeight:22,color,marginLeft:4}}>+</Text>:<View style={{width:icon?20:0,flexShrink:0}}/>}
 </View>;
}
export function NativeAgendaOperatorHeading({name,meta,photo,accent,unavailable,width,night,ink,muted}:{name:string;meta:string;photo?:string|null;accent:string;unavailable:boolean;width:number;night:boolean;ink:string;muted:string}) {
 const size=width<190?26:32,side=size+10;
 return <View style={{width:'100%',height:'100%',overflow:'hidden',flexDirection:'row',alignItems:'center',justifyContent:'center',paddingHorizontal:width<190?10:16}}>
  <AgendaOperatorSurface night={night}/>
  <View style={{width:side,alignItems:'center',justifyContent:'center',flexShrink:0}}>
   <View style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.9)',borderWidth:StyleSheet.hairlineWidth,borderColor:'#FFFFFF',opacity:unavailable?.55:1}}>
    {photo?.trim()?<Image source={{uri:photo}} style={{width:size,height:size}}/>:<Text style={{fontSize:size===26?18:21,color:'#5D655F',fontWeight:'500',includeFontPadding:false}}>{name.trim().charAt(0).toLocaleUpperCase('it')}</Text>}
   </View>
  </View>
  <View style={{flexShrink:1,maxWidth:Math.max(30,width-side-24),minWidth:0,alignItems:'flex-start',justifyContent:'center',gap:3}}>
   <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.72} style={{maxWidth:'100%',fontSize:12,lineHeight:16,fontWeight:'600',textAlign:'center',color:unavailable?muted:ink,includeFontPadding:false}}>{name}</Text>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',maxWidth:'100%'}}>
    <View style={{width:6,height:6,borderRadius:3,backgroundColor:unavailable?muted:accent,marginRight:4,flexShrink:0}}/>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={{fontSize:9,lineHeight:12,color:muted,textAlign:'center',flexShrink:1,includeFontPadding:false}}>{meta}</Text>
    <View style={{width:6,marginLeft:4,flexShrink:0}}/>
   </View>
  </View>

 </View>;
}
