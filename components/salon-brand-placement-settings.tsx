import { PremiumSectionHeading } from './ui/premium-section-heading';
import { popupGlass } from './premium-web-surfaces';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSalonBrandPlacement } from '../src/lib/salon-brand-placements';
import { useAccessAppearance } from './access-premium';

export function SalonBrandPlacementSettings({workspaceId,disabled=false}:{workspaceId:string;disabled?:boolean}) {
 const {palette:p}=useAccessAppearance();
 const {value,error,refresh,save}=useSalonBrandPlacement(workspaceId);
 const [owner,setOwner]=useState(false);
 const [frontend,setFrontend]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{setOwner(value?.ownerEnabled??false);setFrontend(value?.frontendEnabled??false);},[workspaceId,value?.ownerEnabled,value?.frontendEnabled]);
 const changed=!!value&&(owner!==value.ownerEnabled||frontend!==value.frontendEnabled);
 const row=(title:string,description:string,checked:boolean,onChange:(next:boolean)=>void)=><View style={{flexDirection:'row',alignItems:'center',gap:16,paddingVertical:12}}>
  <View style={{flex:1}}><Text style={{color:p.ink,fontSize:14,fontWeight:'500'}}>{title}</Text><Text style={{color:p.muted,fontSize:12,lineHeight:18,marginTop:3}}>{description}</Text></View>
  <Switch accessibilityLabel={title} value={checked} onValueChange={onChange} disabled={disabled||busy||!value||(!value.eligible&&!checked)} trackColor={{false:'#AAA7A1',true:'#B7A281'}} thumbColor="#F7F4EE"/>
 </View>;
 return <View style={{borderWidth:1,borderColor:p.border,borderRadius:16,padding:16,gap:8,marginTop:16,backgroundColor:p.night?'rgba(218,207,188,.04)':'rgba(218,211,200,.22)',...(Platform.OS==='web'?popupGlass(p,'panel'):{})}}>
  <PremiumSectionHeading tone={0} style={{color:p.ink,fontSize:16,fontWeight:'500'}}>Dove mostrare la targhetta IA</PremiumSectionHeading>
  <Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Il nome del salone resta nella sua posizione. Solo una targhetta IA approvata può sostituire il marchio originale, con la firma “Powered by Salon Pro”.</Text>
  {value&&!value.eligible?<Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Crea e approva una targhetta IA nella sezione qui sopra. Senza targhetta attiva viene mostrato Salon Pro.</Text>:null}
  {row('Back office del salone','Mostra la targhetta nell’intestazione del gestionale.',owner,setOwner)}
  {row('Area clienti','Mostra la targhetta al posto del logo nell’area di prenotazione.',frontend,setFrontend)}
  {error?<><Text style={{color:p.muted,fontSize:12}}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>{void refresh(true);}}><Text style={{color:p.ink}}>Riprova</Text></Pressable></>:null}
  {message?<Text accessibilityLiveRegion="polite" style={{color:p.muted,fontSize:12}}>{message}</Text>:null}
  <Pressable accessibilityRole="button" accessibilityLabel="Salva visibilità targhetta" disabled={disabled||busy||!changed} onPress={async()=>{setBusy(true);setMessage('');try{await save(owner,frontend);setMessage('Visibilità salvata.');}catch(e){setMessage(e instanceof Error?e.message:'Salvataggio non riuscito.');}finally{setBusy(false);}}} style={{alignSelf:'flex-start',borderWidth:1,borderColor:p.border,borderRadius:12,paddingHorizontal:14,paddingVertical:10,backgroundColor:p.field,opacity:disabled||busy||!changed?.5:1}}><Text style={{color:p.ink,fontSize:13}}>{busy?'Salvataggio…':'Salva visibilità'}</Text></Pressable>
 </View>;
}
