import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import React, {useRef,useState} from 'react';
import {Modal,Platform,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAccessAppearance} from './access-premium';
import {nativeSerif} from './owner-native-premium';
import {HapticTouchable} from './ui/haptic-touchable';
import {NativeDraggableSheet,NativeSheetHandle} from './ui/native-sheet-drag';

type Item={id:string;cliente:string;servizio:string;data?:string;ora:string;appointmentGroupId?:string};
export function OwnerCompletionReview({items,visible=true,onClose,onComplete,onDetails}:{items:Item[];visible?:boolean;onClose:()=>void;onComplete:(id:string)=>Promise<{ok:boolean;error?:string}>;onDetails:(id:string)=>void}) {
 const {height,width}=useWindowDimensions();
 const {palette:p}=useAccessAppearance();
 const insets=useSafeAreaInsets();
 const web=Platform.OS==='web',compact=width<520,padding=compact?18:24;
 const accent=p.night?'#A9CDB6':'#426C52';
 const wash=p.night?'rgba(112,160,128,.14)':'rgba(224,237,226,.7)';
 const panel=p.night?'rgba(29,33,34,.98)':'rgba(250,247,241,.98)';
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 const valid=selected.filter(id=>items.some(item=>item.id===id));
 const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const complete=async()=>{
  if(lock.current||!valid.length)return;
  lock.current=true;setBusy(true);setMessage('');
  let saved=0;const failed:string[]=[];let error='';
  try{
   for(const id of valid){try{const result=await onComplete(id);if(result.ok)saved++;else{failed.push(id);error=result.error||'Salvataggio non verificato.';}}catch{failed.push(id);error='Connessione interrotta. Riprova i servizi rimasti.';}}
   setSelected(failed);setMessage(`${saved} ${saved===1?'servizio completato':'servizi completati'}.${failed.length?` ${failed.length} da riprovare: ${error}`:''}`);
  }finally{lock.current=false;setBusy(false);}
 };
 const close=()=>{if(!lock.current)onClose();};
 return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={visible} transparent animationType="fade" onRequestClose={close}>
  <View style={{flex:1,backgroundColor:p.night?'rgba(0,0,0,.48)':'rgba(46,42,35,.27)',justifyContent:web?'center':'flex-end',alignItems:'center',padding:web?(compact?12:24):0,...(web?{backdropFilter:'blur(10px)'} as any:{})}}>
   <NativeDraggableSheet testID="agenda-completion-review" onClose={close} dismissDisabled={busy} style={{width:'100%',maxWidth:640,maxHeight:Math.max(240,height-(web?48:insets.top+16)),backgroundColor:panel,borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:p.border,...(web?{boxShadow:'0 22px 80px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.16)'} as any:{})}}>
    {!web?<NativeSheetHandle style={{width:32,height:3,borderRadius:3,backgroundColor:p.muted,alignSelf:'center',marginTop:9}}/>:null}
    <View style={{padding,paddingBottom:18,borderBottomWidth:1,borderBottomColor:p.line}}>
     <View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}>
      <View style={{width:40,height:40,borderRadius:13,backgroundColor:wash,alignItems:'center',justifyContent:'center'}}><Ionicons name="checkmark-done-outline" size={23} color={accent}/></View>
      <View style={{flex:1,minWidth:0,gap:5}}>
       <Text style={{fontSize:10,lineHeight:14,letterSpacing:1.3,fontWeight:'500',color:accent}}>AGENDA · COMPLETAMENTO</Text>
       <Text accessibilityRole="header" style={{fontSize:compact?24:27,lineHeight:compact?29:33,fontFamily:nativeSerif,color:p.ink}}>Servizi da verificare</Text>
      </View>
      <HapticTouchable accessibilityRole="button" accessibilityLabel="Chiudi verifica" disabled={busy} onPress={close} style={{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={21} color={p.ink}/></HapticTouchable>
     </View>
     <Text style={{marginTop:12,fontSize:13,lineHeight:19,color:p.muted}}>Seleziona i servizi effettuati. Il completamento aggiorna punti e pacchetti; gli incassi restano separati.</Text>
    </View>
    <View style={{paddingHorizontal:padding,paddingVertical:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
     <Text accessibilityLiveRegion="polite" style={{color:p.muted,fontSize:12,flexShrink:1}}>{items.length} da verificare{valid.length?` · ${valid.length} selezionati`:''}</Text>
     <HapticTouchable accessibilityRole="button" disabled={busy||!items.length} onPress={()=>setSelected(valid.length===items.length?[]:items.map(x=>x.id))} style={{minHeight:36,justifyContent:'center',paddingHorizontal:4}}><Text style={{fontSize:12,fontWeight:'600',color:accent}}>{valid.length===items.length?'Deseleziona tutti':'Seleziona tutti'}</Text></HapticTouchable>
    </View>
    <ScrollView style={{flexShrink:1,minHeight:0}} contentContainerStyle={{paddingHorizontal:padding,paddingBottom:16,gap:8}}>
     {items.map(item=>{
      const checked=valid.includes(item.id);
      return <View key={item.id} style={{borderRadius:15,borderWidth:1,borderColor:checked?accent:p.line,backgroundColor:checked?wash:p.field,padding:14,flexDirection:compact?'column':'row',alignItems:compact?'stretch':'center',gap:10}}>
       <HapticTouchable accessibilityRole="checkbox" aria-checked={checked} accessibilityState={{checked,disabled:busy}} accessibilityLabel={`${item.cliente}, ${item.servizio}, ${item.data}, ${item.ora}`} disabled={busy} onPress={()=>toggle(item.id)} style={{flex:compact?undefined:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:11,minHeight:48}}>
        <Ionicons name={checked?'checkbox':'square-outline'} size={24} color={checked?accent:p.muted}/>
        <View style={{flex:1,minWidth:0,gap:4}}><Text style={{fontSize:15,lineHeight:20,fontWeight:'600',color:p.ink}}>{item.cliente}</Text><Text style={{fontSize:13,lineHeight:18,color:p.ink}}>{item.servizio}{item.appointmentGroupId?' · Servizio composto':''}</Text><Text style={{fontSize:11,lineHeight:16,color:p.muted}}>{item.data?.split('-').reverse().join('/')} · {item.ora}</Text></View>
       </HapticTouchable>
       <HapticTouchable accessibilityRole="button" accessibilityLabel={`Dettagli e incasso di ${item.cliente}`} disabled={busy} onPress={()=>onDetails(item.id)} style={{alignSelf:compact?'flex-end':'center',paddingHorizontal:11,paddingVertical:10,minHeight:38,borderRadius:11,backgroundColor:p.field,borderWidth:1,borderColor:p.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5}}><Text style={{fontSize:12,fontWeight:'500',color:p.ink}}>Dettagli / Incassa</Text><Ionicons name="chevron-forward" size={14} color={p.ink}/></HapticTouchable>
      </View>;
     })}
     {!items.length?<Text style={{paddingVertical:22,textAlign:'center',color:accent,fontWeight:'500'}}>Tutti i servizi sono stati verificati.</Text>:null}
    </ScrollView>
    <View style={{padding,paddingTop:15,paddingBottom:web?padding:Math.max(18,insets.bottom+12),borderTopWidth:1,borderColor:p.line,gap:12}}>
     <View style={{flexDirection:'row',alignItems:'flex-start',gap:7}}><Ionicons name="shield-checkmark-outline" size={15} color={p.muted}/><Text style={{flex:1,fontSize:11,lineHeight:16,color:p.muted}}>Per gestire il pagamento apri Dettagli / Incassa.</Text></View>
     {message?<Text accessibilityRole="alert" style={{color:p.ink,fontSize:13,lineHeight:19}}>{message}</Text>:null}
     <HapticTouchable accessibilityRole="button" disabled={busy||!valid.length} accessibilityState={{disabled:busy||!valid.length,busy}} onPress={()=>void complete()} style={{backgroundColor:busy||!valid.length?p.field:p.action,borderWidth:1,borderColor:busy||!valid.length?p.line:p.action,padding:14,minHeight:48,borderRadius:13,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:14,lineHeight:20,textAlign:'center',fontWeight:'600',color:busy||!valid.length?p.muted:p.actionText}}>{busy?'Completamento in corso…':`Segna selezionati come completati${valid.length?` · ${valid.length}`:''}`}</Text></HapticTouchable>
    </View>
   </NativeDraggableSheet>
  </View>
 </Modal>;
}
