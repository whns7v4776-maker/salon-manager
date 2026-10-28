import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import {useAccessAppearance} from './access-premium';
import {useCashPanelStyles} from './cash-web-panel';
import { NativeSettingsPopup } from './native-settings-popup';
import { useAppContext } from '../src/context/AppContext';
import { useCashRefresh } from '../src/lib/use-cash-refresh';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../src/lib/supabase';
import { PremiumExpandButton } from './ui/premium-expand-button';
import { HapticTouchable } from './ui/haptic-touchable';
const confirmedFiscalStatus=new Map<string,any>();
type Settings = { method: 'online' | 'register'; name: string; vat: string; model: string; autoEmail?: boolean };
type Receipt = { id: string; status: string; document_number?: string; provider_id?: string; email_status?: string; payment_status?: string; payment_scenario?: string; refund_status?: string; void_status?: string; void_number?: string; void_email_status?: string };
const labels: Record<string,string> = {waiting_payment:'Verifica pagamento di prova',submitting:'Invio in corso',uncertain:'Da verificare',new:'In elaborazione',submitted:'In elaborazione',retry:'In elaborazione',ready:'Pronta · prova',failed:'Da verificare'};
export async function call(action: string, extra = {}) {
 const {data,error} = await supabase.functions.invoke('cash-fiscal-sandbox',{body:{action,...extra},timeout:60000});
 if(error || data?.error) { let message=data?.error; if(!message && error && 'context' in error){try{message=(await (error.context as Response).json())?.error;}catch{}} throw Error(message || 'Collegamento non disponibile. Aggiorna lo stato prima di riprovare.'); }
 return data;
}
export async function sharePdf(pdf:string,filename:string) {
 if(Platform.OS==='web'){const bytes=Uint8Array.from(atob(pdf),(c:string)=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 else{if(!await Sharing.isAvailableAsync())throw Error('Condivisione non disponibile su questo dispositivo.');const uri=FileSystem.cacheDirectory+filename;await FileSystem.writeAsStringAsync(uri,pdf,{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf'});}
}
export function CashFiscalPanel({inline=false}:{inline?:boolean}={}) {
 const s=useCashPanelStyles(baseCashStyles);
 const {palette:p}=useAccessAppearance();const web=Platform.OS==='web';
 const { salonWorkspace } = useAppContext();
 const settingsDirty=useRef(false);
 useEffect(()=>{settingsDirty.current=false;setStatus(confirmedFiscalStatus.get(salonWorkspace.id)??null);setSettings({method:'online',name:'',vat:'',model:''});setSaved(false);setShowChecks(false);setError('');},[salonWorkspace.id]);
 const [expanded,setExpanded] = useState(inline);
 const [showChecks,setShowChecks] = useState(false);
 const [status,setStatus] = useState<any>(()=>confirmedFiscalStatus.get(salonWorkspace.id)??null);
 const [settings,setSettings] = useState<Settings>({method:'online',name:'',vat:'',model:''});
 const [saved,setSaved] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('');
 const lock = useRef(false), attempt = useRef<string|null>(null);
 const refresh = async () => { const d=await call('status'); setStatus(d); confirmedFiscalStatus.set(salonWorkspace.id,d); return d; };
 useCashRefresh(salonWorkspace.id,async isCurrent=>{try{const d=await call('status');if(!isCurrent())return;setStatus(d);confirmedFiscalStatus.set(salonWorkspace.id,d);if(!settingsDirty.current&&d.settings?.method){setSettings(d.settings);setSaved(true);}}catch(e){if(isCurrent())setError('Stato fiscale temporaneamente non disponibile. Riapri il pannello per riprovare.');throw e;}});
 useEffect(()=>{
  const pending=(status?.receipts||[]).some((r:Receipt)=>['waiting_payment','submitting','new','submitted','retry'].includes(r.status)||r.refund_status==='pending'||['submitting','new','submitted','retry'].includes(r.void_status||'')||(settings.autoEmail&&(r.status==='ready'&&r.email_status==='not_sent'||r.void_status==='ready'&&r.void_email_status==='not_sent')));
  if(!pending)return;let stopped=false,checking=false;
  const timer=setInterval(()=>{if(lock.current||checking)return;checking=true;void call('status').then(d=>{if(!stopped)setStatus(d);}).catch(()=>{}).finally(()=>{checking=false;});},10000);
  return()=>{stopped=true;clearInterval(timer);};
 },[status?.receipts,settings.autoEmail]);
 const run = async (job:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await job();}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}};
 const button=(label:string,onPress:()=>void,primary=false)=><HapticTouchable accessibilityRole="button" disabled={busy} onPress={onPress} style={[s.button,primary&&s.primary,busy&&{opacity:0.5}]}><Text style={[s.buttonText,primary&&{color:web?p.actionText:'white'}]}>{label}</Text></HapticTouchable>;
 const edit=(key:keyof Settings,value:string)=>{settingsDirty.current=true;setSettings(v=>({...v,[key]:value}));setSaved(false);};
 if(!status)return web?<Text style={s.text}>{error||'Verifica del collegamento fiscale…'}</Text>:null;
 if(!status.available)return null;
 const receipts:Receipt[]=status.receipts||[];
 const unresolved=receipts.some(r=>['waiting_payment','submitting','uncertain'].includes(r.status));
 // Current endpoint is sandbox-only: a saved draft must never imply live activation.
 const configured=!!status.settings?.method;
 const state=status.settings?.method==='register'
  ? {label:'Da configurare',color:'#856018',background:'#FFF5DF'}
  : status.connected
   ? {label:'Modalità prova',color:'#856018',background:'#FFF5DF'}
   : configured
    ? {label:'Collegamento da rinnovare',color:'#B42332',background:'#FFF0F0'}
    : {label:'Non attive',color:'#64748B',background:'#F1F5F9'};
 const toggle=()=>setExpanded(value=>!value);
 return <View style={inline ? {gap:14} : s.card}>
  {!inline ? <View style={s.heading}>
   <HapticTouchable accessibilityRole="button" accessibilityLabel={`${expanded?'Riduci':'Espandi'} Ricevute fiscali`} accessibilityState={{expanded}} onPress={toggle} style={s.headingButton}>
    <View style={s.icon}><Ionicons name="receipt-outline" size={24} color={'#C47C1B'}/></View>
    <View style={{flex:1,minWidth:0,gap:6}}><Text style={s.title}>Ricevute fiscali</Text>
     <View style={[s.statusBadge,{backgroundColor:state.background}]}><View style={[s.statusDot,{backgroundColor:state.color}]}/><Text style={[s.statusLabel,{color:state.color}]}>{state.label}</Text></View>
    </View>
   </HapticTouchable>
   <PremiumExpandButton salon compact expanded={expanded} onPress={toggle} accessibilityLabel={expanded?'Chiudi configurazione ricevute fiscali':'Apri configurazione ricevute fiscali'}/>
  </View> : null}
  {!expanded?<Text style={s.text}>Configura il servizio e gestisci l’invio delle ricevute.</Text>:null}
  {expanded?<NativeSettingsPopup animationType="fade" title="Ricevute fiscali" icon="receipt-outline" onClose={() => setExpanded(false)}><View style={{gap:12}}>
  <Text style={s.text}>Modalità prova gratuita · i documenti non hanno validità fiscale.</Text>
  <View style={s.row}>{(['online','register'] as const).map(method=><HapticTouchable key={method} accessibilityRole="button" accessibilityState={{selected:settings.method===method}} disabled={busy} style={[s.option,settings.method===method&&s.selected]} onPress={()=>edit('method',method)}><Text style={s.buttonText}>{method==='online'?'Servizio online':'Registratore fisico'}</Text></HapticTouchable>)}</View>
  <Text style={s.label}>Ragione sociale</Text><TextInput accessibilityLabel="Ragione sociale fiscale" editable={!busy} style={s.input} value={settings.name} onChangeText={v=>edit('name',v)} maxLength={120}/>
  <Text style={s.label}>Partita IVA</Text><TextInput accessibilityLabel="Partita IVA fiscale" editable={!busy} style={s.input} value={settings.vat} onChangeText={v=>edit('vat',v.replace(/\D/g,''))} maxLength={11} keyboardType="number-pad"/>
  {settings.method==='register'?<><Text style={s.label}>Marca e modello</Text><TextInput accessibilityLabel="Marca e modello registratore" editable={!busy} style={s.input} value={settings.model} onChangeText={v=>edit('model',v)} maxLength={160}/><Text style={s.text}>Salva i dati del dispositivo per la verifica. Il collegamento al registratore non è ancora disponibile.</Text></>:<Text style={s.text}>A-Cube · configurazione salvata come bozza. L’emissione reale richiede un’attivazione separata.</Text>}
  <HapticTouchable accessibilityRole="switch" accessibilityState={{checked:settings.autoEmail===true}} disabled={busy} onPress={()=>{settingsDirty.current=true;setSettings(v=>({...v,autoEmail:!v.autoEmail}));setSaved(false);}} style={s.option}><Text style={s.label}>Invio automatico PDF · {settings.autoEmail?'Attivo':'Disattivato'}</Text><Text style={s.text}>Invio alla casella del tester quando il PDF è pronto, anche ad app chiusa.</Text></HapticTouchable>
  {button(saved?'Configurazione salvata':'Salva configurazione',()=>void run(async()=>{await call('save',{settings});settingsDirty.current=false;setSaved(true);await refresh();}),true)}
  {settings.method==='online'?<>
   <View style={s.checksHeading}>
    <View style={{flex:1,gap:4}}><Text style={s.label}>Collaudo</Text><Text style={s.text}>Verifica pagamento, documento e consegna PDF.</Text></View>
    <PremiumExpandButton salon compact expanded={showChecks} onPress={()=>setShowChecks(v=>!v)} accessibilityLabel={showChecks?'Chiudi collaudo':'Apri collaudo'}/>
   </View>
   {showChecks?<View style={s.checksBody}>
   {status.accessExpiresAt?<Text style={s.text}>Accesso gratuito valido fino al {new Date(status.accessExpiresAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}. Dopo la scadenza sarà necessario rinnovare l’accesso di prova.</Text>:null}
   <Text style={s.label}>Prova completa · 25,50 € simulati</Text>
   <Text style={s.text}>Pagamento Stripe di test → ricevuta A-Cube → PDF via email al tester. Nessuna carta reale, nessun addebito, nessuna modifica agli incassi.</Text>
   {status.connected&&status.paymentTestAvailable&&!unresolved?<View style={{gap:8}}>
    {button('Esegui pagamento di prova',()=>void run(async()=>{attempt.current ||= (await call('request-id')).id;try{await call('payment-test',{id:attempt.current,scenario:'success'});}finally{await refresh();}attempt.current=null;}),true)}
    {button('Prova carta rifiutata',()=>void run(async()=>{attempt.current ||= (await call('request-id')).id;try{await call('payment-test',{id:attempt.current,scenario:'declined'});}finally{await refresh();}attempt.current=null;}))}
   </View>:null}
   <Text style={s.label}>Prova del solo documento</Text><Text style={s.text}>Prova con dati fittizi: 25,50 €, pagamento elettronico. Il PDF sandbox contiene il modello dimostrativo di A-Cube.</Text>
   {status.connected&&!unresolved?button('Genera ricevuta di prova',()=>void run(async()=>{attempt.current ||= (await call('request-id')).id;await call('create',{id:attempt.current});await refresh();attempt.current=null;})):null}
   {!status.connected?<Text style={s.text}>Accesso A-Cube scaduto: le nuove prove sono sospese. I risultati già salvati restano disponibili.</Text>:null}
   {unresolved?<Text style={s.text}>C’è un invio da verificare. La creazione di altre prove è sospesa per evitare duplicati.</Text>:null}
   <Text style={s.text}>Documenti, PDF e stato degli invii sono nell’Archivio ricevute qui sotto.</Text>
   </View>:null}
  </>:null}
  {button(busy?'Verifica in corso…':'Aggiorna stato',()=>void run(async()=>{await refresh();}))}
  {error?<Text accessibilityRole="alert" style={{color:'#B42332'}}>{error}</Text>:null}
 </View></NativeSettingsPopup>:null}
 </View>;
}
const baseCashStyles=StyleSheet.create({checksHeading:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:12,borderTopWidth:1,borderTopColor:'#E8EDF3'},checksBody:{gap:12,padding:14,borderRadius:16,backgroundColor:'#F7F9FB'},card:{backgroundColor:'white',borderRadius:28,padding:20,gap:12,marginBottom:12},heading:{flexDirection:'row',alignItems:'center',gap:8},headingButton:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},statusBadge:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',borderRadius:14,paddingHorizontal:9,paddingVertical:4,flexShrink:1},statusDot:{width:7,height:7,borderRadius:4},statusLabel:{fontSize:12,fontWeight:'600',flexShrink:1},icon:{width:44,height:44,borderRadius:15,backgroundColor:'#EFF4F9',alignItems:'center',justifyContent:'center'},title:{fontSize:18,fontWeight:'700',color:'#13213A'},text:{fontSize:14,lineHeight:21,color:'#64748B'},badge:{alignSelf:'flex-start',backgroundColor:'#FFF5DF',color:'#856018',borderRadius:12,padding:9,fontSize:13,fontWeight:'600'},row:{flexDirection:'row',gap:8,flexWrap:'wrap'},option:{flexGrow:1,padding:12,borderWidth:1,borderColor:'#E2E8F0',borderRadius:14},selected:{backgroundColor:'#EEF3FA',borderColor:'#ACBED4'},label:{fontSize:14,fontWeight:'600',color:'#334B65'},input:{minHeight:46,padding:12,backgroundColor:'#F7F9FB',borderColor:'#E2E8F0',borderWidth:1,borderRadius:14,color:'#13213A',fontSize:16},button:{padding:14,borderRadius:16,backgroundColor:'#EFF4F9',alignItems:'center'},primary:{backgroundColor:'#20364D'},buttonText:{fontSize:14,fontWeight:'600',color:'#244B65'},receipt:{backgroundColor:'#F7F9FB',padding:14,borderRadius:16,gap:8}});
