import {useAccessAppearance} from './access-premium';
import {NativeMedal} from './owner-premium-native-home';
import { CASH_STRIPE_FUNCTION } from '../src/lib/cash-stripe-function';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ActivityIndicator,Alert,AppState,Modal,ScrollView,Share,StyleSheet,Text,View} from 'react-native';
import {StripeTerminalProvider,useStripeTerminal} from '@stripe/stripe-terminal-react-native';
import * as Location from 'expo-location';
import {supabase} from '../src/lib/supabase';
import {IosTapToPayController} from '../src/lib/ios-tap-to-pay-controller';
import {showAppleTapToPayEducation, showTapToPayEducation} from '../src/lib/tap-to-pay-education';
import {callIosTerminal} from '../src/lib/ios-terminal-request';
import {HapticTouchable} from './ui/haptic-touchable';
import type {IosTapProviderProps} from './ios-tap-to-pay-provider';
import type {ContactlessProps} from './cash-contactless';

const Session=createContext<IosTapToPayController|null>(null);
async function call(action:string,extra:Record<string,unknown>={}) {
  return callIosTerminal((body,options)=>supabase.functions.invoke(CASH_STRIPE_FUNCTION,{body,...options}),action,extra,action==='terminal-status'?15000:30000);
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
function useTapTheme(){
  const {palette:p}=useAccessAppearance();
  const n=p.night;
  return {p,n,ink:p.ink,muted:p.muted,surface:n?'rgba(38,41,43,.92)':'rgba(255,253,250,.9)',edge:n?p.border:'rgba(122,100,70,.2)',bronze:n?'#9C8461':'#7A6446',wash:n?'rgba(156,132,97,.16)':'rgba(122,100,70,.09)',field:n?'rgba(255,255,255,.04)':'#FFFFFF'};
}
function Action({label,disabled,onPress,primary=false}:{label:string;disabled?:boolean;onPress:()=>void;primary?:boolean}) {
  const t=useTapTheme();
  return <HapticTouchable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,{borderWidth:1,borderColor:primary?t.p.action:t.edge,backgroundColor:primary?t.p.action:t.field},disabled&&{opacity:0.5}]}>
    <Text style={[styles.buttonText,{color:primary?t.p.actionText:t.ink}]}>{label}</Text>
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
  const t=useTapTheme();
  return <View style={[styles.setup,{backgroundColor:t.surface,borderWidth:1,borderColor:t.edge}]}>
    <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
      <NativeMedal icon="phone-portrait-outline" size={44} iconSize={20} accent={t.n?'#9DBAD6':'#4D6E8F'}/>
      <View style={{flex:1,minWidth:0,gap:2}}>
        <Text style={[styles.title,{color:t.ink}]}>Tap to Pay su iPhone</Text>
        <Text style={[styles.text,{color:t.muted}]}>Carte contactless e wallet direttamente sul telefono.</Text>
      </View>
    </View>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:8,padding:12,borderRadius:14,backgroundColor:t.field,borderWidth:1,borderColor:t.edge}}>
      {state.busy?<ActivityIndicator color={t.bronze} accessibilityLabel="Verifica Tap to Pay in corso"/>:<View style={{width:8,height:8,borderRadius:4,marginTop:6,backgroundColor:state.ready?(t.n?'#86C2BE':'#3E7C7A'):'#C9A35A'}}/>}
      <Text accessibilityLiveRegion="polite" style={[styles.text,{flex:1,color:t.ink}]}>{state.message}</Text>
    </View>
    {state.locations.length>1?state.locations.map(location=><Action key={location.id} disabled={state.busy||state.recovering} label={`${state.selected===location.id?'✓ ':''}${location.name}`} onPress={()=>void controller.select(location.id).catch(()=>{})}/>):null}
    <View style={styles.actions}>
      <View style={{flex:1}}><Action disabled={state.busy||state.recovering} label={state.ready?'Verifica telefono':'Attiva Tap to Pay'} primary onPress={()=>void activate()}/></View>
      {/* Apple's official guide first (required for review); our own steps only if it is unavailable. */}
      <View style={{flex:1}}><Action label="Come si usa" onPress={()=>{void showAppleTapToPayEducation().then(shown=>{if(!shown&&mounted.current)setHelpOpen(true);});}}/></View>
    </View>
    <Text style={[styles.note,{color:t.muted}]}>L’attivazione e i termini Apple spettano al titolare del salone. Il pagamento parte solo scegliendo un incasso.</Text>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={helpOpen} transparent animationType="fade" onRequestClose={()=>setHelpOpen(false)}>
      <View style={[styles.helpBackdrop,{backgroundColor:t.n?'rgba(0,0,0,.55)':'rgba(40,35,29,.32)'}]}>
        <View accessibilityViewIsModal style={[styles.helpSheet,{backgroundColor:t.n?'#202426':'#F5F2EC',borderWidth:1,borderColor:t.edge}]}>
          <View style={styles.helpHeader}>
            <View style={{flexDirection:'row',alignItems:'center',gap:12,flex:1,minWidth:0}}>
              <NativeMedal icon="phone-portrait-outline" size={40} iconSize={18} accent={t.n?'#9DBAD6':'#4D6E8F'}/>
              <Text accessibilityRole="header" style={{flex:1,fontSize:20,fontFamily:'Georgia',color:t.ink}}>Come usare Tap to Pay</Text>
            </View>
            <HapticTouchable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={()=>setHelpOpen(false)} style={{width:40,height:40,borderRadius:20,borderWidth:1,borderColor:t.edge,backgroundColor:t.field,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:22,lineHeight:24,color:t.ink}}>×</Text></HapticTouchable>
          </View>
          <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:12}}>
            {!state.selected?<View style={{flexDirection:'row',gap:10,padding:14,borderRadius:14,borderWidth:1,borderColor:t.n?'rgba(214,178,122,.35)':'rgba(140,106,53,.3)',backgroundColor:t.n?'rgba(214,178,122,.08)':'rgba(140,106,53,.06)'}}><View style={{width:8,height:8,borderRadius:4,marginTop:6,backgroundColor:'#C9A35A'}}/><View style={{flex:1,gap:4}}><Text style={{fontSize:14,fontWeight:'600',color:t.ink}}>Prima serve la sede</Text><Text style={[styles.text,{color:t.muted}]}>La sede italiana del salone in Stripe → Terminal → Sedi. Poi aggiorna lo stato e premi “Attiva Tap to Pay”.</Text></View></View>:null}
            <View style={{borderRadius:16,borderWidth:1,borderColor:t.edge,backgroundColor:t.surface,overflow:'hidden'}}>
              {([
                ['1','Attiva il telefono','Premi “Attiva Tap to Pay” e segui i passaggi. Il titolare autorizza la posizione e accetta i termini Apple quando richiesto.'],
                ['2','Scegli l’incasso','Apri l’appuntamento o il movimento da saldare, tocca Tap to Pay e mostra l’importo al cliente.'],
                ['3','Avvicina la carta','Il cliente avvicina carta contactless o wallet alla parte alta dell’iPhone. Se serve, il PIN si inserisce sullo schermo.'],
              ] as const).map(([n,title,body],index)=><View key={n} style={{flexDirection:'row',gap:12,padding:14,borderTopWidth:index?1:0,borderTopColor:t.p.line}}>
                <View style={{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:t.bronze,backgroundColor:t.wash}}><Text style={{fontSize:14,fontWeight:'600',color:t.ink}}>{n}</Text></View>
                <View style={{flex:1,gap:3}}><Text style={{fontSize:15,fontWeight:'600',color:t.ink}}>{title}</Text><Text style={[styles.text,{color:t.muted}]}>{body}</Text></View>
              </View>)}
            </View>
            <Text style={[styles.note,{color:t.muted}]}>Se l’esito è incerto, verifica il pagamento prima di riprovare. Per cambiare metodo, verifica e annulla prima il tentativo aperto.</Text>
          </ScrollView>
          <Action label="Ho capito" primary onPress={()=>setHelpOpen(false)}/>
        </View>
      </View>
    </Modal>
  </View>;
}
export function IosTapToPayCheckout({movementId,disabled,onPaid,onBusyChange,autoStart}:ContactlessProps) {
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
  const t=useTapTheme();
  const run=(job:()=>Promise<unknown>)=>void job().catch(()=>{});
  // One-tap checkout: the merchant already chose Tap to Pay, so open the reader once.
  const autoStarted=useRef(false);
  useEffect(()=>{
    if(!autoStart||autoStarted.current||disabled||state.busy||state.recovering)return;
    if(state.movementId===movementId&&state.outcome==='paid')return;
    autoStarted.current=true;
    run(()=>controller.pay(movementId,onPaid));
  },[autoStart,disabled,state.busy,state.recovering,state.movementId,state.outcome,movementId,controller,onPaid]);
  return <View style={{gap:10}}>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:8,padding:12,borderRadius:14,backgroundColor:t.field,borderWidth:1,borderColor:t.edge}}>
      {state.busy?<ActivityIndicator color={t.bronze} accessibilityLabel="Configurazione o pagamento in corso"/>:<View style={{width:8,height:8,borderRadius:4,marginTop:6,backgroundColor:state.outcome==='paid'?(t.n?'#86C2BE':'#3E7C7A'):'#C9A35A'}}/>}
      <Text accessibilityLiveRegion="polite" style={[styles.text,{flex:1,color:t.ink}]}>{state.message}</Text>
    </View>
    {state.movementId!==movementId || state.outcome!=='paid'?<Action label="Tap to Pay su iPhone" disabled={disabled||state.busy||state.recovering} primary onPress={()=>run(()=>controller.pay(movementId,onPaid))}/>:null}
    {state.busy?<Action label="Interrompi lettura" onPress={()=>run(()=>controller.cancelRead())}/>:null}
    <Action label="Verifica pagamento" disabled={disabled||state.busy} onPress={()=>run(()=>controller.verify(movementId,onPaid))}/>
    {state.movementId===movementId && state.receipt?<Action label="Condividi ricevuta di pagamento" disabled={state.busy} onPress={()=>void Share.share({message:state.receipt!}).catch(()=>{})}/>:null}
    {state.movementId!==movementId || state.outcome!=='paid'?<Action label="Annulla tentativo contactless" disabled={disabled||state.busy} onPress={()=>run(()=>controller.cancelAttempt(movementId,onPaid))}/>:null}
    <Text style={[styles.note,{color:t.muted}]}>Se la carta richiede un altro metodo, verifica e annulla il tentativo prima di passare a QR / link. Nessun esito incerto viene segnato come pagato.</Text>
  </View>;
}
const styles=StyleSheet.create({
  setup:{borderRadius:18,padding:16,gap:12,marginVertical:10},
  title:{fontSize:16,fontWeight:'600'},text:{fontSize:13,lineHeight:19},note:{fontSize:12,lineHeight:17},
  actions:{flexDirection:'row',gap:10},button:{minHeight:46,padding:12,borderRadius:13,alignItems:'center',justifyContent:'center'},
  buttonText:{fontSize:14,fontWeight:'600'},
  helpBackdrop:{flex:1,justifyContent:'center',paddingHorizontal:20,paddingVertical:48,backgroundColor:'rgba(15,23,42,0.45)'},
  helpSheet:{width:'100%',maxWidth:480,maxHeight:'100%',alignSelf:'center',backgroundColor:'#FFFFFF',borderRadius:26,padding:20,gap:20},
  helpHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  helpStep:{flexDirection:'row',gap:12},helpNumber:{width:28,height:28,borderRadius:14,overflow:'hidden',textAlign:'center',lineHeight:28,fontWeight:'700',color:'#2457C5',backgroundColor:'#EAF1FF'},
  helpStepTitle:{fontSize:14,fontWeight:'700',color:'#20364D'},helpNotice:{padding:14,borderRadius:16,backgroundColor:'#FFF6E1',gap:6},helpNoticeTitle:{fontSize:14,fontWeight:'700',color:'#8A6216'},
});
