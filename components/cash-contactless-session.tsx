import { useAccessAppearance } from './access-premium';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Platform,Text,View} from 'react-native';
import {StripeTerminalProvider,useStripeTerminal,requestNeededAndroidPermissions} from '@stripe/stripe-terminal-react-native';
import * as Location from 'expo-location';
import {supabase} from '../src/lib/supabase';
import {HapticTouchable} from './ui/haptic-touchable';
import type {ContactlessProps} from './cash-contactless';
import {showTapToPayEducation} from '../src/lib/tap-to-pay-education';
import {androidContactlessPrerequisite,androidContactlessError} from '../src/lib/android-contactless-readiness';

async function call(action:string,extra:Record<string,unknown>={}) {
 const {data,error}=await supabase.functions.invoke('cash-stripe',{body:{action,...extra},timeout:30000});
 if(error || data?.error) {
  let message=data?.error;
  if(!message && error && 'context' in error) { try {message=(await error.context.json()).error;} catch {} }
  throw Error(message || 'Connessione interrotta: verifica il pagamento prima di riprovare.');
 }
 return data;
}
let sessionInUse=false;
export function CashContactlessSession(props:ContactlessProps) {
 const location=useRef('');
 return <StripeTerminalProvider logLevel="none" tokenProvider={async()=>{
  if(!location.current)throw Error('Seleziona la sede del salone.');
  return (await call('terminal-token',{locationId:location.current})).secret;
 }}><ContactlessFlow {...props} location={location}/></StripeTerminalProvider>;
}
function ContactlessFlow({movementId,disabled,onPaid,onBusyChange,location}:ContactlessProps & {location:React.MutableRefObject<string>}) {
 const {palette:p}=useAccessAppearance();
 const [status,setStatus]=useState<{enabled:boolean;reason?:string;locations?:{id:string;name:string}[]}|null>(null);
 const [selected,setSelected]=useState('');
 const [message,setMessage]=useState('Verifica contactless…');
 const [busy,setBusy]=useState(false);
 const mounted=useRef(true),lock=useRef(false);
 const sdk=useStripeTerminal({
  onDidRequestReaderDisplayMessage:()=>setMessage('Segui le indicazioni sullo schermo di pagamento.'),
  onDidRequestReaderInput:()=>setMessage('Avvicina la carta o il telefono del cliente.'),
  onDidStartInstallingUpdate:()=>setMessage('Configurazione del telefono per Tap to Pay…'),
  onDidReportReaderSoftwareUpdateProgress:progress=>{
   const value=Number(progress);
   if(Number.isFinite(value))setMessage(`Preparazione Tap to Pay · ${Math.round(Math.max(0,Math.min(1,value))*100)}%`);
  },
 });
 useEffect(()=>{mounted.current=true;void call('terminal-status').then(s=>{if(mounted.current){setStatus(s);setSelected(s.locations?.[0]?.id||'');setMessage(s.reason || 'Avvicina una carta o un wallet al telefono del salone.');}}).catch(e=>{if(mounted.current)setMessage(e.message);});
  return ()=>{mounted.current=false;void sdk.cancelProcessPaymentIntent().finally(()=>sdk.disconnectReader()).finally(()=>sdk.clearCachedCredentials());};
 },[]);
 const verify=async()=>{const r=await call('terminal-check',{movementId});if(r.status==='paid'){onPaid();setMessage('Incasso confermato in Cassa e Agenda.');return true;}return false;};
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='active' && !lock.current)void verify().catch(()=>{});});return()=>sub.remove();},[movementId]);
 const run=async(job:()=>Promise<void>)=>{
  if(lock.current || sessionInUse || disabled)return;lock.current=true;sessionInUse=true;setBusy(true);onBusyChange?.(true);
  try{await job();}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Contactless non disponibile.');}
  finally{lock.current=false;sessionInUse=false;if(mounted.current)setBusy(false);onBusyChange?.(false);}
 };
 const accept=()=>void run(async()=>{
  location.current=selected;
  if(!selected)throw Error('Configura prima una sede Terminal nel tuo account Stripe.');
  setMessage('Verifica telefono e autorizzazioni…');
  if(Platform.OS==='android') {
   const prerequisite=androidContactlessPrerequisite(Platform.Version,__DEV__);
   if(prerequisite)throw Error(prerequisite);
   const permissions=await requestNeededAndroidPermissions({accessFineLocation:{title:'Posizione per il pagamento',message:'Stripe richiede la posizione per accettare pagamenti contactless.',buttonPositive:'Continua'}});
   if(permissions.error)throw Error('Autorizza posizione e dispositivi nelle impostazioni del telefono per usare il contactless.');
   if(!(await Location.hasServicesEnabledAsync()))throw Error('Attiva la posizione nelle impostazioni del telefono per usare il contactless.');
  } else {
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=='granted')throw Error('La posizione è necessaria per il contactless. Puoi abilitarla nelle impostazioni del telefono.');
  }
  const init=await sdk.initialize();if(init.error)throw Error(init.error.message);
  await sdk.disconnectReader();
  const cleared=await sdk.clearCachedCredentials();if(cleared.error)throw Error(cleared.error.message);
  const support=await sdk.supportsReadersOfType({deviceType:'tapToPay',discoveryMethod:'tapToPay',simulated:false});
  if(support.error || !support.readerSupportResult)throw Error(Platform.OS==='android'?androidContactlessError(support.error?.code,'Questo telefono non è abilitato al contactless. Verifica NFC, aggiornamenti e compatibilità; puoi usare QR / link.'):'Questo telefono non è abilitato al contactless. Verifica aggiornamenti e compatibilità; puoi usare QR / link.');
  setMessage('Preparazione Tap to Pay…');
  const connection=await sdk.easyConnect({discoveryMethod:'tapToPay',locationId:selected,simulated:false,tosAcceptancePermitted:true});
  if(connection.error)throw Error(Platform.OS==='android'?androidContactlessError(connection.error.code,connection.error.message):connection.error.message);
  // A successful SDK connection confirms Apple's merchant terms. Education
  // follows that confirmation, and no payment is reserved until it completes.
  if(!(await showTapToPayEducation())) { setMessage('Telefono configurato. Puoi riaprire la guida quando vuoi iniziare.'); return; }
  const reserved=await call('terminal-intent',{movementId});
  if(reserved.status==='paid'){onPaid();return;}
  if(!reserved.clientSecret){await verify();throw Error('Pagamento in verifica: non effettuare un secondo incasso.');}
  const retrieved=await sdk.retrievePaymentIntent(reserved.clientSecret);if(retrieved.error || !retrieved.paymentIntent)throw Error(retrieved.error?.message || 'Impossibile preparare il pagamento.');
  setMessage('Avvicina la carta o il telefono del cliente.');
  const processed=await sdk.processPaymentIntent({paymentIntent:retrieved.paymentIntent});
  // A timeout or SDK error is not evidence that the payment failed.
  if(await verify())return;
  if(processed.error)throw Error('Pagamento non confermato. Verifica lo stato; riprovando verrà utilizzato lo stesso pagamento.');
  setMessage('Conferma in corso. Premi Verifica pagamento prima di procedere.');
 });
 const button=(label:string,press:()=>void)=><HapticTouchable accessibilityRole="button" disabled={busy||disabled} onPress={press} style={{padding:14,borderRadius:16,backgroundColor:p.field,opacity:busy||disabled?0.5:1}}><Text style={{color:p.ink,fontSize:15,fontWeight:'600',textAlign:'center'}}>{label}</Text></HapticTouchable>;
 return <View style={{gap:10}}>
  {busy?<ActivityIndicator color={p.muted} accessibilityLabel="Preparazione o pagamento in corso"/>:null}
  <Text accessibilityLiveRegion="polite" style={{color:p.muted,fontSize:13,lineHeight:19}}>{message}</Text>
  {status?.enabled && (status.locations?.length ?? 0)>1 ? status.locations!.map(l=><HapticTouchable accessibilityRole="radio" accessibilityState={{checked:selected===l.id}} disabled={busy} key={l.id} onPress={()=>setSelected(l.id)}><Text style={{color:selected===l.id?p.action:p.ink}}>{selected===l.id?'✓ ':''}{l.name}</Text></HapticTouchable>):null}
  {status?.enabled && Platform.OS==='ios' ? button('Come usare Tap to Pay',()=>void run(async()=>{await showTapToPayEducation(true);})):null}
  {status?.enabled ? button(busy?'Operazione in corso…':'Incassa contactless',accept):null}
  {busy ? <HapticTouchable accessibilityRole="button" onPress={()=>void sdk.cancelProcessPaymentIntent()} style={{padding:12}}><Text style={{textAlign:'center',color:p.muted}}>Interrompi lettura</Text></HapticTouchable>:null}
  {status?.enabled && !selected?<Text style={{color:p.muted}}>Configura la sede in Stripe → Terminal → Sedi.</Text>:null}
  {button('Verifica contactless',()=>void run(async()=>{if(!(await verify()))setMessage('Nessun incasso contactless confermato.');}))}
  {status?.enabled ? button('Annulla tentativo contactless',()=>void run(async()=>{const r=await call('terminal-cancel',{movementId});if(r.status==='paid')onPaid();setMessage(r.status==='expired'?'Tentativo annullato. Puoi scegliere QR / link o un altro metodo.':r.status==='paid'?'Pagamento già confermato.':'Annullamento non confermato: verifica prima di cambiare metodo.');})):null}
 </View>;
}
