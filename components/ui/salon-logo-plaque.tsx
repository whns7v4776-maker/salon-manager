import { useSalonBrandPlacement } from '../../src/lib/salon-brand-placements';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { salonNameFontOptions } from '../../src/lib/fonts';
import { plaqueUrl, type PlaqueFinish, useSalonPlaque } from '../../src/lib/salon-logo-plaque';

const imageRatios=new Map<string,number>();

export function LogoPlaquePreview({uri,finish='satin',name,onError,font='manrope',customer=false,source,compact=false,size,flush=false,horizontal=false}: {
  uri?:string;finish?:PlaqueFinish;name:string;onError?:()=>void;font?:string;customer?:boolean;source?:'upload'|'ai'|'unknown';compact?:boolean;size?:{width:number;height:number};flush?:boolean;horizontal?:boolean;
}) {
  const [box,setBox]=useState({width:0,height:0});
  const [loaded,setLoaded]=useState<{uri:string;ratio:number}|null>(null);
  const ratio=uri?(loaded?.uri===uri?loaded.ratio:imageRatios.get(uri)):undefined;
  // Compact marks need more vertical room than a wide wordmark, never a cover crop.
  const baseHeight=compact?52:customer?82:72;
  const imageHeight=ratio?Math.min(compact?64:112,Math.max(baseHeight,(compact?140:240)/ratio+14)):baseHeight;
  return <View onLayout={e=>{const {width,height}=e.nativeEvent.layout;setBox(old=>old.width===width&&old.height===height?old:{width,height});}} style={[styles.plaque,customer&&!!uri&&styles.customer,!!uri&&{height:imageHeight},styles[finish],compact&&{width:154,height:64,paddingHorizontal:4,paddingVertical:4},size,horizontal&&{width:'100%',height:undefined,aspectRatio:4},flush&&{paddingHorizontal:0,paddingVertical:0,...(ratio&&size?{width:Math.min(size.width,size.height*ratio)}:{})}]}>
    {finish!=='none'&&<View pointerEvents="none" style={styles.highlight}/>}
    {uri?<Image source={{uri}} accessibilityLabel={`Logo ${name}`} contentFit="contain"
      transition={0} cachePolicy="memory-disk" style={[styles.image, source==='upload' && {borderRadius:14,alignSelf:'center',...(ratio&&box.width?{width:Math.min(box.width-(customer?20:28),(box.height-(customer?14:18))*ratio),height:Math.min(box.height-(customer?14:18),(box.width-(customer?20:28))/ratio)}:{})},flush&&{width:'100%',height:'100%',borderRadius:0}]} onError={onError}
      onLoad={({source})=>{
        if(source.width>0&&source.height>0){
          const next=source.width/source.height;
          imageRatios.set(uri,next);setLoaded({uri,ratio:next});
        }
      }}/>:<Text adjustsFontSizeToFit minimumFontScale={0.4} numberOfLines={2}
      style={{textAlign:'center',color:'#18365B',fontSize:26,fontFamily:salonNameFontOptions.find(f=>f.key===font)?.family}}>{name}</Text>}
  </View>;
}
export function SalonLogoPlaque({workspaceId,name,children,customer=false,compact=false,size,flush=false}: {
  workspaceId?:string;name:string;children:React.ReactNode;customer?:boolean;compact?:boolean;size?:{width:number;height:number};flush?:boolean;
}) {
  const {value:placement}=useSalonBrandPlacement(customer?workspaceId:undefined);
  const plaque=useSalonPlaque(workspaceId);
  const [failed,setFailed]=useState<string|null>(null);
  if(customer && placement) return <>{children}</>;
  if(plaque===undefined) return <View accessibilityLabel="Caricamento insegna" style={[styles.placeholder,customer&&styles.customer,compact&&{width:154,height:64},size]}/>;
  if(!plaque || (plaque.mode!=='text'&&failed===plaque.path)) return <>{children}</>;
  return <LogoPlaquePreview uri={plaque.mode==='text'?undefined:plaqueUrl(plaque.path)} font={plaque.font} finish={plaque.finish} name={name}
    customer={customer} compact={compact} size={size} flush={flush} source={plaque.source} onError={()=>setFailed(plaque.path)}/>;
}
const styles=StyleSheet.create({
  placeholder:{width:260,maxWidth:'100%',height:72,alignSelf:'center'},
  customer:{width:260,height:82,paddingHorizontal:10,paddingVertical:7},
  plaque:{width:260,maxWidth:'100%',height:72,borderRadius:18,borderWidth:1,
    paddingHorizontal:14,paddingVertical:9,overflow:'hidden',alignSelf:'center',justifyContent:'center',
    shadowColor:'#536174',shadowOpacity:0.1,shadowRadius:3,shadowOffset:{width:0,height:2}},
  satin:{backgroundColor:'#F6F3EC',borderColor:'#DFD7C9',borderTopColor:'#FFFFFF'},
  glass:{backgroundColor:'#EDF4FA',borderColor:'#D5E3EE',borderTopColor:'#FFFFFF'},
  metal:{backgroundColor:'#E9ECEF',borderColor:'#C4CBD2',borderTopColor:'#FFFFFF'},
  none:{backgroundColor:'transparent',borderWidth:0,borderRadius:0,shadowOpacity:0,shadowRadius:0,elevation:0},
  highlight:{position:'absolute',top:1,left:18,right:18,height:1,backgroundColor:'#FFFFFF'},
  image:{width:'100%',height:'100%',backgroundColor:'transparent'},
});
