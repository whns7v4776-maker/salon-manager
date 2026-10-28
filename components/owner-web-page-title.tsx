import {Ionicons} from '@expo/vector-icons';
import React from 'react';
import {Platform,Pressable,Text,View,useWindowDimensions} from 'react-native';
import {useAccessAppearance} from './access-premium';
import {OwnerPremiumCompactAppearance} from './owner-premium-web';
/** One title scale and an in-flow theme control; web only. */
export function OwnerWebPageTitle({children}:{children:string}){
 const {palette:p}=useAccessAppearance();const {width}=useWindowDimensions();
 if(Platform.OS!=='web')return null;
 return <View {...{dataSet:{ownerPageTitle:'true'}}} style={{flexDirection:'row',alignItems:'center',gap:12,flex:1,minWidth:0}}><Text accessibilityRole="header" style={{fontFamily:'Georgia',fontSize:width<480?28:32,lineHeight:width<480?38:42,color:p.ink,flex:1,minWidth:0}}>{children}</Text>{width<1000?<OwnerPremiumCompactAppearance inline/>:null}</View>;
}

/** Fixed close target; heading and supporting copy reflow independently. */
export function OwnerWebSheetHeader({title,subtitle,onClose,closeLabel}:{title:string;subtitle?:string;onClose:()=>void;closeLabel?:string}){
 const {palette:p}=useAccessAppearance();const {width}=useWindowDimensions();
 if(Platform.OS!=='web')return null;
 return <View style={{gap:8,paddingBottom:16,flexShrink:0,minWidth:0}}><View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}><Text accessibilityRole="header" style={{flex:1,minWidth:0,fontFamily:'Georgia',fontSize:width<480?22:27,lineHeight:width<480?28:34,color:p.ink}}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={closeLabel??`Chiudi ${title}`} onPress={onClose} style={{width:40,height:40,flexShrink:0,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name="close-outline" size={21} color={p.ink}/></Pressable></View>{subtitle?<Text style={{fontSize:13,lineHeight:20,color:p.muted}}>{subtitle}</Text>:null}</View>;
}
