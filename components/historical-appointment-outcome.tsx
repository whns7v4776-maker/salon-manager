import React,{useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAccessAppearance} from './access-premium';
import {HapticTouchable} from './ui/haptic-touchable';
import {supabase} from '../src/lib/supabase';
import {OwnerAppointmentCheckout} from './owner-appointment-checkout';
/** Runs only after a canonical appointment ID has been confirmed by the server. */
export function HistoricalAppointmentOutcome({appointmentId,workspaceId,name,date,time,onComplete,onClose}:{appointmentId:string;workspaceId:string;name:string;date:string;time:string;onComplete:(id:string)=>Promise<{ok:boolean;error?:string}>;onClose:()=>void}){
 const {palette:p}=useAccessAppearance();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState(false);const lock=useRef(false);
 const refreshOutcome=async()=>{try{const {data,error}=await supabase.from('appointments').select('completed,cashed_in').eq('workspace_id',workspaceId).eq('id',appointmentId).maybeSingle();if(error||!data)throw error||new Error('Appuntamento non disponibile');setCompleted(data.completed===true);}catch{setError('Riapri la scheda per verificare l’esito e il saldo aggiornati.');}};
 const complete=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await onComplete(appointmentId);if(!result.ok)throw new Error(result.error||'Completamento non confermato.');setCompleted(true);}catch(e){setError(e instanceof Error?e.message:'Riprova il completamento. L’appuntamento è già salvato.');}finally{lock.current=false;setBusy(false);}};
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:18,gap:16}}>
  <View style={{gap:8}}><Text style={{fontSize:12,color:p.muted}}>Inserimento salvato · Esito e incasso</Text><Text style={{fontFamily:'Georgia',fontSize:25,lineHeight:32,color:p.ink}}>Aggiunto al passato</Text><Text style={{fontSize:15,lineHeight:22,fontWeight:'600',color:p.ink}}>{name}</Text><Text style={{fontSize:13,color:p.muted}}>{date.split('-').reverse().join('/')} · {time}</Text><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>Scegli come registrarlo. Il servizio è già in Agenda: se chiudi, rimane da completare e da incassare.</Text></View>
  {!completed?<HapticTouchable disabled={busy} accessibilityRole="button" onPress={()=>void complete()} style={{minHeight:50,padding:14,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'#304436':'#E2EBDD',flexDirection:'row',alignItems:'center',gap:12}}><Ionicons name="checkmark-circle-outline" size={21} color={p.ink}/><View style={{flex:1,gap:4}}><Text style={{fontSize:14,fontWeight:'600',color:p.ink}}>{busy?'Salvataggio…':'Segna completato'}</Text><Text style={{fontSize:12,color:p.muted}}>Servizio effettuato, pagamento ancora da registrare</Text></View></HapticTouchable>:<Text accessibilityLiveRegion="polite" style={{fontSize:14,color:p.ink}}>Servizio completato. L’incasso resta separato.</Text>}
  <OwnerAppointmentCheckout appointmentId={appointmentId} workspaceId={workspaceId} onCompleted={()=>void refreshOutcome()}/>
  <Text style={{fontSize:12,lineHeight:19,color:p.muted}}>Registra un incasso solo se il pagamento è stato ricevuto. La registrazione usa la data effettiva dell’operazione in Cassa.</Text>
  {error?<Text accessibilityRole="alert" style={{fontSize:13,lineHeight:20,color:p.night?'#DCABB0':'#98525C'}}>{error}</Text>:null}
  <HapticTouchable disabled={busy} accessibilityRole="button" onPress={onClose} style={{minHeight:46,padding:13,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center'}}><Text style={{fontSize:14,color:p.ink}}>{completed?'Chiudi':'Mantieni da completare'}</Text></HapticTouchable>
 </ScrollView>;
}
