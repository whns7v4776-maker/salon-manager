import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

export type CustomerConsent = {
  id: string;
  notification_permission: string | null;
  notification_permission_checked_at: string | null;
};
type Entry = {
  rows: Map<string, CustomerConsent>;
  listeners: Set<() => void>;
  stop?: () => void;
};
const entries = new Map<string, Entry>();
const PERMISSIONS = new Set(['granted', 'denied', 'undetermined']);
const LOAD_TIMEOUT_MS = 15000;

function consentRow(value: unknown): CustomerConsent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id.trim()) return null;
  if (row.notification_permission !== null &&
    (typeof row.notification_permission !== 'string' || !PERMISSIONS.has(row.notification_permission))) return null;
  if (row.notification_permission_checked_at !== null &&
    (typeof row.notification_permission_checked_at !== 'string' ||
      !Number.isFinite(Date.parse(row.notification_permission_checked_at)))) return null;
  return {
    id: row.id,
    notification_permission: row.notification_permission,
    notification_permission_checked_at: row.notification_permission_checked_at,
  };
}

function sameConsent(left: CustomerConsent | undefined, right: CustomerConsent | undefined) {
  return left?.notification_permission === right?.notification_permission &&
    left?.notification_permission_checked_at === right?.notification_permission_checked_at &&
    left?.id === right?.id;
}

function start(workspaceId: string, current: Entry) {
  let live = true;
  let pending = false;
  let trailing = false;
  let sequence = 0;
  let cancelPending: (() => void) | undefined;
  // Tombstones also protect deletions from an older in-flight snapshot.
  const revisions = new Map<string, number>();
  const notify = () => current.listeners.forEach(listener => listener());
  const foreground = () => (!AppState.currentState || AppState.currentState === 'active') &&
    (typeof document === 'undefined' || document.visibilityState !== 'hidden');

  const load = async () => {
    if (!live || !foreground()) return;
    if (pending) { trailing = true; return; }
    pending = true;
    const startedAt = sequence;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelRequest: (() => void) | undefined;
    try {
      const controller = typeof AbortController === 'undefined' ? null : new AbortController();
      const query = supabase.from('customers')
        .select('id,notification_permission,notification_permission_checked_at')
        .eq('workspace_id', workspaceId);
      const request = controller ? query.abortSignal(controller.signal) : query;
      const timeout = new Promise<null>(resolve => {
        cancelRequest = () => {
          if (requestTimer !== undefined) clearTimeout(requestTimer);
          controller?.abort();
          resolve(null);
        };
        cancelPending = cancelRequest;
        requestTimer = setTimeout(cancelRequest, LOAD_TIMEOUT_MS);
      });
      // Race as well as abort: focus/online must be able to retry even if a
      // transport ignores cancellation or never settles its HTTP promise.
      const result = await Promise.race([request, timeout]);
      if (!result) return;
      const { data, error } = result;
      if (!live || error || !Array.isArray(data)) return;
      const rows = data.map(consentRow);
      // An incomplete response must not erase previously verified consent.
      if (rows.some(row => row === null)) return;
      const next = new Map<string, CustomerConsent>();
      rows.forEach(row => { if (row) next.set(row.id, row); });
      revisions.forEach((revision, id) => {
        if (revision <= startedAt) return;
        const row = current.rows.get(id);
        if (row) next.set(id, row);
        else next.delete(id);
      });
      const changed = current.rows.size !== next.size ||
        [...next].some(([id, row]) => !sameConsent(current.rows.get(id), row));
      current.rows = next;
      if (changed) notify();
      revisions.forEach((revision, id) => { if (revision <= startedAt) revisions.delete(id); });
    } catch {
      // Offline or expired owner sessions preserve the last confirmed state.
    } finally {
      if (requestTimer !== undefined) clearTimeout(requestTimer);
      if (cancelPending === cancelRequest) cancelPending = undefined;
      pending = false;
      if (live && trailing) { trailing = false; void load(); }
    }
  };

  const channel = supabase.channel(`workspace-customer-consent-${workspaceId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'customer_notification_consent_updates',
      filter: `workspace_id=eq.${workspaceId}`,
    }, payload => {
      if (!live) return;
      const value = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!value || typeof value !== 'object') return;
      if (value.workspace_id != null && value.workspace_id !== workspaceId) return;
      if (payload.eventType === 'DELETE') {
        const id = value.id;
        // With RLS, DELETE can contain only the primary key. Unknown IDs cannot
        // affect this workspace, even if the transport sends an unfiltered delete.
        if (typeof id !== 'string' || !id.trim() ||
          (value.workspace_id !== workspaceId && !current.rows.has(id) && !revisions.has(id))) return;
        revisions.set(id, ++sequence);
        if (current.rows.delete(id)) notify();
        return;
      }
      if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
      if (value.workspace_id !== workspaceId) return;
      const row = consentRow(value);
      if (!row) return;
      revisions.set(row.id, ++sequence);
      const changed = !sameConsent(current.rows.get(row.id), row);
      current.rows.set(row.id, row);
      if (changed) notify();
    })
    .subscribe(status => {
      // Also runs after reconnect: refresh closes the gap before the channel was ready.
      if (status === 'SUBSCRIBED') void load();
    });

  const active = AppState.addEventListener('change', state => {
    if (state === 'active') void load();
  });
  const resume = () => { if (foreground()) void load(); };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof window.removeEventListener === 'function') {
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', resume);
  // One foreground-only safety poll per workspace, never one per customer card.
  const timer = setInterval(resume, 60000);
  current.stop = () => {
    live = false;
    cancelPending?.();
    cancelPending = undefined;
    clearInterval(timer);
    active.remove();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', resume);
    void supabase.removeChannel(channel);
    if (entries.get(workspaceId) === current) entries.delete(workspaceId);
  };
  void load();
}

export function useCustomerConsent(workspaceId: string, customerId: string) {
  const [, update] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let entry = entries.get(workspaceId);
    if (!entry) {
      entry = { rows: new Map(), listeners: new Set() };
      entries.set(workspaceId, entry);
    }
    const current = entry;
    const listener = () => update(value => value + 1);
    current.listeners.add(listener);
    if (!current.stop) start(workspaceId, current);
    return () => {
      current.listeners.delete(listener);
      if (!current.listeners.size) current.stop?.();
    };
  }, [workspaceId]);
  return entries.get(workspaceId)?.rows.get(customerId) ?? null;
}
