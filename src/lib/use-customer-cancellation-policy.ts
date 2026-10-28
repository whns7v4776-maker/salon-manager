import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { publicSupabase, supabase } from './supabase';

type Policy = { workspaceId: string; noticeMinutes: number; updatedAt: string | null };
export function useCustomerCancellationPolicy(salonCode: string) {
  const [policy, setPolicy] = useState<(Policy & { salonCode: string }) | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!salonCode) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const { data, error: rpcError } = await publicSupabase.rpc('get_customer_cancellation_policy', { p_salon_code: salonCode }).abortSignal(controller.signal);
      if (request !== generation.current) return;
      if (rpcError || !data || !Number.isInteger(data.noticeMinutes) || data.noticeMinutes < 0 || data.noticeMinutes > 10080) throw rpcError || new Error('policy_unavailable');
      setPolicy({ ...data, salonCode }); setError('');
    } catch {
      if (request === generation.current) setError('Impossibile aggiornare la regola. Controlla la connessione e riprova.');
    } finally { clearTimeout(timer); }
  }, [salonCode]);
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => { if (Platform.OS === 'web' ? !document.hidden : AppState.currentState === 'active') void refresh(); }, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const focus = () => { void refresh(); };
    if (Platform.OS === 'web') { window.addEventListener('focus', focus); window.addEventListener('online', focus); }
    return () => {
      generation.current++; clearInterval(poll); subscription.remove();
      if (Platform.OS === 'web') { window.removeEventListener('focus', focus); window.removeEventListener('online', focus); }
    };
  }, [refresh]);
  const workspaceId = policy?.salonCode === salonCode ? policy.workspaceId : null;
  useEffect(() => {
    if (!workspaceId) return;
    const channel = publicSupabase.channel(`cancellation-policy-${workspaceId}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_cancellation_policies', filter: `workspace_id=eq.${workspaceId}` }, () => { void refresh(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    return () => { void publicSupabase.removeChannel(channel); };
  }, [workspaceId, refresh]);
  const save = useCallback(async (minutes: number) => {
    const request = ++generation.current;
    const { data, error: saveError } = await supabase.rpc('set_customer_cancellation_policy', { p_salon_code: salonCode, p_notice_minutes: minutes });
    if (saveError || !data) throw saveError || new Error('policy_unavailable');
    if (request === generation.current) { setPolicy({ ...data, salonCode }); setError(''); }
    await refresh();
  }, [salonCode, refresh]);
  return { minutes: policy?.salonCode === salonCode ? policy.noticeMinutes : 30, ready: !!workspaceId && !error, error, refresh, save };
}
