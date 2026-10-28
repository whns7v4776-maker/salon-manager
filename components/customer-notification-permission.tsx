import { useCustomerPremiumAppearance } from './owner-premium-customers-style';
import { Ionicons } from '@expo/vector-icons';
import { useCustomerConsent } from '../src/lib/customer-notification-consent';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { requestNotificationPermissionsOnly } from '../src/lib/push/push-notifications';
import { createCustomerNotificationConsentReporter, type CustomerNotificationPermission as CustomerNotificationPermissionStatus } from '../src/lib/customer-notification-consent-reporter';

export function CustomerNotificationPermission({ workspaceId, customerId, phone, name, detailsVisible = true, detailsRightInset = 0 }: {workspaceId:string;customerId:string;phone:string;name:string;detailsVisible?:boolean;detailsRightInset?:number}) {
 const premium=useCustomerPremiumAppearance();
 const consent=useCustomerConsent(workspaceId,customerId);
 const p=consent?.notification_permission;
 const date=consent?.notification_permission_checked_at;
 const text=p==='granted'?'Notifiche consentite':p==='denied'?'Notifiche negate':p==='undetermined'?'Notifiche da autorizzare':'Notifiche · Non verificato';
 const [linkError,setLinkError]=useState(false);
 const needsHelp=p!=='granted';
 const hasPhone=!!phone.replace(/\D/g,'');
 const message=`Ciao ${name.split(' ')[0] || ''}! Per ricevere gli aggiornamenti sui tuoi appuntamenti, attiva le notifiche di SalonPro:\n\n1. Apri l’app SalonPro e accedi al tuo salone.\n2. Apri Impostazioni e attiva Ricevi notifiche. Se compare la richiesta, scegli Consenti.\n3. Se le avevi negate, abilita anche il permesso del telefono:\n• iPhone: Impostazioni → Notifiche → SalonPro → Consenti notifiche (oppure Impostazioni → App → SalonPro → Notifiche).\n• Android: Impostazioni → App → SalonPro → Notifiche → attiva le notifiche. I nomi possono variare secondo il telefono.\n4. Torna nell’app SalonPro per aggiornare il consenso.\n\nGrazie! Se hai difficoltà, contattaci.`;
 const prepareInstructions=async()=>{setLinkError(false);const digits=phone.replace(/\D/g,'');const international=digits.length===10?`39${digits}`:digits;try{await Linking.openURL(`https://wa.me/${international}?text=${encodeURIComponent(message)}`);}catch{setLinkError(true);}};
 const color=premium?(p==='granted'?(premium.night?'#BAD3C1':'#42684A'):premium.muted):p==='granted'?'#198460':p?'#A26821':'#64748B';
 return <View style={{gap:3,paddingVertical:5}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingRight:needsHelp&&hasPhone?90:0}}><Text style={{fontSize:12,fontWeight:'600',color,flexShrink:1}}>{text}</Text>{needsHelp&&hasPhone&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Prepara istruzioni notifiche su WhatsApp" onPress={()=>void prepareInstructions()} style={{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,height:22,borderRadius:7,backgroundColor:premium?(premium.night?'rgba(143,171,150,.16)':'rgba(218,234,220,.5)'):'#E7F5ED',position:'absolute',right:0,top:-2}}><Ionicons name="logo-whatsapp" size={15} color={premium?(premium.night?'#BAD3C1':'#42684A'):'#187C50'}/><Text style={{fontSize:11,fontWeight:'600',color:premium?(premium.night?'#BAD3C1':'#42684A'):'#187C50'}}>Istruzioni</Text></TouchableOpacity>}</View>{linkError&&<Text style={{fontSize:11,color:'#B42336'}}>WhatsApp non disponibile. Contatta il cliente direttamente.</Text>}{date&&detailsVisible&&<Text style={{fontSize:10,color:premium?.muted??'#64748B',paddingRight:detailsRightInset}}>Ultima verifica: {new Date(date).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · consenso, non conferma di lettura</Text>}</View>;
}
export function ClientNotificationPermissionNotice({ salonCode, enabled, ensureInstanceId, onGranted, onPermission, refreshKey=0, identityKey='' }: {
 salonCode:string; enabled:boolean; ensureInstanceId:()=>Promise<string>;onGranted:()=>Promise<void>;
 onPermission?:(permission:CustomerNotificationPermissionStatus)=>void;refreshKey?:number;identityKey?:string;
}) {
 const salon=salonCode.trim();
 const platform=Platform.OS;
 const scope=enabled&&salon&&(platform==='ios'||platform==='android')?JSON.stringify([platform,salon,identityKey]):null;
 const latest=useRef({ensureInstanceId,onGranted,onPermission,scope});
 latest.current={ensureInstanceId,onGranted,onPermission,scope};
 const [status,setStatus]=useState<{scope:string;permission:CustomerNotificationPermissionStatus}|null>(null);
 const [action,setAction]=useState<{scope:string;busy:boolean;error:boolean}|null>(null);
 const current=useRef<{
  scope:string;live:boolean;busy:boolean;refresh:()=>Promise<boolean>;stop:()=>void;
 }|null>(null);
 useEffect(()=>{
  if(!scope)return;
  let reporter:ReturnType<typeof createCustomerNotificationConsentReporter>|null=null;
  let starting:Promise<boolean>|null=null;
  let grantAccepted=false;
  let grantInFlight=false;
  let grantEpoch=0;
  const session={scope,live:true,busy:false,refresh:async():Promise<boolean>=>false,stop:()=>{}};
  const isCurrent=()=>session.live&&latest.current.scope===scope;
  session.refresh=()=>{
   if(!isCurrent())return Promise.resolve(false);
   if(reporter)return reporter.refresh();
   if(starting)return starting;
   starting=(async()=>{
    try{
     const appInstanceId=(await latest.current.ensureInstanceId()).trim();
     if(!isCurrent()||!appInstanceId)return false;
     reporter=createCustomerNotificationConsentReporter({salonCode:salon,appInstanceId,platform:platform as 'ios'|'android',
      onPermission:permission=>{
       if(!isCurrent())return;
       setStatus({scope,permission});
       try{latest.current.onPermission?.(permission);}catch{/* A presentation callback cannot prevent consent persistence. */}
      },
      onConfirmed:permission=>{
       if(!isCurrent())return;
       if(permission!=='granted'){grantAccepted=false;grantEpoch+=1;return;}
       if(grantAccepted||grantInFlight)return;
       grantInFlight=true;
       const epoch=grantEpoch;
       void Promise.resolve().then(()=>{
        if(!isCurrent()||epoch!==grantEpoch)return false;
        return latest.current.onGranted().then(()=>true);
       }).then(accepted=>{
        if(accepted&&isCurrent()&&epoch===grantEpoch)grantAccepted=true;
       }).catch(()=>{/* Token registration is separate from the saved permission. Retry after the next confirmed refresh. */})
         .finally(()=>{grantInFlight=false;});
      },
     });
     return await reporter.refresh();
    }catch{return false;}
    finally{starting=null;}
   })();
   return starting;
  };
  session.stop=()=>{session.live=false;reporter?.stop();};
  current.current=session;
  void session.refresh();
  return()=>{session.stop();if(current.current===session)current.current=null;};
 },[scope,salon,platform]);
 const lastRefresh=useRef({scope,refreshKey});
 useEffect(()=>{
  const previous=lastRefresh.current;
  lastRefresh.current={scope,refreshKey};
  if(previous.scope===scope&&previous.refreshKey!==refreshKey)void current.current?.refresh();
 },[scope,refreshKey]);
 const permission=status?.scope===scope?status.permission:null;
 const busy=action?.scope===scope&&action.busy;
 const actionError=action?.scope===scope&&action.error;
 if(!scope||!permission||permission==='granted')return null;
 return <View style={{backgroundColor:'#FFF8EC',borderColor:'#F0DDBB',borderWidth:1,borderRadius:18,padding:16,gap:8,marginVertical:12}}>
  <Text style={{fontSize:16,fontWeight:'700',color:'#77511F'}}>Non perdere gli aggiornamenti del salone</Text>
  <Text style={{fontSize:13,lineHeight:19,color:'#775E3C'}}>Le notifiche non sono abilitate. Potresti non ricevere avvisi su spostamenti, conferme e ordini.</Text>
  {actionError&&<Text accessibilityRole="alert" style={{fontSize:12,color:'#A26821'}}>Non è stato possibile aprire le notifiche. Riprova.</Text>}
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Attiva notifiche" accessibilityState={{disabled:!!busy,busy:!!busy}} disabled={!!busy} style={{alignSelf:'flex-start',backgroundColor:'#FFF',borderRadius:10,paddingHorizontal:14,paddingVertical:10}} onPress={async()=>{
   const session=current.current;
   if(!session||session.scope!==scope||!session.live||session.busy)return;
   session.busy=true;setAction({scope,busy:true,error:false});
   const isCurrent=()=>session.live&&latest.current.scope===scope;
   try{
    if(permission==='denied')await Linking.openSettings();
    else{
     await requestNotificationPermissionsOnly();
     if(isCurrent())await session.refresh();
    }
   }catch{if(isCurrent())setAction({scope,busy:true,error:true});}
   finally{
    session.busy=false;
    if(isCurrent())setAction(previous=>({scope,busy:false,error:previous?.scope===scope&&previous.error===true}));
   }
  }}><Text style={{color:'#77511F',fontWeight:'700'}}>{busy?'Attendi…':'Attiva notifiche'}</Text></TouchableOpacity>
 </View>;
}
