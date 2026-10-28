import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { validateCustomerBadgePolicy, type CustomerBadgePolicy, type BadgeTierRule } from './customer-badge-policy';

export type CustomerPremiumStatus = {
 customerId:string; completedVisits:number; spentCents:number; bookings:number; cancellations:number; noShows:number;
 tier:string|null; label:string|null; cancellationAlert:boolean; noShowAlert:boolean; rule?:BadgeTierRule|null;
};
type Summary = { workspaceId:string; enabled:boolean; config:CustomerBadgePolicy; customers:CustomerPremiumStatus[] };
function validSummary(value:any,workspace:string):value is Summary {
 try {
  return value?.workspaceId===workspace && typeof value.enabled==='boolean' && !validateCustomerBadgePolicy(value.config)
   && Array.isArray(value.customers) && value.customers.every((item:any)=>typeof item.customerId==='string'
    && ['completedVisits','spentCents','bookings','cancellations','noShows'].every(key=>Number.isSafeInteger(item[key])&&item[key]>=0)
    && (item.tier===null||['standard','frequente','premium','top_premium'].includes(item.tier))
    && typeof item.cancellationAlert==='boolean' && typeof item.noShowAlert==='boolean');
 } catch { return false; }
}
export function useCustomerPremium(workspaceId: string) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!workspaceId) { setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const result = await supabase.rpc('get_owner_customer_badge_summary', { p_workspace_id: workspaceId }).abortSignal(controller.signal);
      if (request !== generation.current) return;
      if (result.error || !validSummary(result.data, workspaceId)) throw result.error || new Error('invalid_summary');
      setSummary(result.data); setError('');
    } catch {
      if (request === generation.current) setError('Impossibile caricare i badge. Controlla la connessione e riprova.');
    } finally {
      clearTimeout(timer);
      if (request === generation.current) setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => {
    setSummary(null); setLoading(true); setError(''); void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const focus = () => { void refresh(); };
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    const poll = setInterval(() => {
      if (Platform.OS === 'web' ? !document.hidden : AppState.currentState === 'active') void refresh();
    }, 30000);
    return () => { invalidate(); clearInterval(poll); subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('focus', focus); };
  }, [refresh,invalidate]);
  const save = useCallback(async (enabled:boolean,config:CustomerBadgePolicy) => {
    const validation=validateCustomerBadgePolicy(config);
    if(validation)throw new Error(validation);
    const request=++generation.current;
    const result=await supabase.rpc('set_owner_customer_badge_policy',{p_workspace_id:workspaceId,p_enabled:enabled,p_config:config});
    if(result.error||!validSummary(result.data,workspaceId))throw new Error('Salvataggio non riuscito. Nessuna modifica confermata.');
    if(request===generation.current){setSummary(result.data);setError('');}
  },[workspaceId]);
  const current = summary?.workspaceId === workspaceId ? summary : null;
  return { summary: current, ready: !!current && !error, loading, error, refresh, save };
}
