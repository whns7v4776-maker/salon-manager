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
 const surface={borderWidth:1,borderColor:p.border,borderRadius:19,backgroundColor:p.night?'rgba(38,41,43,.9)':'rgba(255,253,250,.86)'};
 const gold=p.night?'#E2CFAA':'#7A5F38';
 const close=()=>{setRulesOpen(false);if(fromSettings){setFromSettings(false);router.navigate('/settings' as any);}};
 // Coming from Settings keeps its own popup/sheet; otherwise the "Regole" tab swaps the view in place.
 const rulesInline=rulesOpen&&!fromSettings;
 const tab=(label:string,icon:React.ComponentProps<typeof Ionicons>['name'],active:boolean,onPress:()=>void,meta?:string)=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:active}} onPress={onPress} style={{flex:wide?undefined:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,minHeight:40,paddingHorizontal:wide?18:10,borderRadius:16,backgroundColor:active?p.action:'transparent'}}>
  <Ionicons name={icon} size={15} color={active?p.actionText:p.ink}/>
  <Text numberOfLines={1} style={{fontSize:13,fontWeight:'600',color:active?p.actionText:p.ink}}>{label}</Text>
  {meta?<Text style={{fontSize:11,fontWeight:'600',color:active?p.actionText:gold,opacity:active?.75:1}}>{meta}</Text>:null}
 </Pressable>;
 return <View style={{gap:14}}>
  <View style={[surface,{flexDirection:'row',alignSelf:wide?'flex-start':'stretch',padding:4,borderRadius:21,gap:4}]}>
   {tab('Prenotazioni','calendar-outline',!rulesInline,()=>setRulesOpen(false))}
   {tab('Regole','options-outline',rulesInline,()=>setRulesOpen(true))}
  </View>
  {rulesInline?<View style={[surface,{padding:wide?18:12,gap:16}]}>{rules}</View>:
  <View style={{flexDirection:wide?'row':'column',gap:14,alignItems:'stretch'}}>
   {/* Wide web: both panes stretch to the same height. */}
   <View style={[surface,{width:wide?320:'100%',overflow:'visible',padding:6,alignSelf:'stretch',justifyContent:'center'}]}>{navigation}</View>
   <View style={[wide?surface:null,{flex:wide?1:undefined,minWidth:0,alignSelf:'stretch',padding:wide?16:0}]}>{renderContent()}</View>
  </View>}
  {Platform.OS==='web'&&rulesOpen&&fromSettings?<OwnerPremiumPopup title="Regole di prenotazione" icon="options-outline" onClose={close}>{rules}</OwnerPremiumPopup>:null}
  <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={rulesOpen&&fromSettings&&Platform.OS!=='web'} transparent animationType="fade" onRequestClose={close}>
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
