import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import {useAccessAppearance} from './access-premium';
import {useCashPanelStyles} from './cash-web-panel';
import { NativeSettingsPopup } from './native-settings-popup';
import { useAppContext } from '../src/context/AppContext';
import { useCashRefresh } from '../src/lib/use-cash-refresh';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Platform,StyleSheet,TextInput,View} from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {HapticTouchable} from './ui/haptic-touchable';
import {PremiumExpandButton} from './ui/premium-expand-button';
import {call,sharePdf} from './cash-fiscal-panel';
import {FiscalReceipt,fiscalDocumentLabel,fiscalEmailLabel,fiscalSummary} from '../src/lib/fiscal-archive';
import {createFiscalZip,fiscalYear} from '../src/lib/fiscal-zip';
import {writeFiscalWorkbook} from '../src/lib/fiscal-workbook';
const PAGE=8;
export function CashFiscalArchive({inline=false}:{inline?:boolean}={}){
 const s=useCashPanelStyles(baseCashStyles);
 const {palette:p}=useAccessAppearance();const web=Platform.OS==='web';
 const { salonWorkspace } = useAppContext();
 const [loading,setLoading]=useState(true);
 const [available,setAvailable]=useState(false),[expanded,setExpanded]=useState(inline),[rows,setRows]=useState<FiscalReceipt[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('Tutti'),[page,setPage]=useState(0),[detail,setDetail]=useState<string|null>(null);
 const [year,setYear]=useState<string|null>(null),[progress,setProgress]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let live=true;setLoading(true);call('status').then(d=>{if(live)setAvailable(d.available===true);}).catch(()=>{}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[salonWorkspace.id]);
 useEffect(()=>{setRows([]);setYear(null);setPage(0);setAvailable(false);},[salonWorkspace.id]);
 async function load(isCurrent:()=>boolean=()=>true){const all:FiscalReceipt[]=[];let total=1;while(all.length<total){const d=await call('archive',{offset:all.length});if(!Array.isArray(d.receipts)||!Number.isInteger(d.total))throw Error('Archivio non disponibile.');total=d.total;all.push(...d.receipts);if(!d.receipts.length&&all.length<total)throw Error('Archivio incompleto: aggiorna e riprova.');}const unique=[...new Map(all.map(r=>[r.id,r])).values()];if(unique.length!==total)throw Error('L’archivio è cambiato durante la lettura. Aggiorna per ottenere tutti i documenti.');if(!isCurrent())return unique;setRows(unique);setYear(previous=>previous??(unique[0]?fiscalYear(unique[0]):String(new Date().getFullYear())));return unique;}
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setProgress('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{if(expanded)void run(async()=>{await load();});},[expanded]);
 useCashRefresh(salonWorkspace.id,async isCurrent=>{if(!lock.current)await load(isCurrent);},expanded&&available);
 useEffect(()=>{setPage(0);},[query,filter,year]);
 const years=[...new Set(rows.map(fiscalYear))].sort().reverse();
 const inYear=(r:FiscalReceipt)=>year==='all'||fiscalYear(r)===year;
 const yearRows=rows.filter(inYear);
 const stats=fiscalSummary(yearRows);
 const found=useMemo(()=>rows.filter(r=>{
  const match=filter==='Tutti'||filter==='Emesse'&&r.status==='ready'&&r.void_status!=='ready'||filter==='Annullate'&&r.void_status==='ready'||filter==='Da verificare'&&fiscalSummary([r]).attention>0;
  return inYear(r)&&match&&`${r.document_number||''} ${r.void_number||''} ${r.id} ${fiscalDocumentLabel(r)}`.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it'));
 }),[rows,filter,query,year]);
 const pages=Math.max(1,Math.ceil(found.length/PAGE));const current=Math.min(page,pages-1);
 const button=(label:string,fn:()=>void,primary=false)=><HapticTouchable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={fn} webHoverLift={false} style={[s.button,primary&&s.primary,busy&&{opacity:.5}]}><Text style={[s.buttonText,primary&&{color:web?p.actionText:'white'}]}>{label}</Text></HapticTouchable>;
 async function save(base64:string,name:string,mime:string,uti:string){if(Platform.OS==='web'){const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else{if(!await Sharing.isAvailableAsync())throw Error('Condivisione non disponibile.');const uri=FileSystem.cacheDirectory+name;await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(uri,{mimeType:mime,UTI:uti});}}
 async function excel(){const all=(await load()).filter(inYear);await save(writeFiscalWorkbook(all,year==='all'?'Tutti gli anni':`Anno ${year}`),`SalonPro-ricevute-${year}-COLLAUDO.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','org.openxmlformats.spreadsheetml.sheet');}
 async function zip(){const all=(await load()).filter(inYear);const result=await createFiscalZip(all,async(r,isVoid)=>{const data=await call(isVoid?'void-pdf':'pdf',{id:r.id});return Uint8Array.from(atob(data.pdf),c=>c.charCodeAt(0));},(done,total)=>setProgress(`Preparazione PDF ${done} / ${total}`));let binary='';for(let i=0;i<result.bytes.length;i+=8192)binary+=String.fromCharCode(...result.bytes.subarray(i,i+8192));await save(btoa(binary),`SalonPro-PDF-${year}-COLLAUDO${result.missing?'-INCOMPLETO':''}.zip`,'application/zip','public.zip-archive');setProgress(`${result.count} PDF inclusi nello ZIP`);if(result.missing)setError(`${result.missing} PDF non disponibili: lo ZIP è incompleto. Trovi l’elenco dei mancanti nel file allegato.`);await load();}

 if(loading&&web)return <Text style={s.caption}>Caricamento archivio fiscale…</Text>;
 if(!available)return null;
 return <View style={inline ? {gap:14} : s.card}>
  {!inline ? <View style={s.heading}><HapticTouchable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(!expanded)} webHoverLift={false} style={s.headingMain}><View style={s.icon}><Ionicons name="documents-outline" size={24} color={'#5163C0'}/></View><View style={{flex:1,gap:4}}><Text style={s.title}>Archivio ricevute</Text><Text style={s.caption}>Documenti, PDF e invii</Text></View></HapticTouchable><PremiumExpandButton salon compact expanded={expanded} onPress={()=>setExpanded(!expanded)} accessibilityLabel={expanded?'Chiudi archivio ricevute':'Apri archivio ricevute'}/></View> : null}
  {expanded?<NativeSettingsPopup animationType="fade" title="Archivio ricevute" icon="documents-outline" onClose={() => setExpanded(false)}><View style={{gap:14}}>
   <Text style={s.notice}>COLLAUDO · nessuna validità fiscale</Text>
   <Text style={s.label}>Anno dell’archivio</Text>
   <View style={s.actions}>{[...years,'all'].map(y=><HapticTouchable key={y} disabled={busy} accessibilityRole="button" accessibilityState={{selected:year===y}} onPress={()=>setYear(y)} webHoverLift={false} style={[s.chip,year===y&&s.primary]}><Text style={[s.caption,year===y&&{color:web?p.actionText:'white'}]}>{y==='all'?'Tutti gli anni':y}</Text></HapticTouchable>)}</View>
   <View style={s.metrics}>{[[stats.issued,'Emesse','#EAF7F0'],[stats.cancelled,'Annullate','#FCECEE'],[stats.delivered,'Email consegnate','#EAF1FB'],[stats.attention,'Da verificare','#FFF4DD']].map(([n,label,color])=><View key={String(label)} style={[s.metric,{backgroundColor:web?p.field:String(color)}]}><Text style={s.number}>{n}</Text><Text style={s.caption}>{label}</Text></View>)}</View>
   <View style={s.actions}>{button('Scarica Excel',()=>void run(excel),true)}{button('Scarica tutti i PDF',()=>void run(zip))}{button(busy?'Aggiornamento…':'Aggiorna archivio',()=>void run(async()=>{await load();}))}</View>
   {progress?<Text accessibilityLiveRegion="polite" style={s.caption}>{progress}</Text>:null}
   <Text style={s.caption}>Excel e ZIP includono tutti i documenti dell’anno scelto, anche oltre questa pagina. I filtri di ricerca qui sotto non limitano l’esportazione.</Text>
   <PremiumSearchToolbar><TextInput accessibilityLabel="Cerca ricevuta per numero" placeholder="Cerca numero ricevuta o identificativo" placeholderTextColor="#78889C" value={query} onChangeText={setQuery} style={s.search}/>
   <View {...{dataSet:{premiumToolbarFilters:"true"}}} style={s.actions}>{['Tutti','Emesse','Annullate','Da verificare'].map(f=><HapticTouchable key={f} accessibilityRole="button" accessibilityState={{selected:f===filter}} onPress={()=>setFilter(f)} webHoverLift={false} style={[s.chip,filter===f&&s.primary]}><Text style={[s.caption,filter===f&&{color:web?p.actionText:'white'}]}>{f}</Text></HapticTouchable>)}</View></PremiumSearchToolbar>
   <Text style={s.caption}>{found.length} risultati · {stats.archived} PDF originali conservati</Text>
   {!found.length&&!busy?<Text style={s.caption}>{rows.length?'Nessun documento corrisponde ai filtri.':'Non ci sono ancora documenti nell’archivio.'}</Text>:null}
   {found.slice(current*PAGE,(current+1)*PAGE).map((r,index)=><React.Fragment key={r.id}>{year==='all'&&(index===0||fiscalYear(found[current*PAGE+index-1])!==fiscalYear(r))?<Text style={s.label}>{fiscalYear(r)}</Text>:null}<View style={s.document}>
    <View style={s.documentHeading}><View style={{flex:1,gap:5}}><Text style={s.label}>{r.document_number||'Tentativo senza numero'}</Text><Text style={s.caption}>{new Date(r.created_at).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</Text></View><PremiumExpandButton salon compact expanded={detail===r.id} onPress={()=>setDetail(detail===r.id?null:r.id)} accessibilityLabel="Dettagli ricevuta"/></View>
    <Text style={[s.status,{color:r.void_status==='ready'?'#994353':r.status==='ready'?'#1A7350':'#856018'}]}>{fiscalDocumentLabel(r)}</Text>
    <Text style={s.caption}>Email · {fiscalEmailLabel(r.email_status)}</Text>
    {r.status==='ready'?<View style={s.actions}>{button('PDF originale',()=>void run(async()=>{const d=await call('pdf',{id:r.id});await sharePdf(d.pdf,`ricevuta-${r.id}.pdf`);await load();}))}{r.void_status==='ready'?button('PDF annullamento',()=>void run(async()=>{const d=await call('void-pdf',{id:r.id});await sharePdf(d.pdf,`annullamento-${r.id}.pdf`);await load();})):null}</View>:null}
    {detail===r.id?<View style={s.details}>
     <Text selectable style={s.caption}>ID: {r.id}</Text><Text style={s.caption}>PDF: {r.archived_at?'copia privata conservata':'non ancora conservato'}</Text>
     {r.void_status?<Text style={s.caption}>Annullamento: {r.void_number||r.void_status} · email {fiscalEmailLabel(r.void_email_status)}</Text>:null}
     {r.refund_status?<Text style={s.caption}>Rimborso di prova: {r.refund_status==='succeeded'?'confermato':r.refund_status==='pending'?'in corso':'da verificare'}</Text>:null}
     <View style={s.actions}>
      {r.provider_id||r.status==='waiting_payment'?button('Verifica esiti',()=>void run(async()=>{await call('check',{id:r.id});await load();})):null}
      {r.status==='ready'&&r.email_status==='not_sent'?button('Invia al tester',()=>void run(async()=>{await call('email',{id:r.id});await load();})):null}
      {r.payment_status==='succeeded'&&r.status==='ready'&&!r.refund_status?button('Prova rimborso e annullamento',()=>void run(async()=>{await call('refund-test',{id:r.id});await load();})):null}
     </View>
    </View>:null}
   </View></React.Fragment>)}
   {pages>1?<View style={s.pagination}>{current>0?button('Precedenti',()=>setPage(current-1)):null}<Text style={s.caption}>{current+1} / {pages}</Text>{current<pages-1?button('Successive',()=>setPage(current+1)):null}</View>:null}
   <Text style={s.footnote}>Le copie archiviate restano disponibili anche a collegamento scaduto. Gli invii di prova raggiungono solo il tester. L’archivio non sostituisce la conservazione fiscale a norma.</Text>
   {error?<Text accessibilityRole="alert" style={{color:'#B42332'}}>{error}</Text>:null}
  </View></NativeSettingsPopup>:null}
 </View>;
}
const baseCashStyles=StyleSheet.create({card:{backgroundColor:'white',borderRadius:28,padding:20,gap:16,marginBottom:12},heading:{flexDirection:'row',alignItems:'center',gap:8},headingMain:{flex:1,flexDirection:'row',alignItems:'center',gap:12},icon:{width:44,height:44,borderRadius:15,backgroundColor:'#EFF4F9',alignItems:'center',justifyContent:'center'},title:{fontSize:18,fontWeight:'700',color:'#13213A'},caption:{fontSize:13,lineHeight:19,color:'#526781'},notice:{fontSize:11,fontWeight:'700',color:'#856018',backgroundColor:'#FFF4DD',padding:9,borderRadius:10,alignSelf:'flex-start'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:'45%',padding:14,borderRadius:16,gap:5},number:{fontSize:24,fontWeight:'600',color:'#20364D'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{paddingHorizontal:14,paddingVertical:12,borderRadius:14,backgroundColor:'#EFF4F9'},primary:{backgroundColor:'#20364D'},buttonText:{fontSize:13,fontWeight:'600',color:'#244B65'},search:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:'#E2E8F0',padding:12,fontSize:15,color:'#20364D',backgroundColor:'#F7F9FB'},chip:{paddingHorizontal:12,paddingVertical:9,borderRadius:12,backgroundColor:'#EFF4F9'},document:{padding:16,borderRadius:18,borderWidth:1,borderColor:'#E6ECF2',gap:9},documentHeading:{flexDirection:'row',alignItems:'center',gap:8},label:{fontSize:15,fontWeight:'600',color:'#20364D'},status:{fontSize:12,fontWeight:'600'},details:{gap:10,borderTopWidth:1,borderTopColor:'#E6ECF2',paddingTop:12},pagination:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},footnote:{fontSize:12,lineHeight:18,color:'#64748B'}});
