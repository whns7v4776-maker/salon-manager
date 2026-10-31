import React, { useEffect, useRef, useState } from 'react';
import { Alert, NativeModules, Platform, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { NativeMedal } from './owner-premium-native-home';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';
import { CashStripePanel } from './cash-stripe-panel';
import { useAccessAppearance } from './access-premium';
import { useQuickCheckout } from '../src/lib/use-quick-checkout';

export function OwnerAppointmentCheckout({appointmentId,workspaceId,onCompleted,onCheckoutActiveChange}:{appointmentId:string;workspaceId:string;onCompleted:()=>void;onCheckoutActiveChange?:(active:boolean)=>void}) {
 const {palette:p}=useAccessAppearance();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [movement,setMovement]=useState<{id:string;importo:number}|null>(null),[digital,setDigital]=useState(false),[preferred,setPreferred]=useState<'checkout'|'terminal'>('checkout');
 const tapToPayAvailable=Platform.OS==='ios'&&Constants.expoConfig?.extra?.terminalBuildEnabled===true&&!!NativeModules.StripeTerminalReactNative;
 const {quick}=useQuickCheckout(workspaceId);
 useEffect(()=>{onCheckoutActiveChange?.(digital&&!!movement);return()=>onCheckoutActiveChange?.(false);},[digital,movement?.id,onCheckoutActiveChange]);
 const lock=useRef(false);
 const run=async(job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await job();}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}};
 const collect=(method:string)=>void run(async()=>{
  const {data,error:e}=await supabase.rpc('prepare_owner_appointment_checkout_v1',{p_appointment:appointmentId,p_workspace:workspaceId});
  if(e)throw new Error(e.message);
  const result=await supabase.rpc('collect_owner_appointment_checkout_v1',{p_movement:data.id,p_workspace:workspaceId,p_method:method});
  if(result.error)throw new Error(result.error.message);
  // Refresh the authoritative appointment outcome without marking a partially paid group completed.
  onCompleted();
 });
 const confirm=(method:string,label:string)=>{
  const message=`Confermi di aver ricevuto il pagamento ${label.toLowerCase()}? Il servizio viene completato quando il saldo è interamente pagato.`;
  if(Platform.OS==='web'){if(window.confirm(message))collect(method);}else Alert.alert('Incassa e completa',message,[{text:'Annulla',style:'cancel'},{text:'Conferma pagamento',onPress:()=>collect(method)}]);
 };
 const startDigital=(next:'checkout'|'terminal')=>void run(async()=>{
  const {data,error:e}=await supabase.rpc('prepare_owner_appointment_checkout_v1',{p_appointment:appointmentId,p_workspace:workspaceId});
  if(e)throw new Error(e.message);
  if(data.digitalAvailable===false)throw new Error(Number(data.groupServices)>1?`Questa prenotazione ha ${data.groupServices} servizi da saldare insieme: usa Contanti, POS esterno o Bonifico per incassarli tutti con un solo pagamento.`:'Acconto e saldo sono separati: gestiscili nella Cassa oppure registra qui il saldo ricevuto con Contanti, POS esterno o Bonifico.');
  setPreferred(next);setMovement(data);setDigital(true);
 });
 const night=p.night;
 const tile=(key:string,icon:React.ComponentProps<typeof Ionicons>['name'],accent:[string,string],label:string,onPress:()=>void,primary=false,symbol?:'wave.3.right.circle')=>(
  <HapticTouchable key={key} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress}
   style={{flexGrow:1,flexBasis:primary?'100%':'46%',minWidth:0,minHeight:primary?64:58,flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,paddingHorizontal:12,borderRadius:14,borderWidth:1,
    borderColor:primary?(night?'#9C8461':'#7A6446'):(night?p.border:'rgba(122,100,70,.24)'),
    backgroundColor:primary?(night?'rgba(156,132,97,.16)':'rgba(122,100,70,.09)'):(night?'rgba(255,255,255,.04)':'#FFFFFF'),opacity:busy?.6:1}}>
   <NativeMedal icon={icon} symbol={symbol} size={34} iconSize={15} accent={accent[night?0:1]}/>
   <Text numberOfLines={2} style={{flex:1,minWidth:0,fontSize:14,lineHeight:18,fontWeight:'600',color:p.ink}}>{label}</Text>
  </HapticTouchable>
 );
 // The fastest method for this salon leads as a full-width quick button: Tap to Pay when the
 // reader is ready, else QR / link when Stripe is ready, else cash. Until the check answers,
 // the device decides (Tap to Pay if supported, else QR) so the sheet never waits.
 const fastest=quick??(tapToPayAvailable?'terminal':'checkout');
 const all:{key:string;icon:React.ComponentProps<typeof Ionicons>['name'];accent:[string,string];label:string;run:()=>void;symbol?:'wave.3.right.circle';show:boolean}[]=[
  {key:'terminal',icon:'phone-portrait-outline',accent:['#9DBAD6','#4D6E8F'],label:'Tap to Pay su iPhone',run:()=>startDigital('terminal'),symbol:'wave.3.right.circle',show:tapToPayAvailable&&(quick===null||quick==='terminal')},
  {key:'checkout',icon:'qr-code-outline',accent:['#A9ABD9','#5B5E9A'],label:'QR / link',run:()=>startDigital('checkout'),show:quick!=='cash'},
  {key:'cash',icon:'cash-outline',accent:['#86C2BE','#3E7C7A'],label:'Contanti',run:()=>confirm('cash','Contanti'),show:true},
  {key:'card',icon:'card-outline',accent:['#BFA6D4','#7A5C8E'],label:'POS esterno',run:()=>confirm('card','POS esterno'),show:true},
  {key:'bank',icon:'business-outline',accent:['#C9AA8C','#7E6247'],label:'Bonifico',run:()=>confirm('bank_transfer','Bonifico'),show:true},
 ];
 const methods=[...all.filter(m=>m.show&&m.key===fastest),...all.filter(m=>m.show&&m.key!==fastest)];
 // One-tap checkout: every way to get paid is visible at once. Tap to Pay opens the reader,
 // QR / link creates the code, cash/POS/transfer ask a single confirmation.
 return <View style={{gap:10}}>
  {!(digital&&movement)?<View style={{padding:14,gap:12,borderRadius:18,borderWidth:1,borderColor:night?p.border:'rgba(122,100,70,.2)',backgroundColor:night?'rgba(38,41,43,.92)':'rgba(250,247,241,.96)'}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <NativeMedal icon="wallet-outline" size={38} iconSize={17} accent={night?'#D6B27A':'#8C6A35'}/>
    <View style={{flex:1,minWidth:0}}><Text style={{fontSize:16,fontWeight:'600',color:p.ink}}>{busy?'Preparazione…':'Incassa e completa'}</Text><Text style={{fontSize:12,lineHeight:17,color:p.muted}}>Tocca come paga il cliente.</Text></View>
   </View>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
    {methods.map(m=>tile(m.key,m.icon,m.accent,m.label,m.run,m.key===fastest,m.symbol))}
   </View>
  </View>:null}
  {error?<Text accessibilityRole="alert" style={{color:night?'#F0B5BA':'#963F4A',fontSize:13}}>{error}</Text>:null}
  {digital&&movement?<CashStripePanel modalOnly inlineCheckout preferredMethod={preferred} autoStart movement={movement} onClose={()=>{setDigital(false);setMovement(null);onCompleted();}}/>:null}
 </View>;
}
