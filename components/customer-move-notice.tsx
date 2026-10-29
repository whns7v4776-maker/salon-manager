import { useAccessAppearance } from './access-premium';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';
import { subscribeCustomerMoveNotice, type CustomerMoveNotice } from '../src/lib/customer-move-notice';
export function CustomerMoveNoticeDialog(){
 const {palette:p}=useAccessAppearance();
 const [queue,setQueue]=useState<CustomerMoveNotice[]>([]);
 const [error,setError]=useState('');
 useEffect(()=>subscribeCustomerMoveNotice(notice=>setQueue(q=>[...q,notice])),[]);
 const notice=queue[0];
 const close=()=>{setQueue(q=>q.slice(1));setError('');};
 const open=async(url:string)=>{try{await Linking.openURL(url);}catch{setError('Non riesco ad aprire il canale. Contatta il cliente direttamente.');}};
 return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={!!notice} transparent animationType="fade" onRequestClose={close}>
  {notice&&<View style={[{flex:1,backgroundColor:p.night?'rgba(8,10,11,.46)':'rgba(40,36,30,.24)',justifyContent:'center',alignItems:'center',padding:16},Platform.OS==='web'?({backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)'} as object):null]}>
   <View style={{width:'100%',maxWidth:540,backgroundColor:p.night?'#202526':'#F8F5EF',borderRadius:24,padding:22,gap:14}}>
    <Text style={{fontSize:21,fontWeight:'700',color:p.ink}}>Appuntamento aggiornato · verifica l’avviso</Text>
    <Text style={{fontSize:16,fontWeight:'600',color:p.ink}}>{notice.name}</Text>
    <Text style={{fontSize:14,lineHeight:21,color:p.night?'#D4B78C':'#805F32'}}>{notice.reason} Non fare affidamento sulla push: avvisalo anche con un altro canale.</Text>
    <Text style={{fontSize:13,lineHeight:19,color:p.muted}}>Aprire un messaggio non conferma l’invio o la lettura. La modifica dell’appuntamento è già salvata.</Text>
    {!!notice.phone&&<TouchableOpacity style={{padding:14,borderRadius:12,backgroundColor:p.field}} onPress={()=>{const digits=notice.phone.replace(/\D/g,'');const international=digits.length===10?`39${digits}`:digits;void open(`https://wa.me/${international}?text=${encodeURIComponent(notice.message)}`);}}><Text style={{color:p.ink,fontWeight:'700'}}>Prepara messaggio WhatsApp</Text></TouchableOpacity>}
    {!!notice.email&&<TouchableOpacity style={{padding:14,borderRadius:12,backgroundColor:p.field}} onPress={()=>void open(`mailto:${encodeURIComponent(notice.email)}?subject=${encodeURIComponent('Aggiornamento appuntamento')}&body=${encodeURIComponent(notice.message)}`)}><Text style={{color:p.ink,fontWeight:'700'}}>Prepara email</Text></TouchableOpacity>}
    {!notice.phone&&!notice.email&&<Text style={{color:p.night?'#D4B78C':'#805F32'}}>Mancano telefono ed email: recupera un recapito dal cliente.</Text>}
    {!!error&&<Text style={{color:p.night?'#E8ABA6':'#A14440'}}>{error}</Text>}
    <TouchableOpacity style={{padding:14,borderRadius:12,backgroundColor:p.action,alignItems:'center'}} onPress={close}><Text style={{color:p.actionText,fontWeight:'700'}}>Chiudi</Text></TouchableOpacity>
   </View>
  </View>}
 </Modal>;
}
