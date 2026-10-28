import React from 'react';
import {Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import type {NumberPickerModal} from './ui/number-picker-modal';
import {DockedSheetSurface} from './ui/docked-sheet-surface';
import {useAccessAppearance} from './access-premium';
import {TABLET_MODAL_ORIENTATIONS} from '../src/lib/tablet-modal-orientations';

type Props=React.ComponentProps<typeof NumberPickerModal>;
export function AgendaPremiumDayCountPicker(props:Props){
 return props.visible?<VisibleDayCountPicker {...props}/>:null;
}
function VisibleDayCountPicker({visible,embedded,title,contextLabel,initialValue=1,max=7,onClose,onConfirm,onDismiss}:Props){
 const {palette:p}=useAccessAppearance(),{height}=useWindowDimensions();
 const [draftValue,setDraft]=React.useState(()=>Math.min(max,Math.max(1,initialValue)));
 const draft=Math.min(max,Math.max(1,draftValue));
 const web=Platform.OS==='web';
 const button=(label:string,press:()=>void,primary=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} style={({pressed})=>({minHeight:44,paddingHorizontal:20,paddingVertical:12,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:primary?p.action:p.field,opacity:pressed?.72:1})}><Text style={{fontSize:14,color:primary?p.actionText:p.ink,fontWeight:'500'}}>{label}</Text></Pressable>;
 const content=<View style={{flex:1,justifyContent:web?'center':'flex-end',alignItems:'center',backgroundColor:p.night?'rgba(0,0,0,.48)':'rgba(40,36,30,.28)',paddingHorizontal:web?20:0,paddingVertical:web?20:0,...(web?{backdropFilter:'blur(10px)'} as any:{})}}>
  <DockedSheetSurface style={{width:'100%',maxWidth:420,maxHeight:height-32,borderRadius:22,padding:20,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'#202426':'#F8F5EF'}} onClose={onClose}>
   <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:16}} keyboardShouldPersistTaps="handled">
    {web ? <Text accessibilityRole="header" style={{fontSize:23,fontFamily:Platform.OS==='android'?'serif':'Georgia',color:p.ink}}>{title}</Text> : <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text accessibilityRole="header" style={{flex:1,fontSize:23,fontFamily:Platform.OS==='android'?'serif':'Georgia',color:p.ink}}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={onClose} style={{width:40,height:40,borderRadius:12,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,lineHeight:28,color:p.ink}}>×</Text></Pressable></View>}
    {contextLabel?<Text style={{fontSize:14,lineHeight:20,color:p.muted}}>{contextLabel}</Text>:null}
    <View accessibilityRole="radiogroup" accessibilityLabel="Numero di giorni affiancati" style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     {Array.from({length:max},(_,index)=>index+1).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={value===1?'1 giorno':`${value} giorni`} accessibilityState={{checked:draft===value}} aria-checked={draft===value} onPress={()=>setDraft(value)} style={({pressed})=>({minHeight:46,minWidth:78,paddingVertical:12,paddingHorizontal:15,borderRadius:12,borderWidth:1,borderColor:draft===value?p.action:p.border,backgroundColor:draft===value?p.action:p.field,opacity:pressed?.75:1})}><Text style={{fontSize:14,color:draft===value?p.actionText:p.ink,textAlign:'center',fontWeight:draft===value?'600':'400'}}>{value} {value===1?'giorno':'giorni'}</Text></Pressable>)}
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:10,paddingTop:4}}>{button('Annulla',onClose)}{button('Fine',()=>onConfirm(String(draft)),true)}</View>
   </ScrollView>
  </DockedSheetSurface>
 </View>;
 if(embedded)return <View style={[StyleSheet.absoluteFillObject,{zIndex:100,elevation:100}]}>{content}</View>;
 return <Modal visible transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent supportedOrientations={TABLET_MODAL_ORIENTATIONS} onRequestClose={onClose} onDismiss={onDismiss}>{content}</Modal>;
}
