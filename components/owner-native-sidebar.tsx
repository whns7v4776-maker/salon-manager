import React from 'react';
import {Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {BlurView} from 'expo-blur';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAccessAppearance} from './access-premium';
import {OwnerBrandMark} from './salon-brand-mark';
import {ShopEntry} from './shop/shop-entry';
import {useAppContext} from '../src/context/AppContext';
import {SALON_MODULES, type SalonModuleKey} from '../src/lib/salon-modules';
import {useOwnerViewport} from '../src/context/OwnerViewportContext';

export type NativeSidebarItem={key:SalonModuleKey;label:string;selected:boolean;badge:number;onPress:()=>void};
const groups:{title:string;keys:SalonModuleKey[]}[]=[
  {title:'OPERATIVITÀ',keys:['index','agenda','prenotazioni']},
  {title:'PERSONE',keys:['clienti']},
  {title:'GESTIONE',keys:['servizi','cassa','settings']},
];

/** Uses the existing tab callbacks; resizing never replaces the navigator. */
export function OwnerNativeSidebar({items}:{items:NativeSidebarItem[]}) {
  const {palette:p,mode,setMode}=useAccessAppearance();
  const {salonWorkspace}=useAppContext();
  const viewport=useOwnerViewport();
  const insets=useSafeAreaInsets();
  const fill=p.night?'rgba(216,194,155,.22)':'rgba(52,55,53,.86)';
  const ink=p.night?'#E9D9BB':'#FFFFFF';
  return <ShopEntry workspaceId={salonWorkspace.id} premiumNative followOrderLinks={false} attentionActive={!!viewport?.sidebar} renderTrigger={(openShop,shopAttention)=><View testID="owner-native-sidebar" accessibilityLabel="Menu principale" style={{display:viewport?.sidebar?'flex':'none',position:'absolute',left:0,top:0,bottom:0,width:viewport?.railWidth??224,paddingLeft:14+insets.left,paddingRight:14,paddingTop:Math.max(12,insets.top),paddingBottom:Math.max(12,insets.bottom),borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:p.border,backgroundColor:p.night?'rgba(28,31,32,.92)':'rgba(248,245,240,.88)'}}>
    {Platform.OS==='ios'?<BlurView pointerEvents="none" intensity={30} tint={p.night?'dark':'light'} style={StyleSheet.absoluteFill}/>:null}
    <View style={{minHeight:88,justifyContent:'center',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:p.line,marginBottom:14}}><OwnerBrandMark compact/></View>
    <ScrollView style={{flex:1}} contentContainerStyle={{gap:17,paddingBottom:12}} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
      {groups.map(group=><View key={group.title} style={{gap:5}}>
        <Text style={{color:p.muted,fontSize:10,fontWeight:'600',letterSpacing:1.5,paddingHorizontal:12,marginBottom:4}}>{group.title}</Text>
        {group.keys.map(key=>{const item=items.find(candidate=>candidate.key===key);if(!item)return null;
          return <Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:item.selected}} accessibilityLabel={`${item.label}${item.badge>0?`, ${item.badge} da leggere`:''}`} onPress={item.onPress} style={({pressed})=>({minHeight:46,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:12,borderRadius:14,borderWidth:1,borderColor:item.selected?p.border:'transparent',backgroundColor:item.selected?fill:'transparent',opacity:pressed?.7:1})}>
            <Ionicons name={SALON_MODULES[key].icon.inactive} size={21} color={item.selected?ink:p.muted} style={{flexShrink:0}}/>
            <Text style={{flex:1,minWidth:0,color:item.selected?ink:p.ink,fontSize:14,fontWeight:item.selected?'600':'400'}}>{item.label}</Text>
            {item.badge>0?<View style={{minWidth:23,borderRadius:8,paddingHorizontal:5,paddingVertical:3,backgroundColor:'#CC3545'}}><Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'700',textAlign:'center',fontVariant:['tabular-nums']}}>{item.badge}</Text></View>:null}
          </Pressable>;
        })}
        {group.title==='GESTIONE'?<Pressable accessibilityRole="button" accessibilityLabel="Apri Shop e magazzino" onPress={openShop} style={{minHeight:46,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:12}}><Ionicons name="bag-handle-outline" size={21} color={p.muted}/><Text style={{flex:1,minWidth:0,color:p.ink,fontSize:14}}>Shop e magazzino</Text>{shopAttention?<View style={{width:6,height:6,borderRadius:3,backgroundColor:'#CC3545'}}/>:null}</Pressable>:null}
      </View>)}
    </ScrollView>
    <View style={{gap:6,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:p.line,paddingTop:10}}>
      <Text style={{color:p.muted,fontSize:10,letterSpacing:1.5}}>ASPETTO</Text>
      <View style={{flexDirection:'row',gap:3}}>{([['day','Chiaro'],['night','Scuro'],['system','Auto']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:mode===value}} accessibilityLabel={`Aspetto ${value==='system'?'automatico':label.toLowerCase()}`} onPress={()=>setMode(value)} style={{flex:1,minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:3,paddingVertical:10,borderRadius:10,backgroundColor:mode===value?fill:'transparent'}}><Text style={{color:mode===value?ink:p.ink,fontSize:12,textAlign:'center'}}>{label}</Text></Pressable>)}</View>
    </View>
  </View>}/>;
}
