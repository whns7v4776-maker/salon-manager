import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { publicSupabase } from './supabase';
import { customerPaymentToken, type PaymentIdentity } from './client-payment-session';
import { hasCustomerShopAttention } from './shop-pickup';
export function useCustomerShopAttention(identity: PaymentIdentity, enabled=true) {
  const key=[identity.salonCode,identity.email,identity.phone].join('|');
  const [value,setValue]=useState({key:'',active:false});
  useEffect(()=>{
    if(!enabled || !identity.salonCode) return;
    let stopped=false,running=false;
    const run=async()=>{
      if(stopped || running || AppState.currentState==='background' || (Platform.OS==='web' && document.visibilityState==='hidden')) return;
      running=true;
      try {
        const r=await publicSupabase.rpc('customer_shop_state',{p_salon_code:identity.salonCode,p_email:identity.email,p_phone:identity.phone,p_token:await customerPaymentToken(identity)});
        if(!r.error && !stopped) setValue({key,active:hasCustomerShopAttention(r.data?.orders??[])});
      } finally {running=false;}
    };
    const refresh=()=>{void run().catch(()=>{});};
    refresh();
    const timer=setInterval(refresh,15000);
    const app=AppState.addEventListener('change',s=>{if(s==='active')refresh();});
    const push=Notifications.addNotificationReceivedListener(n=>{if(n.request.content.data?.benefitEventId)refresh();});
    return ()=>{stopped=true;clearInterval(timer);app.remove();push.remove();};
  },[key,enabled]);
  return enabled && value.key===key && value.active;
}
