import {InfoButton} from './ui/info-button';
import { popupGlass } from './premium-web-surfaces';
import React,{useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useAccessAppearance} from './access-premium';
import {ServicesEditorStyle} from './services-web-editor';

export function AgendaColorInfo(){
 const {palette:p}=useAccessAppearance();const {height}=useWindowDimensions();const [open,setOpen]=useState(false);
 return <>
  <InfoButton accessibilityRole="button" accessibilityLabel="Informazioni sui colori agenda" aria-expanded={open} onPress={()=>setOpen(true)} style={{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center'}} />
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <View style={{flex:1,padding:24,alignItems:'center',justifyContent:'center',backgroundColor:p.night?'rgba(0,0,0,.45)':'rgba(40,35,29,.26)',backdropFilter:'blur(8px)'} as any}>
    <View {...{dataSet:{servicesEditor:'true'}}} accessibilityViewIsModal style={{width:'100%',maxWidth:520,maxHeight:Math.max(120,height-48),borderRadius:24,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'#22211F':'#DED7CD',...popupGlass(p),overflow:'hidden'}}>
     <ServicesEditorStyle/>
     <Text accessibilityRole="header" style={{fontFamily:'Georgia',fontSize:25,lineHeight:32,color:p.ink,padding:24,paddingBottom:16}}>A cosa servono i colori</Text>
     <ScrollView style={{flexShrink:1}} contentContainerStyle={{paddingHorizontal:24,paddingBottom:24,gap:18}}>
      <Text style={{fontSize:15,lineHeight:23,color:p.ink}}>I colori aiutano a riconoscere a colpo d’occhio mestieri e servizi nell’Agenda. I trattini colorati nel listino richiamano gli stessi riferimenti.</Text>
      <View style={{gap:6}}><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>Automatici di base</Text><Text style={{fontSize:14,lineHeight:22,color:p.muted}}>Il sistema assegna e coordina i colori dei mestieri e dei servizi. Non devi configurarli per usare l’Agenda.</Text></View>
      <View style={{gap:6}}><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>Personalizzazione facoltativa</Text><Text style={{fontSize:14,lineHeight:22,color:p.muted}}>Nella stessa schermata scegli a chi assegnare il colore, seleziona una tonalità e premi «Applica a…». Il pulsante indica il destinatario esatto. La selezione da sola non modifica i colori. Cambia solo il riferimento visivo: nomi, prezzi, durate e regole di prenotazione restano invariati.</Text></View>
      <Text style={{fontSize:14,lineHeight:22,color:p.muted}}>I colori affiancano sempre le informazioni scritte: non serve riconoscere un colore per capire quale servizio è prenotato.</Text>
     </ScrollView>
     <View style={{padding:16,paddingHorizontal:24,alignItems:'flex-end',backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer'),borderTopWidth:1,borderColor:p.line}}><Pressable accessibilityRole="button" accessibilityLabel="Chiudi informazioni colori" onPress={()=>setOpen(false)} style={{paddingHorizontal:20,paddingVertical:12,borderRadius:11,backgroundColor:p.action}}><Text style={{fontSize:13,fontWeight:'600',color:p.actionText}}>Ho capito</Text></Pressable></View>
    </View>
   </View>
  </Modal>
 </>;
}
