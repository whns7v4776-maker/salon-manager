import React, {useEffect,useRef,useState} from 'react';
import {useAccessAppearance} from './access-premium';
import {Ionicons} from '@expo/vector-icons';
import {Text,View} from 'react-native';
import {HapticTouchable} from './ui/haptic-touchable';
import {CashStripePanel} from './cash-stripe-panel';
import {supabase} from '../src/lib/supabase';
import {subscribePackageChanges} from '../src/lib/service-packages';
export function AgendaCashAction({appointmentId,workspaceId,onCheckoutActiveChange}:{appointmentId:string;workspaceId:string;onCheckoutActiveChange?:(active:boolean)=>void}) {
 const {palette:p}=useAccessAppearance();
 const [movement,setMovement]=useState<{id:string;importo:number}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const [covered,setCovered]=useState(false);
 useEffect(()=>{onCheckoutActiveChange?.(!!movement&&!covered);return()=>onCheckoutActiveChange?.(false);},[movement?.id,covered,onCheckoutActiveChange]);
 useEffect(()=>{let current=true;const refresh=()=>{if(workspaceId!=='d84f3211-d20f-45a3-9d7f-f551400690fd')return;void supabase.from('appointments').select('price').eq('id',appointmentId).eq('workspace_id',workspaceId).maybeSingle().then(({data})=>{if(current)setCovered(!!data&&Number(data.price)<=0);});};refresh();const unsubscribe=subscribePackageChanges(refresh);return()=>{current=false;unsubscribe();};},[appointmentId,workspaceId]);
 if(workspaceId!=='d84f3211-d20f-45a3-9d7f-f551400690fd')return null;
 if(covered)return null;
 return <View style={{gap:8}}>{!movement ? <HapticTouchable accessibilityRole="button" disabled={busy} style={{padding:12,minHeight:48,borderRadius:14,backgroundColor:p.action,borderWidth:1,borderColor:p.action,flexDirection:'row',justifyContent:'center',gap:8,alignItems:'center',opacity:busy?0.5:1}} onPress={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const {data,error:e}=await supabase.functions.invoke('cash-stripe',{body:{action:'appointment',movementId:appointmentId},timeout:30000});if(e||data?.error)throw Error(data?.error||'Apri la Cassa per verificare il pagamento.');setMovement(data.movement);}catch(e){setError(e instanceof Error?e.message:'Operazione non riuscita.');}finally{lock.current=false;setBusy(false);}}}><Ionicons name="wallet-outline" size={18} color={p.actionText}/><Text style={{color:p.actionText,fontSize:14,fontWeight:'600'}}>{busy?'Verifica incasso…':'Incassa'}</Text></HapticTouchable> : null}{error?<Text accessibilityRole="alert" style={{color:'#B42332'}}>{error}</Text>:null}{movement?<CashStripePanel modalOnly inlineCheckout movement={movement} onClose={()=>setMovement(null)}/>:null}</View>;
}
