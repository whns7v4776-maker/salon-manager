import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { OwnerPremiumPopup } from './owner-premium-sheet';
import React from 'react';
import {HapticTouchable as Pressable} from './ui/haptic-touchable';
import { Modal, Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { useAccessAppearance } from './access-premium';
import { CreationSheet } from './creation-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** Presentation shell. All booking controls and callbacks are supplied by Requests. */
export function RequestsPremiumWorkspace({navigation,renderContent,rules,autoAccept,guided}:{navigation:React.ReactNode;renderContent:()=>React.ReactNode;rules:React.ReactNode;autoAccept:boolean;guided:boolean}){
 const {palette:p}=useAccessAppearance();
 const {width}=useWindowDimensions();
 const [rulesOpen,setRulesOpen]=React.useState(false);
 const params=useLocalSearchParams<{settingsRulesToken?:string|string[]}>();
 const pathname=usePathname(),router=useRouter();
 const token=Array.isArray(params.settingsRulesToken)?params.settingsRulesToken[0]:params.settingsRulesToken;
 const handledToken=React.useRef<string|undefined>(undefined);
 const [fromSettings,setFromSettings]=React.useState(false);
 React.useEffect(()=>{
  if(!pathname.includes('prenotazioni')||!token||handledToken.current===token)return;
  handledToken.current=token;setFromSettings(true);setRulesOpen(true);
 },[token,pathname]);
 const wide=Platform.OS==='web'&&width>=1000;
 const surface={borderWidth:1,borderColor:p.border,borderRadius:18,backgroundColor:p.night?'rgba(35,39,40,.73)':'rgba(255,253,249,.65)'};
 const close=()=>{setRulesOpen(false);if(fromSettings){setFromSettings(false);router.navigate('/settings' as any);}};
 return <View style={{gap:14}}>
  <View style={[surface,{flexDirection:'row',flexWrap:'wrap',alignSelf:'flex-start',padding:4,borderRadius:22}]}>
   {['Prenotazioni','Regole di prenotazione'].map((label,i)=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:i===0&&!rulesOpen||i===1&&rulesOpen}} onPress={()=>setRulesOpen(i===1)} style={{paddingVertical:10,paddingHorizontal:18,borderRadius:18,backgroundColor:(i===0&&!rulesOpen||i===1&&rulesOpen)?p.action:'transparent'}}><Text style={{fontSize:12,fontWeight:'600',color:(i===0&&!rulesOpen||i===1&&rulesOpen)?p.actionText:p.ink}}>{label}</Text></Pressable>)}
  </View>
  <View style={{flexDirection:wide?'row':'column',gap:14,alignItems:'stretch'}}>
   <View style={[surface,{width:wide?310:'100%',overflow:'visible',padding:6,alignSelf:wide?'flex-start':'stretch'},wide?({position:'sticky',top:16} as any):null]}>{navigation}</View>
   <View style={[surface,{flex:wide?1:undefined,minWidth:0,minHeight:wide?340:120,padding:16}]}>{renderContent()}</View>
  </View>
  <View style={[surface,{padding:16,gap:14}]}>
   <Pressable {...({dataSet:{premiumHoverScope:"container"}} as any)} accessibilityRole="button" accessibilityLabel="Modifica regole di prenotazione" accessibilityState={{expanded:rulesOpen}} onPress={()=>setRulesOpen(true)} style={{flexDirection:'row',alignItems:'center',gap:12}}>
    <Ionicons name="options-outline" size={23} color={p.ink}/><Text style={{flex:1,fontSize:16,fontWeight:'500',color:p.ink}}>Regole di prenotazione</Text><View style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:p.field,borderWidth:1,borderColor:p.border}}><Ionicons name="create-outline" size={16} color={p.ink}/><Text style={{fontSize:12,color:p.ink}}>Modifica</Text></View>
   </Pressable>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[{label:'Accettazione automatica',active:autoAccept,status:autoAccept?'Attiva':'Disattiva'},{label:'Slot guidati',active:guided,status:guided?'Attivi':'Disattivi'}].map(item=><Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.status}. Apri impostazioni`} onPress={()=>setRulesOpen(true)} style={{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:13,paddingVertical:11,borderRadius:12,borderWidth:1,borderColor:item.active?(p.night?'#6A8770':'#A6BFA9'):p.border,backgroundColor:item.active?(p.night?'rgba(128,165,138,.16)':'rgba(213,232,216,.64)'):p.field}}><Text style={{fontSize:12,color:p.ink,fontWeight:'500'}}>{item.label}</Text><View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name={item.active?'checkmark-circle':'ellipse-outline'} size={16} color={item.active?(p.night?'#B9D7BF':'#40684A'):p.muted}/><Text style={{fontSize:11,fontWeight:'600',color:item.active?(p.night?'#B9D7BF':'#40684A'):p.muted}}>{item.status}</Text></View></Pressable>)}</View>
   {Platform.OS==='web'&&rulesOpen&&!fromSettings?<View style={{borderTopWidth:1,borderTopColor:p.line,paddingTop:16,gap:16}}>{rules}</View>:null}
  </View>
  {Platform.OS==='web'&&rulesOpen&&fromSettings?<OwnerPremiumPopup title="Regole di prenotazione" icon="options-outline" onClose={close}>{rules}</OwnerPremiumPopup>:null}
  <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={rulesOpen&&Platform.OS!=='web'} transparent animationType="fade" onRequestClose={close}>
   {Platform.OS==='web'?<View style={{flex:1,flexDirection:'row',justifyContent:'flex-end',backgroundColor:p.night?'rgba(0,0,0,.38)':'rgba(45,39,30,.22)',...({backdropFilter:'blur(8px)'} as any)}}>
    <Pressable accessibilityLabel="Chiudi regole di prenotazione" onPress={close} style={{flex:1}}/>
    <View style={{width:Math.min(480,width-24),height:'100%',backgroundColor:p.night?'#202425':'#F5F1EB',borderLeftWidth:1,borderColor:p.border}}>
     <View style={{padding:20,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:p.line}}><Text style={{flex:1,fontFamily:'Georgia',fontSize:23,color:p.ink}}>Regole di prenotazione</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi pannello regole" onPress={close} style={{padding:9}}><Ionicons name="close" size={21} color={p.ink}/></Pressable></View>
     <ScrollView contentContainerStyle={{padding:18,paddingBottom:30,gap:16}}>{rules}</ScrollView>
    </View>
   </View>:<GestureHandlerRootView style={{flex:1}}><CreationSheet premiumWeb premiumKind="customer" title="Regole di prenotazione" icon="options-outline" onClose={close} fillAvailableHeight={false}><View style={{gap:14,paddingBottom:20}}>{rules}</View></CreationSheet></GestureHandlerRootView>}
  </Modal>
 </View>;
}
