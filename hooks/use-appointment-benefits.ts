import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { subscribePackageChanges } from '../src/lib/service-packages';

export type AppointmentBenefitKind = 'subscription' | 'gift' | 'loyalty' | 'complimentary';
// Reuse recent results without delaying appointment rendering or adding requests.
// Keep workspace isolation and a bounded, short-lived in-memory cache.
const recentBenefits = new Map<string, { at: number; map: Map<string, AppointmentBenefitKind[]> }>();
export function rememberConfirmedAppointmentBenefits(workspace: string, appointmentIds: string[], kind: AppointmentBenefitKind) {
  if (!workspace || !appointmentIds.length) return;
  const map = new Map(cachedBenefits(workspace));
  for (const id of appointmentIds) {
    const kinds = map.get(id) || [];
    if (!kinds.includes(kind)) map.set(id, [...kinds, kind]);
  }
  while (map.size > 1000) map.delete(map.keys().next().value!);
  recentBenefits.delete(workspace);
  recentBenefits.set(workspace, {at: Date.now(), map});
  while (recentBenefits.size > 4) recentBenefits.delete(recentBenefits.keys().next().value!);
}
function cachedBenefits(workspace: string) {
  const cached = recentBenefits.get(workspace);
  return cached && Date.now() - cached.at < 5 * 60_000 ? cached.map : new Map<string, AppointmentBenefitKind[]>();
}
export function useAppointmentBenefits(workspaceId: string, appointments: { id: string; bookingRequestId?: string }[]) {
  const signature = useMemo(() => JSON.stringify(appointments.map(a => [a.id, a.bookingRequestId || '']).sort()), [appointments]);
  const [result, setResult] = useState<{ workspace: string; map: Map<string, AppointmentBenefitKind[]> }>(() => ({ workspace: workspaceId, map: cachedBenefits(workspaceId) }));
  useFocusEffect(useCallback(() => {
    let current = true;
    let generation = 0;
    let running = false;
    let refreshAgain = false;
    const refresh = async () => {
      if (running) { refreshAgain = true; return; }
      running = true;
      const version = ++generation;
      const rows: [string, string][] = JSON.parse(signature);
      const ids = rows.map(([id]) => id).filter(id => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id));
      const requests = rows.map(([, id]) => id).filter(Boolean);
      if (!workspaceId || (!ids.length && !requests.length)) { if (current) setResult({ workspace: workspaceId, map: new Map() }); running = false; return; }
      const map = new Map<string, AppointmentBenefitKind[]>();
      const add = (id: string, kind: AppointmentBenefitKind) => {
        const values = map.get(id) || [];
        if (!values.includes(kind)) map.set(id, [...values, kind]);
      };
      try {
        for (let offset = 0; offset < ids.length; offset += 150) {
          const batch = ids.slice(offset, offset + 150);
          const responses = await Promise.all([
            supabase.from('appointments').select('id').eq('workspace_id', workspaceId).in('id', batch).eq('complimentary', true),
            supabase.from('service_package_booking_lines').select('appointment_id,request_id,service_package_redemptions!inner(state)').eq('workspace_id', workspaceId).in('appointment_id', batch),
            supabase.from('gift_card_uses').select('appointment_id,state').eq('workspace_id', workspaceId).in('appointment_id', batch).in('state', ['reserved', 'consumed']),
            supabase.from('loyalty_checkout_uses').select('appointment_id,state').eq('workspace_id', workspaceId).in('appointment_id', batch).in('state', ['reserved', 'consumed']),
          ]);
          if (responses.some(r => r.error)) throw new Error('Benefit lookup failed');
          for (const line of responses[0].data || []) add(line.id, 'complimentary');
          for (const line of responses[1].data || []) {
            const redemption = (line as any).service_package_redemptions;
            if (['reserved', 'consumed'].includes(redemption?.state)) add(line.appointment_id, 'subscription');
          }
          for (const line of responses[2].data || []) add(line.appointment_id, 'gift');
          for (const line of responses[3].data || []) add(line.appointment_id, 'loyalty');
        }
        // Pending requests can be rendered before the appointment link arrives.
        for (let offset = 0; offset < requests.length; offset += 150) {
          const { data, error } = await supabase.from('service_package_booking_lines').select('request_id,service_package_redemptions!inner(state)').eq('workspace_id', workspaceId).in('request_id', requests.slice(offset, offset + 150));
          if (error) throw error;
          for (const line of data || []) if (['reserved', 'consumed'].includes((line as any).service_package_redemptions?.state)) {
            for (const [id, request] of rows) if (request === line.request_id) add(id, 'subscription');
          }
          const otherUses = await Promise.all([
            supabase.from('gift_card_uses').select('request_id,state').eq('workspace_id', workspaceId).in('request_id', requests.slice(offset, offset + 150)).in('state', ['reserved', 'consumed']),
            supabase.from('loyalty_checkout_uses').select('request_id,state').eq('workspace_id', workspaceId).in('request_id', requests.slice(offset, offset + 150)).in('state', ['reserved', 'consumed']),
          ]);
          if (otherUses.some(response => response.error)) throw new Error('Request benefit lookup failed');
          for (const [index, response] of otherUses.entries()) for (const line of response.data || []) {
            for (const [id, request] of rows) if (request === line.request_id) add(id, index === 0 ? 'gift' : 'loyalty');
          }

        }
        if (current && version === generation) {
          const merged = new Map(cachedBenefits(workspaceId));
          for (const [id] of rows) merged.delete(id);
          for (const [id, kinds] of map) merged.set(id, kinds);
          while (merged.size > 1000) merged.delete(merged.keys().next().value!);
          recentBenefits.delete(workspaceId);
          recentBenefits.set(workspaceId, {at: Date.now(), map: merged});
          while (recentBenefits.size > 4) recentBenefits.delete(recentBenefits.keys().next().value!);
          setResult(previous => {
          const same = previous.workspace === workspaceId && previous.map.size === map.size && [...map].every(([id, values]) => JSON.stringify(values) === JSON.stringify(previous.map.get(id)));
          return same ? previous : { workspace: workspaceId, map };
        });
        }
      } catch (error) { console.warn('Agenda benefit badges:', error); }
      finally {
        running = false;
        if (current && refreshAgain) { refreshAgain = false; void refresh(); }
      }
    };
    void refresh();
    const unsubscribe = subscribePackageChanges(() => { void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { current = false; clearInterval(timer); unsubscribe(); foreground.remove(); };
  }, [workspaceId, signature]));
  return useMemo(() => {
    const map = new Map(cachedBenefits(workspaceId));
    if (result.workspace === workspaceId) for (const [id, kinds] of result.map) map.set(id, kinds);
    const visible = new Map<string, AppointmentBenefitKind[]>();
    for (const appointment of appointments) {
      const kinds = map.get(appointment.id);
      if (kinds) visible.set(appointment.id, kinds);
    }
    return visible;
  }, [workspaceId, result, signature]);
}
