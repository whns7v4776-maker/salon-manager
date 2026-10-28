import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Counts what is still "live" for customers: pending scheduled pushes and popups whose
 * period has not ended. Same reads as the Programmati / Popup tabs; `refreshKey` re-runs it.
 */
export function useActiveCustomerCommunications(refreshKey: unknown) {
  const [counts, setCounts] = useState<{ scheduled: number; popups: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const [scheduled, popups] = await Promise.all([
        supabase.from('scheduled_customer_communications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('customer_communications').select('id', { count: 'exact', head: true })
          .not('reminder_starts_at', 'is', null).is('reminder_cancelled_at', null).gt('reminder_ends_at', nowIso),
      ]);
      if (cancelled || scheduled.error || popups.error) return;
      setCounts({ scheduled: scheduled.count ?? 0, popups: popups.count ?? 0 });
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);
  return counts;
}
