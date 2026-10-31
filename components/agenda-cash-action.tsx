import React, {useEffect,useRef,useState} from 'react';
import {useAccessAppearance} from './access-premium';
import {Ionicons} from '@expo/vector-icons';
import {Text,View} from 'react-native';
import {tapToPayDeviceCapable,useQuickCheckout} from '../src/lib/use-quick-checkout';
import {HapticTouchable} from './ui/haptic-touchable';
import {CashStripePanel} from './cash-stripe-panel';
import {supabase} from '../src/lib/supabase';
import {subscribePackageChanges} from '../src/lib/service-packages';
export function AgendaCashAction({appointmentId,workspaceId,onCheckoutActiveChange}:{appointmentId:string;workspaceId:string;onCheckoutActiveChange?:(active:boolean)=>void}) {
 const {palette:p}=useAccessAppearance();
 const [movement,setMovement]=useState<{id:string;importo:number}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const [covered,setCovered]=useState(false);
 const [method,setMethod]=useState<'checkout'|'terminal'>('checkout');
 const {quick}=useQuickCheckout(workspaceId);
 // Until the readiness check answers, a Tap to Pay capable iPhone keeps the reader as the quick button.
 const tapToPayAvailable=quick===null?tapToPayDeviceCapable():quick==='terminal';
 const qrReady=quick==='checkout';
 useEffect(()=>{onCheckoutActiveChange?.(!!movement&&!covered);return()=>onCheckoutActiveChange?.(false);},[movement?.id,covered,onCheckoutActiveChange]);
 useEffect(()=>{let current=true;const refresh=()=>{if(workspaceId!=='d84f3211-d20f-45a3-9d7f-f551400690fd')return;void supabase.from('appointments').select('price').eq('id',appointmentId).eq('workspace_id',workspaceId).maybeSingle().then(({data})=>{if(current)setCovered(!!data&&Number(data.price)<=0);});};refresh();const unsubscribe=subscribePackageChanges(refresh);return()=>{current=false;unsubscribe();};},[appointmentId,workspaceId]);
 if(workspaceId!=='d84f3211-d20f-45a3-9d7f-f551400690fd')return null;
 if(covered)return null;
 const open=async(next:'checkout'|'terminal')=>{if(lock.current)return;lock.current=true;setMethod(next);setBusy(true);setError('');try{const {data,error:e}=await supabase.functions.invoke('cash-stripe',{body:{action:'appointment',movementId:appointmentId},timeout:30000});if(e||data?.error)throw Error(data?.error||'Apri la Cassa per verificare il pagamento.');setMovement(data.movement);}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}};
 const action=(next:'checkout'|'terminal',label:string,icon:React.ComponentProps<typeof Ionicons>['name'],primary:boolean)=><HapticTouchable key={next} accessibilityRole="button" disabled={busy} onPress={()=>void open(next)} style={{flexGrow:1,flexBasis:primary?'100%':120,padding:12,minHeight:primary?54:48,borderRadius:14,backgroundColor:primary?p.action:p.night?'#363B3E':'#E6DCCB',borderWidth:1,borderColor:primary?p.action:p.night?'#5A5F62':'#BFAE92',flexDirection:'row',justifyContent:'center',gap:8,alignItems:'center',opacity:busy?0.5:1}}><Ionicons name={icon} size={primary?20:18} color={primary?p.actionText:p.ink}/><Text style={{color:primary?p.actionText:p.ink,fontSize:primary?15:14,fontWeight:'600'}}>{busy&&method===next?'Preparazione…':label}</Text></HapticTouchable>;
 // Fastest method first: Tap to Pay opens the reader in one tap (QR / link beside it); without Tap to Pay,
 // QR / link leads when Stripe is ready and creates the code straight away; otherwise the classic Incassa.
 return <View style={{gap:8}}>{!movement ? <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{tapToPayAvailable?[action('terminal','Tap to Pay su iPhone','phone-portrait-outline',true),action('checkout','QR / link','qr-code-outline',false)]:action('checkout',qrReady?'QR / link':'Incassa',qrReady?'qr-code-outline':'wallet-outline',true)}</View> : null}{error?<Text accessibilityRole="alert" style={{color:'#B42332'}}>{error}</Text>:null}{movement?<CashStripePanel modalOnly inlineCheckout preferredMethod={tapToPayAvailable||qrReady?method:undefined} autoStart={tapToPayAvailable||qrReady} movement={movement} onClose={()=>setMovement(null)}/>:null}</View>;
}
