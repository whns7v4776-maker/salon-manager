import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { AgendaAvailabilitySection } from './agenda-availability-premium';
import { useAgendaPopupStyles } from './agenda-popup-theme';
import { useAccessAppearance } from './access-premium';
import { getAutomaticRoleAccentColor } from '../src/lib/service-accents';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CustomerSheetFrame, useCustomerSheetDockStyle } from './customer-sheet-frame';
import { HapticTouchable } from './ui/haptic-touchable';
import { supabase } from '../src/lib/supabase';
import Animated, { SlideInDown } from 'react-native-reanimated';
export type AppointmentServiceRevision = { appointmentId: string; expected: string; serviceId: string; price: number; initial: number; processing: number; final: number; operatorId: string; finalOperatorId: string };
type Service = { id: string; name: string; price: number; duration_minutes: number; required_role?: string; phase_config?: Record<string, any> };
type Snapshot = { appointment: Record<string, any>; services: Service[]; operators: {id:string;nome?:string;name?:string;mestiere?:string;required_role?:string}[]; payment?: {paidCents:number;receivedCents:number} };
export function AppointmentServiceEditor({ appointmentId, onClose, onSaved, save, embedded = false }: { onSaved?: (message: string) => void; embedded?: boolean; appointmentId: string | null; onClose: () => void; save: (draft: AppointmentServiceRevision) => Promise<{ok:boolean;unchanged?:boolean;error?:string;payment?:{balanceCents:number;refundDueCents:number}}> }) {
 const {palette:p}=useAccessAppearance();
 const styles=useAgendaPopupStyles(baseStyles);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [serviceId,setServiceId]=useState('');
 const [price,setPrice]=useState('');const [initial,setInitial]=useState('');const [processing,setProcessing]=useState('0');const [final,setFinal]=useState('0');
 const [operator,setOperator]=useState('');const [finalOperator,setFinalOperator]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [saved,setSaved]=useState('');
 const [query,setQuery]=useState('');const [choosing,setChoosing]=useState(false);const [retry,setRetry]=useState(0);const lock=useRef(false);
 const dock=useCustomerSheetDockStyle(); const scroll=useRef<ScrollView>(null);
 const revealFocusedField=useCallback(()=>{if(Platform.OS==='web')return;const input=TextInput.State.currentlyFocusedInput();if(input)scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input,24,true);},[]);
 useEffect(()=>{const listener=Keyboard.addListener('keyboardDidShow',revealFocusedField);return()=>listener.remove();},[revealFocusedField]);
 const select=(s:Service)=>{setServiceId(s.id);setPrice(String(s.price));const p=s.phase_config?.mode==='phased'?s.phase_config:null;setInitial(String(p?.initialDurationMinutes??s.duration_minutes));setProcessing(String(p?.processingDurationMinutes??0));setFinal(String(p?.finalPhaseEnabled===false?0:p?.finalDurationMinutes??0));setChoosing(false);};
 useEffect(()=>{let gone=false;setSnapshot(null);setError('');setSaved('');setChoosing(false);setQuery('');if(!appointmentId)return;
 void supabase.rpc('get_owner_appointment_revision_v1',{p_appointment:appointmentId}).then(({data,error})=>{if(gone)return;if(error){setError(error.message);return;}const next=data as Snapshot;setSnapshot(next);const a=next.appointment;setServiceId(next.services.find(s=>s.name===a.service_name)?.id??'');setPrice(String(a.price));setInitial(String(a.phase_snapshot?.initialDurationMinutes??a.duration_minutes));setProcessing(String(a.phase_snapshot?.processingDurationMinutes??0));setFinal(String(a.phase_snapshot?.finalDurationMinutes??0));setOperator(a.operator_id??'');setFinalOperator(a.phase_operator_assignments?.final?.id??a.operator_id??'');});return()=>{gone=true;};
 },[appointmentId,retry]);
 const service=snapshot?.services.find(s=>s.id===serviceId);const phased=service?.phase_config?.mode==='phased';const same=service?.phase_config?.sameOperator!==false;
 const catalogGroups = Array.from((snapshot?.services ?? []).filter(s=>s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).reduce((groups,s)=>{
   const label=s.required_role?.trim()||'Altri servizi';
   const key=label.toLocaleLowerCase('it');
   const group=groups.get(key)??{key,label,services:[] as Service[]};
   group.services.push(s);groups.set(key,group);return groups;
 },new Map<string,{key:string;label:string;services:Service[]}>()).values()).sort((a,b)=>a.label.localeCompare(b.label,'it'));
 const submit=async()=>{if(lock.current||!snapshot||!appointmentId)return;const amount=Number(price.replace(',','.'));const values=[initial,processing,final].map(Number);if(!serviceId||!price.trim()||!Number.isFinite(amount)||amount<0||values.some(v=>!Number.isInteger(v)||v<0)){setError('Controlla servizio, prezzo e durata.');return;}lock.current=true;setBusy(true);setError('');try {const result=await save({appointmentId,expected:snapshot.appointment.updated_at,serviceId,price:amount,initial:values[0],processing:phased?values[1]:0,final:phased&&service?.phase_config?.finalPhaseEnabled!==false?values[2]:0,operatorId:operator,finalOperatorId:same?operator:finalOperator});if(!result.ok)setError(result.error??'Salvataggio non riuscito.');else {const message=result.unchanged?'Nessuna modifica: l’appuntamento è già aggiornato.':result.payment?.refundDueCents?`Modifica salvata. Rimborso da gestire: ${(result.payment.refundDueCents/100).toFixed(2)} €.`:result.payment?.balanceCents?`Modifica salvata. Da saldare: ${(result.payment.balanceCents/100).toFixed(2)} €.`:'Modifica salvata. Nessun saldo da incassare.';if((result.payment?.refundDueCents??0)>0){setSaved(message);}else{onSaved?.(message);onClose();}};}catch{setError('Connessione interrotta. Riapri la modifica per verificare lo stato prima di riprovare.');}finally{lock.current=false;setBusy(false);}};
 const field=(label:string,value:string,set:(s:string)=>void)=><View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={set} keyboardType="decimal-pad" editable={!busy&&!saved} style={styles.input} onFocus={event=>{if(Platform.OS==='web')return;const target=event.target;setTimeout(()=>scroll.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(target,24,true),250);}} /></View>;
 const operators=(value:string,set:(s:string)=>void,role?:string)=><View style={styles.options}>
 {snapshot?.operators.map(o=><HapticTouchable key={o.id} disabled={busy||!!saved} onPress={()=>set(o.id)} style={[styles.option,value===o.id&&styles.selected]}><Text style={[styles.optionText,value===o.id&&styles.white]}>{o.nome??o.name}</Text></HapticTouchable>)}
 {!snapshot?.operators.some(o=>(o.mestiere??o.required_role??'').trim().toLocaleLowerCase()===(role??'').trim().toLocaleLowerCase())?<HapticTouchable disabled={busy||!!saved} onPress={()=>set('')} style={[styles.option,(!value||value.startsWith('salon-capacity::'))&&styles.selected]}><Text style={[styles.optionText,(!value||value.startsWith('salon-capacity::'))&&styles.white]}>Disponibilità del salone</Text></HapticTouchable>:null}
 </View>;
 const content = <CustomerSheetFrame {...(Platform.OS !== 'web' ? {onClose: () => {if(!busy)onClose();}, dismissDisabled:busy} : {})} animateBackdrop={!embedded && Platform.OS !== 'web'}><Animated.View entering={!embedded && Platform.OS !== 'web' ? SlideInDown.duration(280) : undefined} testID="agenda-service-editor" style={[styles.sheet,dock,Platform.OS !== 'web' && {flex:1,minHeight:0,maxHeight:'100%'}]}>
 <View style={styles.header}><View style={{flex:1}}><Text style={styles.title}>Servizio e importo</Text><Text style={styles.subtitle}>{snapshot?.appointment.customer_name??'Modifica appuntamento'}</Text></View><HapticTouchable disabled={busy} accessibilityLabel="Chiudi" onPress={onClose} style={styles.close}><Text style={styles.title}>×</Text></HapticTouchable></View>
 {choosing ? (<View style={[styles.catalog,{margin:18,flexShrink:1,minHeight:0},Platform.OS !== 'web' && {flex:1}]}>
   <PremiumSearchToolbar><View style={styles.searchRow}><Ionicons name="search-outline" size={19} color={p.muted}/><TextInput accessibilityLabel="Cerca nel listino" value={query} onChangeText={setQuery} placeholder="Cerca nel listino" placeholderTextColor={p.muted} style={styles.searchInput}/></View></PremiumSearchToolbar>
   <ScrollView style={{flexShrink:1,minHeight:0,...(Platform.OS !== 'web' ? {flex:1} : {})}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator contentContainerStyle={{padding:6}}>
   {catalogGroups.map(group=>{const accent=getAutomaticRoleAccentColor(group.label);return <View key={group.key} style={styles.catalogGroup}>
     <View style={styles.groupHeading}><View style={[styles.roleBadge,{backgroundColor:accent+'18'}]}><View style={[styles.roleDot,{backgroundColor:accent}]}/><Text style={styles.roleText}>{group.label}</Text></View><Text style={styles.groupCount}>{group.services.length}</Text></View>
     {group.services.map(s=><HapticTouchable key={s.id} accessibilityRole="button" accessibilityState={{selected:s.id===serviceId}} disabled={busy||!!saved} onPress={()=>select(s)} style={[styles.catalogRow,s.id===serviceId&&styles.catalogSelected]}>
     <View style={{flex:1}}><Text style={styles.catalogTitle}>{s.name}</Text><Text style={styles.serviceMeta}>{[`${s.duration_minutes} min`,Number(s.price).toLocaleString('it-IT',{style:'currency',currency:'EUR'})].filter(Boolean).join(' · ')}</Text></View>
     <Ionicons name={s.id===serviceId?'checkmark-circle':'chevron-forward'} size={s.id===serviceId?21:16} color={s.id===serviceId?p.ink:p.muted}/>
   </HapticTouchable>)}
   </View>})}
   {!catalogGroups.length?<Text style={styles.empty}>Nessun servizio trovato</Text>:null}
   </ScrollView>
 </View>) : (
 <ScrollView ref={scroll} style={{flexShrink:1,minHeight:0,...(Platform.OS !== 'web' ? {flex:1} : {})}} onFocus={()=>requestAnimationFrame(revealFocusedField)} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
 {!snapshot&&!error?<ActivityIndicator/>:null}
 {snapshot?<><View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={18} color={p.muted}/><Text style={[styles.note,{flex:1}]}>Incassi conservati. Eventuali rimborsi restano a cura del salone.</Text></View>
 <AgendaAvailabilitySection compact number="01" title="Servizio" icon="cut-outline" tone="sage">
 <HapticTouchable accessibilityRole="button" accessibilityLabel="Scegli servizio" accessibilityState={{expanded:choosing}} disabled={busy||!!saved} onPress={()=>setChoosing(v=>!v)} style={styles.serviceSelector}>
   <View style={styles.serviceIcon}><Ionicons name="cut-outline" size={22} color={p.ink}/></View>
   <View style={{flex:1}}><Text style={styles.serviceTitle}>{service?.name??'Scegli il servizio'}</Text><Text style={styles.serviceMeta}>{choosing?'Seleziona dal listino qui sotto':'Tocca per cambiare servizio'}</Text></View>
   <Ionicons name={choosing?'chevron-up':'chevron-down'} size={19} color={p.muted}/>
 </HapticTouchable>
 </AgendaAvailabilitySection><AgendaAvailabilitySection compact number="02" title="Importo e tempi" icon="time-outline" tone="blue"><View style={styles.fieldsRow}>{field('Prezzo totale (€)',price,setPrice)}{field(phased?'Lavorazione (minuti)':'Durata (minuti)',initial,setInitial)}
 {phased?<>{field('Posa (minuti)',processing,setProcessing)}{service?.phase_config?.finalPhaseEnabled!==false?field('Fase finale (minuti)',final,setFinal):null}</>:null}
 </View></AgendaAvailabilitySection><AgendaAvailabilitySection compact number="03" title="Operatori" icon="people-outline" tone="sand">
 <Text style={styles.label}>Operatore</Text>{operators(operator,setOperator,service?.required_role)}
 {phased&&!same&&Number(final)>0?<><Text style={styles.label}>Operatore della fase finale</Text>{operators(finalOperator,setFinalOperator,snapshot?.services.find(item=>item.id===service?.phase_config?.finalServiceId)?.required_role)}</>:null}
 </AgendaAvailabilitySection><Text style={styles.note}>Giorno e ora restano invariati. Il salvataggio verifica la disponibilità; gli altri appuntamenti non vengono spostati.</Text></>:null}
 {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}{!snapshot&&error?<HapticTouchable onPress={()=>setRetry(v=>v+1)}><Text>Riprova</Text></HapticTouchable>:null}
 {saved?<Text accessibilityRole="alert" style={styles.success}>{saved}</Text>:null}
 </ScrollView>)}<HapticTouchable disabled={busy||!snapshot} onPress={choosing?()=>setChoosing(false):saved?onClose:submit} style={[styles.save,busy&&{opacity:.5}]}><Text style={styles.white}>{choosing?'Torna alla modifica':busy?'Salvataggio…':saved?'Fatto':'Salva modifica'}</Text></HapticTouchable>
 </Animated.View></CustomerSheetFrame>;
 return embedded ? content : <Modal visible={!!appointmentId} transparent animationType="none" onRequestClose={()=>{if(!busy)onClose();}}>{content}</Modal>;
}
const baseStyles=StyleSheet.create({
editorSection:{gap:10,borderWidth:1,borderColor:'#DAD6CE',borderRadius:14,padding:14},
sectionTitle:{fontSize:12,lineHeight:18,fontWeight:'600',color:'#426B54'},
fieldsRow:{flexDirection:'row',flexWrap:'wrap',gap:12},
catalogGroup:{marginBottom:6},
groupHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:10,paddingTop:10,paddingBottom:6},
roleBadge:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:10,paddingVertical:5,borderRadius:10,flexShrink:1},
roleDot:{width:6,height:6,borderRadius:3},
roleText:{fontSize:12,fontWeight:'700',color:'#334155',flexShrink:1},
groupCount:{fontSize:12,color:'#64748B'},
notice:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:14,backgroundColor:'#F3F7FA'},
serviceSelector:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:18,borderWidth:1,borderColor:'#D9E5F1',backgroundColor:'#F5F9FE'},
serviceIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#E6EFF9'},
serviceTitle:{fontSize:17,fontWeight:'700',color:'#20364D',flexShrink:1},
serviceMeta:{fontSize:12,lineHeight:18,color:'#64748B',marginTop:3},
catalog:{borderWidth:1,borderColor:'#E2E8F0',borderRadius:18,overflow:'hidden',backgroundColor:'#FFFFFF'},
searchRow:{flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:14,backgroundColor:'#F8FAFC',borderBottomWidth:1,borderColor:'#E2E8F0'},
searchInput:{flex:1,minHeight:46,fontSize:15,color:'#20364D',paddingVertical:10},
catalogRow:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:10,borderRadius:12,marginBottom:2},
catalogSelected:{backgroundColor:'#EDF4FF'},
catalogTitle:{fontSize:15,fontWeight:'600',lineHeight:21,color:'#20364D',flexShrink:1},
empty:{padding:18,textAlign:'center',color:'#64748B',fontSize:14},
sheet:{width:'100%',maxWidth:640,maxHeight:'94%',backgroundColor:'#fff',borderTopLeftRadius:26,borderTopRightRadius:26,overflow:'hidden'},header:{padding:18,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:'#edf0f5'},title:{fontSize:22,fontWeight:'700',color:'#111827'},subtitle:{fontSize:15,color:'#64748b',marginTop:4},close:{padding:10,borderRadius:24,backgroundColor:'#F1F5F9',minWidth:44,alignItems:'center'},body:{padding:18,gap:12,paddingBottom:28},label:{fontSize:14,fontWeight:'600',color:'#475569'},field:{gap:6,flexGrow:1,flexBasis:'45%',minWidth:130},input:{padding:12,borderWidth:1,borderColor:'#dce3ee',borderRadius:12,fontSize:17,color:'#111827',backgroundColor:'#f8fafc'},note:{fontSize:13,lineHeight:19,color:'#64748b'},options:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{padding:12,borderRadius:12,backgroundColor:'#f1f5f9'},optionText:{fontSize:16,color:'#20364d'},selected:{backgroundColor:'#20364d'},white:{fontSize:16,fontWeight:'600',color:'#fff'},save:{margin:16,padding:16,borderRadius:16,backgroundColor:'#111827',alignItems:'center'},error:{color:'#b91c1c',fontSize:14,lineHeight:21},success:{color:'#166534',fontSize:16,lineHeight:23}});
