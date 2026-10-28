import { PremiumSectionHeading } from './ui/premium-section-heading';
import { NativeReadableText as Text, nativeSerif } from './owner-native-premium';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../src/context/AppContext';
import { formatSalonAddress } from '../src/lib/platform';
import { isValidPhone10 } from '../src/lib/validators';
import { useAccessAppearance } from './access-premium';
import { SalonLogoEditor } from './ui/salon-logo-editor';
import { SalonActivityPicker } from './ui/salon-activity-picker';
import { SalonBrandPlacementSettings } from './salon-brand-placement-settings';

type Workspace=ReturnType<typeof useAppContext>['salonWorkspace'];
const fromWorkspace=(w:Workspace)=>({name:w.salonName,activity:w.activityCategory,street:[w.streetType,w.streetName,w.streetNumber].filter(Boolean).join(' '),city:w.city,postal:w.postalCode,phone:w.businessPhone,additional:[...(w.additionalPhones??[])]});

function useProfileController(){
 const {salonWorkspace:w,servizi,operatori,updateSalonWorkspacePersisted,ownerServerSyncReady}=useAppContext();
 const [draft,setDraft]=useState(()=>fromWorkspace(w));
 const saveLock=useRef<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const saved=useMemo(()=>fromWorkspace(w),[w]);
 const dirty=JSON.stringify(saved)!==JSON.stringify(draft);
 const latestWorkspace=useRef(w); latestWorkspace.current=w;
 const workspaceId=useRef(w.id);
 const savedSignature=JSON.stringify(saved);
 const previousSaved=useRef(savedSignature);
 useEffect(()=>{
  const next=fromWorkspace(latestWorkspace.current);
  const changedWorkspace=workspaceId.current!==latestWorkspace.current.id;
  const previous=previousSaved.current;
  workspaceId.current=latestWorkspace.current.id;
  previousSaved.current=JSON.stringify(next);
  setDraft(current=>changedWorkspace||JSON.stringify(current)===previous?next:current);
  if(changedWorkspace){setError('');setMessage('');setBusy(false);}
 },[w.id,savedSignature]);
 const options=useMemo(()=>Array.from(new Set([w.activityCategory,...servizi.map(s=>s.mestiereRichiesto??''),...operatori.map(o=>o.mestiere??'')])).filter(Boolean),[w.activityCategory,servizi,operatori]);
 const change=<K extends keyof typeof draft>(key:K,value:(typeof draft)[K])=>{setDraft(d=>({...d,[key]:value}));setMessage('');setError('');};
 const save=async()=>{
  if(saveLock.current||busy||!ownerServerSyncReady||!dirty)return;
  if([draft.name,draft.activity,draft.street,draft.city,draft.postal,draft.phone].some(v=>!v.trim())){setError('Completa nome, attività, telefono, indirizzo, città e CAP.');return;}
  if(!isValidPhone10(draft.phone)){setError('Inserisci un telefono valido di 9 o 10 cifre.');return;}
  const savingWorkspace=w.id;
  saveLock.current=savingWorkspace;
  const normalized={...draft,name:draft.name.trim(),activity:draft.activity.trim().toUpperCase(),street:draft.street.trim().toUpperCase(),city:draft.city.trim().toUpperCase(),postal:draft.postal.trim(),phone:draft.phone.trim(),additional:draft.additional.map(v=>v.trim()).filter((v,i)=>i===0||!!v)};
  setBusy(true);setError('');setMessage('');
  try{await updateSalonWorkspacePersisted(current=>({...current,salonName:draft.name.trim(),activityCategory:draft.activity.trim().toUpperCase(),businessPhone:draft.phone.trim(),additionalPhones:draft.additional.map(v=>v.trim()).filter((v,i)=>i===0||!!v),streetType:'',streetName:draft.street.trim().toUpperCase(),streetNumber:'',city:draft.city.trim().toUpperCase(),postalCode:draft.postal.trim(),salonAddress:formatSalonAddress({streetType:'',streetName:draft.street,streetNumber:'',city:draft.city,postalCode:draft.postal,salonAddress:''}),updatedAt:new Date().toISOString()}),{requireRemoteProfileConfirmation:true});if(latestWorkspace.current.id===savingWorkspace){setDraft(normalized);setMessage('Profilo salvato. I dati si aggiornano anche nell’area clienti.');}}catch(e){if(latestWorkspace.current.id===savingWorkspace)setError(e instanceof Error?e.message:'Salvataggio non completato. Riprova.');}finally{if(saveLock.current===savingWorkspace)saveLock.current=null;if(latestWorkspace.current.id===savingWorkspace)setBusy(false);}
 };
 return {w,draft,setDraft,busy,error,setError,message,setMessage,saved,dirty,options,change,save,ownerServerSyncReady};
}
const ProfileContext=createContext<ReturnType<typeof useProfileController>|null>(null);
export function SettingsProfileProvider({children}:React.PropsWithChildren){
 const controller=useProfileController();
 return <ProfileContext.Provider value={controller}>{children}</ProfileContext.Provider>;
}
export function SettingsSalonProfileWeb(){
 const {palette:p}=useAccessAppearance();
 const {w,draft,setDraft,busy,error,setError,message,setMessage,saved,dirty,options,change,save,ownerServerSyncReady}=useContext(ProfileContext)!;
 const field=(label:string,key:Exclude<keyof typeof draft,'additional'>)=><View style={{gap:7,minWidth:0}}><Text style={{fontSize:13,color:p.ink}}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} keyboardType={key==='phone'?'phone-pad':key==='postal'?'number-pad':'default'} value={draft[key]} onChangeText={value=>change(key,value)} style={{minHeight:46,borderWidth:1,borderColor:p.line,borderRadius:11,backgroundColor:p.field,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:p.ink,minWidth:0}}/></View>;
 return <View {...{dataSet:{settingsProfile:'true'}}} style={{gap:20}}>
  <Text style={{fontSize:14,lineHeight:22,color:p.muted}}>Queste informazioni vengono mostrate nella tua vetrina e nelle prenotazioni online.</Text>
  <View {...{dataSet:{settingsProfileColumns:'true'}}} style={{gap:22}}>
   <View style={{gap:20,minWidth:0}}>{field('Nome del salone','name')}<View style={{gap:7}}><Text style={{fontSize:13,color:p.ink}}>Attività</Text><SalonActivityPicker value={draft.activity} options={options} disabled={busy} onChange={value=>change('activity',value)}/></View>{field('Indirizzo completo','street')}<View {...{dataSet:{settingsProfileFields:'true'}}} style={{gap:14}}>{field('Città','city')}{field('CAP','postal')}</View>{field('Telefono del salone','phone')}
   {draft.additional.map((value,index)=><View key={index} style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1,gap:7}}><Text style={{fontSize:13,color:p.ink}}>Altro recapito {index+1}</Text><TextInput accessibilityLabel={`Altro recapito ${index+1}`} editable={!busy} keyboardType="phone-pad" value={value} onChangeText={next=>change('additional',draft.additional.map((v,i)=>i===index?next:v))} style={{minHeight:46,borderWidth:1,borderColor:p.line,borderRadius:11,backgroundColor:p.field,padding:12,fontSize:14,color:p.ink}}/></View><Pressable accessibilityRole="button" accessibilityLabel={`Rimuovi recapito ${index+1}`} disabled={busy} onPress={()=>change('additional',draft.additional.filter((_,i)=>i!==index))} style={{padding:10,alignSelf:'flex-end'}}><Ionicons name="trash-outline" size={18} color={p.night?'#E7AAAA':'#A53B3B'}/></Pressable></View>)}
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>change('additional',[...draft.additional,''])} style={{alignSelf:'flex-start',paddingVertical:10}}><Text style={{color:p.ink,fontSize:13}}>+ Aggiungi recapito</Text></Pressable></View>
   <View style={{gap:18,minWidth:0}}><PremiumSectionHeading tone={1} style={{fontSize:18,fontFamily:nativeSerif,color:p.ink}}>Logo e identità del salone</PremiumSectionHeading><SalonLogoEditor workspaceId={w.id} name={draft.name||w.salonName} disabled={busy}/><SalonBrandPlacementSettings workspaceId={w.id} disabled={busy}/></View>
  </View>
  {error?<Text accessibilityRole="alert" style={{fontSize:14,lineHeight:21,color:p.night?'#EEB0B0':'#A43E3E'}}>{error}</Text>:null}{message?<Text accessibilityLiveRegion="polite" style={{fontSize:14,lineHeight:21,color:p.ink}}>{message}</Text>:null}
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-end',gap:10,paddingTop:18,borderTopWidth:1,borderTopColor:p.line}}><Pressable accessibilityRole="button" disabled={!dirty||busy} onPress={()=>{setDraft(saved);setError('');setMessage('');}} style={{paddingHorizontal:20,paddingVertical:12,borderWidth:1,borderColor:p.border,borderRadius:11,backgroundColor:p.field,opacity:!dirty||busy?.5:1}}><Text style={{color:p.ink,fontSize:14}}>Annulla</Text></Pressable><Pressable accessibilityRole="button" disabled={!dirty||busy||!ownerServerSyncReady} onPress={()=>void save()} style={{paddingHorizontal:22,paddingVertical:12,borderRadius:11,backgroundColor:p.action,opacity:!dirty||busy||!ownerServerSyncReady?.5:1}}><Text style={{color:p.actionText,fontSize:14}}>{busy?'Salvataggio…':'Salva modifiche'}</Text></Pressable></View>
 </View>;
}
