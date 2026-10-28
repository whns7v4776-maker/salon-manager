import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';
import { CashStripePanel } from './cash-stripe-panel';
import { useAccessAppearance } from './access-premium';

export function OwnerAppointmentCheckout({appointmentId,workspaceId,onCompleted,onCheckoutActiveChange}:{appointmentId:string;workspaceId:string;onCompleted:()=>void;onCheckoutActiveChange?:(active:boolean)=>void}) {
 const {palette:p}=useAccessAppearance();
 const checkoutInk=p.actionText;
 const checkoutWash=p.action;
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [movement,setMovement]=useState<{id:string;importo:number}|null>(null),[digital,setDigital]=useState(false);
 useEffect(()=>{onCheckoutActiveChange?.(digital&&!!movement);return()=>onCheckoutActiveChange?.(false);},[digital,movement?.id,onCheckoutActiveChange]);
 const lock=useRef(false);
 const run=async(job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await job();}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}};
 const collect=(method:string)=>void run(async()=>{
  const {data,error:e}=await supabase.rpc('prepare_owner_appointment_checkout_v1',{p_appointment:appointmentId,p_workspace:workspaceId});
  if(e)throw new Error(e.message);
  const result=await supabase.rpc('collect_owner_appointment_checkout_v1',{p_movement:data.id,p_workspace:workspaceId,p_method:method});
  if(result.error)throw new Error(result.error.message);
  setOpen(false);
  // Refresh the authoritative appointment outcome without marking a partially paid group completed.
  onCompleted();
 });
 const confirm=(method:string,label:string)=>{
  const message=`Confermi di aver ricevuto il pagamento ${label.toLowerCase()}? Il servizio viene completato quando il saldo è interamente pagato.`;
  if(Platform.OS==='web'){if(window.confirm(message))collect(method);}else Alert.alert('Incassa e completa',message,[{text:'Annulla',style:'cancel'},{text:'Conferma pagamento',onPress:()=>collect(method)}]);
 };
 return <View style={{gap:10}}>
  <HapticTouchable accessibilityRole="button" disabled={busy} onPress={()=>setOpen(v=>!v)} style={{padding:12,minHeight:48,borderRadius:14,backgroundColor:checkoutWash,borderWidth:1,borderColor:p.action,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8}}><Ionicons name="wallet-outline" size={19} color={checkoutInk}/><Text style={{color:checkoutInk,fontWeight:'600',fontSize:13,lineHeight:19}}>{busy?'Salvataggio…':'Incassa e completa'}</Text></HapticTouchable>
  {open?<View style={{padding:14,borderRadius:16,backgroundColor:p.field,borderWidth:1,borderColor:p.line,gap:9}}><Text style={{fontSize:13,color:p.muted}}>Seleziona il pagamento già ricevuto.</Text>{[['cash','Contanti'],['card','POS esterno'],['bank_transfer','Bonifico']].map(([method,label])=><HapticTouchable key={method} accessibilityRole="button" disabled={busy} onPress={()=>confirm(method,label)} style={{padding:12,backgroundColor:p.field,borderWidth:1,borderColor:p.border,borderRadius:12}}><Text style={{fontSize:14,fontWeight:'600',color:p.ink}}>{label}</Text></HapticTouchable>)}{<HapticTouchable disabled={busy} onPress={()=>void run(async()=>{const {data,error:e}=await supabase.rpc('prepare_owner_appointment_checkout_v1',{p_appointment:appointmentId,p_workspace:workspaceId});if(e)throw new Error(e.message);if(data.digitalAvailable===false)throw new Error('Acconto e saldo sono separati: gestiscili nella Cassa oppure registra qui il saldo ricevuto con Contanti, POS esterno o Bonifico.');setMovement(data);setDigital(true);})} style={{padding:12,backgroundColor:p.field,borderWidth:1,borderColor:p.border,borderRadius:12}}><Text style={{fontSize:14,fontWeight:'600',color:p.ink}}>QR, link o Tap to Pay</Text></HapticTouchable>}</View>:null}
  {error?<Text accessibilityRole="alert" style={{color:'#B42332',fontSize:13}}>{error}</Text>:null}
  {digital&&movement?<CashStripePanel modalOnly inlineCheckout movement={movement} onClose={()=>{setDigital(false);setMovement(null);onCompleted();}}/>:null}
 </View>;
}
