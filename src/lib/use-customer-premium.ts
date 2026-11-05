import { useCallback, useEffect, useMemo, useState } from 'react';
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
// One shared copy per salon: Clienti, Richieste and Agenda read the same summary,
// so the server is polled once every 30 seconds whatever the number of screens.
type Entry = { summary: Summary | null; error: string; loading: boolean; generation: number; listeners: Set<() => void>; stop?: () => void };
const entries = new Map<string, Entry>();
function entryFor(workspaceId: string): Entry {
  let entry = entries.get(workspaceId);
  if (!entry) { entry = { summary: null, error: '', loading: true, generation: 0, listeners: new Set() }; entries.set(workspaceId, entry); }
  return entry;
}
function notify(entry: Entry) { entry.listeners.forEach(listener => listener()); }
async function fetchSummary(workspaceId: string) {
  const entry = entryFor(workspaceId);
  const request = ++entry.generation;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const result = await supabase.rpc('get_owner_customer_badge_summary', { p_workspace_id: workspaceId }).abortSignal(controller.signal);
    if (request !== entry.generation) return;
    if (result.error || !validSummary(result.data, workspaceId)) throw result.error || new Error('invalid_summary');
    entry.summary = result.data; entry.error = '';
  } catch {
    if (request === entry.generation) entry.error = 'Impossibile caricare i badge. Controlla la connessione e riprova.';
  } finally {
    clearTimeout(timer);
    if (request === entry.generation) { entry.loading = false; notify(entry); }
  }
}
function subscribe(workspaceId: string, listener: () => void) {
  const entry = entryFor(workspaceId);
  entry.listeners.add(listener);
  if (entry.listeners.size === 1) {
    void fetchSummary(workspaceId);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void fetchSummary(workspaceId); });
    const focus = () => { void fetchSummary(workspaceId); };
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    const poll = setInterval(() => {
      if (Platform.OS === 'web' ? !document.hidden : AppState.currentState === 'active') void fetchSummary(workspaceId);
    }, 30000);
    entry.stop = () => { clearInterval(poll); subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('focus', focus); };
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) { entry.generation++; entry.stop?.(); entry.stop = undefined; }
  };
}

export function useCustomerPremium(workspaceId: string) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    return subscribe(workspaceId, () => setVersion(value => value + 1));
  }, [workspaceId]);
  const entry = workspaceId ? entryFor(workspaceId) : null;
  const refresh = useCallback(async () => { if (workspaceId) await fetchSummary(workspaceId); }, [workspaceId]);
  const save = useCallback(async (enabled:boolean,config:CustomerBadgePolicy) => {
    const validation=validateCustomerBadgePolicy(config);
    if(validation)throw new Error(validation);
    const target=entryFor(workspaceId);
    const request=++target.generation;
    const result=await supabase.rpc('set_owner_customer_badge_policy',{p_workspace_id:workspaceId,p_enabled:enabled,p_config:config});
    if(result.error||!validSummary(result.data,workspaceId))throw new Error('Salvataggio non riuscito. Nessuna modifica confermata.');
    if(request===target.generation){target.summary=result.data;target.error='';target.loading=false;notify(target);}
  },[workspaceId]);
  const summary = entry?.summary?.workspaceId === workspaceId ? entry.summary : null;
  const error = entry?.error ?? '';
  return { summary, ready: !!summary && !error, loading: workspaceId ? entry!.loading : false, error, refresh, save };
}

/** Badge of the customers, by customer id; empty while badges are off or not loaded. */
export function useCustomerBadgeMap(workspaceId: string) {
  const { summary, ready } = useCustomerPremium(workspaceId);
  return useMemo(
    () => new Map<string, CustomerPremiumStatus>(ready && summary?.enabled ? summary.customers.map(item => [item.customerId, item]) : []),
    [ready, summary],
  );
}
