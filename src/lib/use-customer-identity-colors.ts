import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cache = new Map<string, Map<string, string>>();
const pending = new Map<string, Promise<Map<string, string>>>();
const workspaceRequests = new Map<string, Promise<Map<string, string>>>();
const parseColors = (rows: unknown): Map<string, string> => {
  const colors = new Map<string, string>();
  if (!Array.isArray(rows)) return colors;
  const used = new Set<string>();
  for (const row of rows) {
    if (!UUID.test(row?.customer_id ?? '') || !/^#[0-9A-F]{6}$/.test(row?.color ?? '') || used.has(row.color)) continue;
    colors.set(`id:${row.customer_id.toLowerCase()}`, row.color);
    used.add(row.color);
  }
  return colors;
};

// Cache only server-assigned values, scoped to both owner and workspace.
// Never reassign colors from the visible subset, list order, names or contacts.
export function useCustomerIdentityColors(workspaceId: string, ownerEmail: string, customerIds: string[]) {
  const ownerKey = ownerEmail.trim().toLowerCase();
  const scope = `${ownerKey}:${workspaceId}`;
  const idsKey = customerIds.filter(id => UUID.test(id)).map(id => id.toLowerCase()).sort().join(',');
  const [result, setResult] = useState<{ scope: string; colors: Map<string, string> } | null>(null);

  useEffect(() => {
    if (!ownerKey || !UUID.test(workspaceId)) return;
    let active = true;
    const storageKey = `customer-identity-colors:v1:${scope}`;
    const commitColors = (colors: Map<string, string>) => {
      setResult(current => Platform.OS === 'ios' && current?.scope === scope &&
        current.colors.size === colors.size &&
        Array.from(colors).every(([key, color]) => current.colors.get(key) === color)
          ? current : { scope, colors });
    };
    const initial = cache.get(scope);
    if (initial) commitColors(initial);
    else void AsyncStorage.getItem(storageKey).then(raw => {
      if (!active || cache.has(scope) || !raw) return;
      try {
        const colors = parseColors(JSON.parse(raw));
        if (colors.size) commitColors(colors);
      } catch { /* A corrupt presentation cache must not block the app. */ }
    }).catch(() => {});

    const refresh = async () => {
      // Include the roster in the request key: a customer created while an
      // older fetch is in flight must cause another server allocation.
      const requestKey = `${scope}:${idsKey}`;
      let task = pending.get(requestKey);
      if (!task) {
        // Serialize snapshots per account so an older response cannot replace
        // newer assignments. Replace, rather than merge, to remove deleted IDs.
        const previous = workspaceRequests.get(scope);
        task = (async () => {
          if (previous) await previous.catch(() => {});
          const { data, error } = await supabase.rpc('get_owner_customer_identity_colors', { p_workspace_id: workspaceId });
          if (error) throw error;
          const colors = parseColors(data);
          cache.set(scope, colors);
          await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(colors, ([key, color]) => ({ customer_id: key.slice(3), color })))).catch(() => {});
          return colors;
        })();
        workspaceRequests.set(scope, task);
        pending.set(requestKey, task);
        void task.finally(() => {
          if (pending.get(requestKey) === task) pending.delete(requestKey);
          if (workspaceRequests.get(scope) === task) workspaceRequests.delete(scope);
        }).catch(() => {});
      }
      try {
        const colors = await task;
        if (active) commitColors(colors);
      } catch {
        // Keep confirmed cached colors; never fall back to the colliding hash.
      }
    };
    void refresh();
    const retry = setInterval(() => { if (active) void refresh(); }, 30000);
    return () => { active = false; clearInterval(retry); };
  }, [scope, ownerKey, workspaceId, idsKey]);

  return useMemo(() => result?.scope === scope ? result.colors : cache.get(scope) ?? new Map<string, string>(), [result, scope]);
}
