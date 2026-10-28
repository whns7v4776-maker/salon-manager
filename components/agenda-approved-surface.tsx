import React, { useId, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Decoration only: never contributes to lane measurements or takes a touch. */
export function AgendaSlotSatin({night,top}:{night:boolean;top:number}) {
 return <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFillObject,{top,backgroundColor:night?'rgba(35,41,42,.16)':'rgba(235,229,217,.13)',...(Platform.OS==='web'?{backdropFilter:'blur(8px) saturate(.86)'}:{})}]}/>;
}
export function AgendaOperatorSurface({night}:{night:boolean}) {
 const id=`operator-${useId().replace(/:/g,'')}`;
 const colors=night?['rgba(48,53,51,.78)','rgba(61,64,57,.80)','rgba(44,49,47,.72)']:['rgba(190,177,155,.64)','rgba(213,201,181,.72)','rgba(226,216,198,.58)'];
 const ink=night?'#D8C29B':'#343735';
 const stops=night?[0,.025,.10,.20,.10,.025,0]:[0,.018,.075,.14,.075,.018,0];
 return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
  <Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="32%">{colors.map((c,i)=><Stop key={i} offset={[0,.42,1][i]} stopColor={c}/>)}</LinearGradient><LinearGradient id={`${id}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">{stops.map((opacity,i)=><Stop key={i} offset={[0,.12,.32,.5,.68,.88,1][i]} stopColor={ink} stopOpacity={opacity}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`}/></Svg>
  {[{left:0},{right:0}].map((position,i)=><View key={i} style={{position:'absolute',...position,top:Platform.OS==='web'?8:6,bottom:Platform.OS==='web'?8:6,width:1}}><Svg width="100%" height="100%"><Defs><LinearGradient id={`${id}-edge-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">{stops.map((opacity,j)=><Stop key={j} offset={[0,.12,.32,.5,.68,.88,1][j]} stopColor={ink} stopOpacity={opacity}/>)}</LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id}-edge-${i})`}/></Svg></View>)}

 </View>;
}

export function AgendaStateRule({night,reverse=false,hideOnAction=false}:{night:boolean;reverse?:boolean;hideOnAction?:boolean}){
 const id=`state-rule-${useId().replace(/:/g,'')}`;
 return <View {...(Platform.OS==='web'&&hideOnAction?{dataSet:{agendaStateRule:'true'}}:{})} style={{height:2,width:'100%',maxWidth:210,opacity:.85,transform:[{scaleX:reverse?-1:1}]}}><Svg width="100%" height={2} viewBox="0 0 100 2" preserveAspectRatio="none"><Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%"><Stop offset={0} stopColor={night?'#DCCCB1':'#5C5849'} stopOpacity={0}/><Stop offset={.25} stopColor={night?'#DCCCB1':'#5C5849'} stopOpacity={.04}/><Stop offset={1} stopColor={night?'#DCCCB1':'#5C5849'} stopOpacity={.28}/></LinearGradient></Defs><Rect width={100} height={2} fill={`url(#${id})`}/></Svg></View>;
}
export function AgendaPauseSurface({night}:{night:boolean}){
 const id=`pause-${useId().replace(/:/g,'')}`;
 const [size,setSize]=useState({width:1,height:1});

 return <View pointerEvents="none" onLayout={event=>{const {width,height}=event.nativeEvent.layout;setSize(current=>current.width===width&&current.height===height?current:{width,height});}} style={StyleSheet.absoluteFillObject}><Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height}><Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="30%"><Stop offset={0} stopColor={night?'#937141':'#C09D68'} stopOpacity={.24}/><Stop offset={.48} stopColor={night?'#BA9358':'#DEC9A3'} stopOpacity={night?.32:.39}/><Stop offset={1} stopColor={night?'#937141':'#C09D68'} stopOpacity={.20}/></LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`}/></Svg></View>;
}
