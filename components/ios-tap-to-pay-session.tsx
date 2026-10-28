import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ActivityIndicator,Alert,AppState,Modal,ScrollView,Share,StyleSheet,Text,View} from 'react-native';
import {StripeTerminalProvider,useStripeTerminal} from '@stripe/stripe-terminal-react-native';
import * as Location from 'expo-location';
import {supabase} from '../src/lib/supabase';
import {IosTapToPayController} from '../src/lib/ios-tap-to-pay-controller';
import {showTapToPayEducation} from '../src/lib/tap-to-pay-education';
import {callIosTerminal} from '../src/lib/ios-terminal-request';
import {HapticTouchable} from './ui/haptic-touchable';
import type {IosTapProviderProps} from './ios-tap-to-pay-provider';
import type {ContactlessProps} from './cash-contactless';

const Session=createContext<IosTapToPayController|null>(null);
async function call(action:string,extra:Record<string,unknown>={}) {
  return callIosTerminal((body,options)=>supabase.functions.invoke('cash-stripe',{body,...options}),action,extra,action==='terminal-status'?15000:30000);
}
export function IosTapSessionProvider(props:IosTapProviderProps) {
  const controller=useRef<IosTapToPayController|null>(null);
  const tokenProvider=useCallback(()=>controller.current?.token()??Promise.reject(Error('Accedi al salone.')),[]);
  return <StripeTerminalProvider logLevel="none" tokenProvider={tokenProvider}>
    <SessionLifecycle {...props} controllerRef={controller}/>
  </StripeTerminalProvider>;
}
function SessionLifecycle({identity,children,controllerRef}:IosTapProviderProps & {controllerRef:React.MutableRefObject<IosTapToPayController|null>}) {
  const sdkRef=useRef<ReturnType<typeof useStripeTerminal>|null>(null);
  const [controller]=useState(()=>new IosTapToPayController({
    call,
    permission:async request=>{
      const permission=request?await Location.requestForegroundPermissionsAsync():await Location.getForegroundPermissionsAsync();
      return permission.status==='granted' && await Location.hasServicesEnabledAsync();
    },
    initialize:()=>sdkRef.current!.initialize(),
    supported:()=>sdkRef.current!.supportsReadersOfType({deviceType:'tapToPay',discoveryMethod:'tapToPay',simulated:false}),
    connect:(locationId,acceptTerms)=>sdkRef.current!.easyConnect({discoveryMethod:'tapToPay',locationId,simulated:false,tosAcceptancePermitted:acceptTerms,autoReconnectOnUnexpectedDisconnect:true}),
    disconnect:()=>sdkRef.current!.disconnectReader(),
    clear:()=>sdkRef.current!.clearCachedCredentials(),
    cancel:async()=>{
      // One cancellation failing must not prevent the other pending operations
      // from being interrupted. These run only after native initialization.
      await Promise.allSettled([
        sdkRef.current!.cancelProcessPaymentIntent(),
        sdkRef.current!.cancelEasyConnect(),
        sdkRef.current!.cancelReaderReconnection(),
      ]);
    },
    retrieve:secret=>sdkRef.current!.retrievePaymentIntent(secret),
    process:paymentIntent=>sdkRef.current!.processPaymentIntent({paymentIntent}),
    education:(force,scope)=>showTapToPayEducation(force,scope),
  }));
  const sdk=useStripeTerminal({
    onDidStartInstallingUpdate:()=>controller.progress('Configurazione di Tap to Pay su iPhone…'),
    onDidReportReaderSoftwareUpdateProgress:progress=>{
      const value=Number(progress);
      if(Number.isFinite(value))controller.progress(`Preparazione Tap to Pay · ${Math.round(Math.max(0,Math.min(1,value))*100)}%`);
    },
    onDidRequestReaderInput:()=>controller.progress('Avvicina la carta o il wallet alla parte superiore dell’iPhone.'),
    onDidRequestReaderDisplayMessage:()=>controller.progress('Segui le indicazioni sullo schermo di pagamento.'),
    onDidChangePaymentStatus:status=>{
      if(status==='processing')controller.progress('Pagamento in elaborazione. Attendi la conferma.');
    },
    onDidDisconnect:()=>controller.disconnected(),
    onDidStartReaderReconnect:()=>controller.progress('Connessione interrotta. Riconnessione Tap to Pay…'),
    onDidSucceedReaderReconnect:()=>controller.progress('Connessione Tap to Pay ripristinata.'),
    onDidFailReaderReconnect:()=>controller.disconnected(),
  });
  sdkRef.current=sdk;controllerRef.current=controller;
  useEffect(()=>{
    controller.setIdentity(identity);
    if(identity)void controller.warmup().catch(()=>{});
    const listener=AppState.addEventListener('change',state=>{
      if(state==='active' && identity)void controller.warmup().catch(()=>{});
    });
    return()=>{listener.remove();controller.setIdentity('');};
  },[identity,controller]);
  return <Session.Provider value={controller}>{children}</Session.Provider>;
}
function useSession() {
  const controller=useContext(Session);
  if(!controller)throw Error('Tap to Pay richiede l’accesso al salone.');
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  return {controller,state};
}
function Action({label,disabled,onPress,primary=false}:{label:string;disabled?:boolean;onPress:()=>void;primary?:boolean}) {
  return <HapticTouchable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,primary&&styles.primary,disabled&&{opacity:0.5}]}>
    <Text style={[styles.buttonText,primary&&{color:'#FFFFFF'}]}>{label}</Text>
  </HapticTouchable>;
}
export function IosTapToPaySetup() {
  const {controller,state}=useSession();
  const [helpOpen,setHelpOpen]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const activate=async()=>{
    try {
      await (state.ready?controller.warmup():controller.activate());
      if(mounted.current&&!controller.state.ready)Alert.alert('Attivazione non completata',controller.state.message);
    } catch(error) {
      if(mounted.current&&!(error instanceof Error&&error.message.includes('Accesso al salone cambiato')))Alert.alert('Tap to Pay',controller.state.message);
    }
  };
  return <View style={styles.setup}>
    <Text style={styles.title}>Tap to Pay su iPhone</Text>
    <Text style={styles.text}>Accetta carte contactless e wallet direttamente sul telefono. Attiva il lettore prima del primo incasso.</Text>
    {state.busy?<ActivityIndicator color="#244B85" accessibilityLabel="Verifica Tap to Pay in corso"/>:null}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {state.locations.length>1?state.locations.map(location=><Action key={location.id} disabled={state.busy||state.recovering} label={`${state.selected===location.id?'✓ ':''}${location.name}`} onPress={()=>void controller.select(location.id).catch(()=>{})}/>):null}
    <View style={styles.actions}>
      <View style={{flex:1}}><Action disabled={state.busy||state.recovering} label={state.ready?'Verifica telefono':'Attiva Tap to Pay'} primary onPress={()=>void activate()}/></View>
      <View style={{flex:1}}><Action label="Come si usa" onPress={()=>setHelpOpen(true)}/></View>
    </View>
    <Text style={styles.note}>L’attivazione e i termini Apple spettano al titolare del salone. Il pagamento parte solo scegliendo un incasso.</Text>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={helpOpen} transparent animationType="fade" onRequestClose={()=>setHelpOpen(false)}>
      <View style={styles.helpBackdrop}>
        <View accessibilityViewIsModal style={styles.helpSheet}>
          <View style={styles.helpHeader}>
            <Text accessibilityRole="header" style={styles.title}>Come usare Tap to Pay</Text>
            <Action label="Chiudi" onPress={()=>setHelpOpen(false)}/>
          </View>
          <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:16}}>
            {!state.selected?<View style={styles.helpNotice}><Text style={styles.helpNoticeTitle}>Prima configura la sede</Text><Text style={styles.text}>Nel conto Stripe del salone apri Terminal → Sedi e aggiungi la sede italiana. Poi torna in SalonPro, aggiorna lo stato e premi “Attiva Tap to Pay”.</Text></View>:null}
            <View style={styles.helpStep}><Text style={styles.helpNumber}>1</Text><View style={{flex:1,gap:4}}><Text style={styles.helpStepTitle}>Attiva il telefono</Text><Text style={styles.text}>Premi “Attiva Tap to Pay” e segui i passaggi mostrati. Il titolare autorizza la posizione e accetta i termini Apple quando richiesto.</Text></View></View>
            <View style={styles.helpStep}><Text style={styles.helpNumber}>2</Text><View style={{flex:1,gap:4}}><Text style={styles.helpStepTitle}>Scegli l’incasso</Text><Text style={styles.text}>In Cassa apri il movimento da saldare, scegli Tap to Pay e mostra l’importo al cliente.</Text></View></View>
            <View style={styles.helpStep}><Text style={styles.helpNumber}>3</Text><View style={{flex:1,gap:4}}><Text style={styles.helpStepTitle}>Avvicina la carta</Text><Text style={styles.text}>Il cliente avvicina la carta contactless o il wallet alla parte superiore dell’iPhone. Attendi la conferma del pagamento; il PIN viene richiesto sullo schermo quando necessario.</Text></View></View>
            <Text style={styles.note}>Se l’esito è incerto, verifica il pagamento prima di riprovare. Per cambiare metodo, verifica e annulla prima il tentativo aperto.</Text>
          </ScrollView>
          <Action label="Ho capito" primary onPress={()=>setHelpOpen(false)}/>
        </View>
      </View>
    </Modal>
  </View>;
}
export function IosTapToPayCheckout({movementId,disabled,onPaid,onBusyChange}:ContactlessProps) {
  const {controller,state}=useSession();
  const paidRef=useRef(onPaid);paidRef.current=onPaid;
  const movementRef=useRef(movementId);movementRef.current=movementId;
  useEffect(()=>{controller.observeMovement(movementId);},[movementId,controller]);
  useEffect(()=>{onBusyChange?.(state.busy);return()=>onBusyChange?.(false);},[state.busy,onBusyChange]);
  useEffect(()=>{
    const listener=AppState.addEventListener('change',value=>{
      if(value==='active' && !controller.state.busy)void controller.verify(movementId,()=>{if(movementRef.current===movementId)paidRef.current();}).catch(()=>{});
    });return()=>listener.remove();
  },[movementId,controller]);
  const run=(job:()=>Promise<unknown>)=>void job().catch(()=>{});
  return <View style={{gap:10}}>
    {state.busy?<ActivityIndicator color="#244B85" accessibilityLabel="Configurazione o pagamento in corso"/>:null}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{state.message}</Text>
    {state.movementId!==movementId || state.outcome!=='paid'?<Action label="Tap to Pay su iPhone" disabled={disabled||state.busy||state.recovering} primary onPress={()=>run(()=>controller.pay(movementId,onPaid))}/>:null}
    {state.busy?<Action label="Interrompi lettura" onPress={()=>run(()=>controller.cancelRead())}/>:null}
    <Action label="Verifica pagamento" disabled={disabled||state.busy} onPress={()=>run(()=>controller.verify(movementId,onPaid))}/>
    {state.movementId===movementId && state.receipt?<Action label="Condividi ricevuta di pagamento" disabled={state.busy} onPress={()=>void Share.share({message:state.receipt!}).catch(()=>{})}/>:null}
    {state.movementId!==movementId || state.outcome!=='paid'?<Action label="Annulla tentativo contactless" disabled={disabled||state.busy} onPress={()=>run(()=>controller.cancelAttempt(movementId,onPaid))}/>:null}
    <Text style={styles.note}>Se la carta richiede un altro metodo, verifica e annulla il tentativo prima di passare a QR / link. Nessun esito incerto viene segnato come pagato.</Text>
  </View>;
}
const styles=StyleSheet.create({
  setup:{backgroundColor:'#FFFFFF',borderRadius:22,padding:18,gap:10,marginVertical:10},
  title:{fontSize:17,fontWeight:'700',color:'#20364D'},text:{fontSize:13,lineHeight:19,color:'#52627A'},note:{fontSize:11,lineHeight:16,color:'#64748B'},
  actions:{flexDirection:'row',gap:10},button:{padding:13,borderRadius:15,backgroundColor:'#EFF4F9',alignItems:'center'},
  primary:{backgroundColor:'#20364D'},buttonText:{fontSize:14,fontWeight:'600',color:'#244B85'},
  helpBackdrop:{flex:1,justifyContent:'center',paddingHorizontal:20,paddingVertical:48,backgroundColor:'rgba(15,23,42,0.45)'},
  helpSheet:{width:'100%',maxWidth:480,maxHeight:'100%',alignSelf:'center',backgroundColor:'#FFFFFF',borderRadius:26,padding:20,gap:20},
  helpHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  helpStep:{flexDirection:'row',gap:12},helpNumber:{width:28,height:28,borderRadius:14,overflow:'hidden',textAlign:'center',lineHeight:28,fontWeight:'700',color:'#2457C5',backgroundColor:'#EAF1FF'},
  helpStepTitle:{fontSize:14,fontWeight:'700',color:'#20364D'},helpNotice:{padding:14,borderRadius:16,backgroundColor:'#FFF6E1',gap:6},helpNoticeTitle:{fontSize:14,fontWeight:'700',color:'#8A6216'},
});
