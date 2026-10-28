import React, { useState } from 'react';
import { Image } from 'expo-image';
import { Platform,Text,View,useWindowDimensions } from 'react-native';
import { useAppContext } from '../src/context/AppContext';
import { useSalonBrandPlacement } from '../src/lib/salon-brand-placements';
import { plaqueArtworkUrl, plaqueUrl } from '../src/lib/salon-logo-plaque';
import { AccessWordmark, useAccessAppearance } from './access-premium';

export function SalonBrandMark({workspaceId,name,surface,compact=false,powered=true,size,children,align='center'}:{workspaceId?:string;name:string;surface:'owner'|'frontend';compact?:boolean;powered?:boolean;size?:{width:number;height:number};flush?:boolean;align?:'center'|'start';children:React.ReactNode}){
 const {palette:p}=useAccessAppearance();
 const {value}=useSalonBrandPlacement(workspaceId);
 const [failedPath,setFailedPath]=useState<string|null>(null);
 const [originalPath,setOriginalPath]=useState<string|null>(null);
 const [imageRatio,setImageRatio]=useState<{path:string;ratio:number}|null>(null);
 const active=value?.eligible&&value.path&&failedPath!==value.path&&(surface==='owner'?value.ownerEnabled:value.frontendEnabled);
 if(!active)return <>{children}</>;
 const ratio=imageRatio?.path===value.path?imageRatio.ratio:4;
 const signatureHeight=powered?(compact?16:19):0;
 return <View accessibilityLabel={`Insegna ${name}${powered?'. Powered by Salon Pro':''}`} style={{width:size?.width??'100%',maxWidth:size?.width??(compact?154:300),...(size?{height:size.height}:{}),alignSelf:align==='start'?'flex-start':'center',alignItems:'center',gap:5,minWidth:0}}>
  <View style={{width:'100%',...(size?{height:Math.max(1,size.height-signatureHeight)}:{aspectRatio:ratio}),minHeight:0,overflow:'hidden'}}>
   <Image source={{uri:originalPath===value.path?plaqueUrl(value.path!):plaqueArtworkUrl(value.path!)}} accessibilityLabel={`Targhetta ${name}`} contentFit="contain" contentPosition="center" style={{width:'100%',height:'100%'}} onLoad={({source})=>{if(source.width>0&&source.height>0)setImageRatio({path:value.path!,ratio:source.width/source.height});}} onError={()=>{if(originalPath!==value.path)setOriginalPath(value.path);else setFailedPath(value.path);}} cachePolicy="memory-disk"/>
  </View>
  {powered?<Text style={{color:p.muted,fontSize:compact?8:10,lineHeight:compact?11:14,letterSpacing:.35}}>Powered by Salon Pro</Text>:null}
 </View>;
}
export function OwnerBrandMark({compact=false}:{compact?:boolean}){
 const {salonWorkspace}=useAppContext();const {width}=useWindowDimensions();
 if(Platform.OS==='web'&&compact)return <View style={{width:Math.max(80,Math.min(198,width-100)),maxWidth:'65%',alignSelf:'flex-start',flexShrink:1}}><SalonBrandMark workspaceId={salonWorkspace.id} name={salonWorkspace.salonName} surface="owner" compact align="start" size={{width:Math.max(80,Math.min(198,width-100)),height:70}}><AccessWordmark compact/></SalonBrandMark></View>;
 return <SalonBrandMark workspaceId={salonWorkspace.id} name={salonWorkspace.salonName} surface="owner" compact={compact}><AccessWordmark compact={compact}/></SalonBrandMark>;
}
