import { useEffect, useRef, useState } from 'react';
import { useAccessAppearance } from './access-premium';
import type { AppearanceMode } from './access-appearance-context';
import { readCustomerAppearance, saveCustomerAppearance } from '../src/lib/customer-appearance';
import type { PaymentIdentity } from '../src/lib/client-payment-session';

/** Loads never write a default back; user changes (including quick toggles) do. */
export function useCustomerAppearance(identity: PaymentIdentity | null) {
  const { setMode, subscribeModeChanges } = useAccessAppearance();
  const apply = useRef(setMode);
  apply.current = setMode;
  const pending = useRef(new Map<string, AppearanceMode>());
  const [revision, retry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const salonCode = identity?.salonCode.trim().toLowerCase() || '';
  const email = identity?.email.trim().toLowerCase() || '';
  const phone = identity?.phone.replace(/\D/g, '').slice(-10) || '';
  useEffect(() => {
    if (!salonCode || !email || !phone) return;
    let active = true;
    let edits = 0;
    const customer = { salonCode, email, phone };
    const key = JSON.stringify(customer);
    const fail = (error: unknown) => {
      if (active) { setStatus('error'); setMessage(error instanceof Error ? error.message : 'Sincronizzazione non riuscita. Riprova.'); }
    };
    const save = async (mode: AppearanceMode, edit: number) => {
      if (!active) return;
      await saveCustomerAppearance(customer, mode);
      if (active && edit === edits) { pending.current.delete(key); setStatus('saved'); setMessage('Preferenza salvata sul tuo profilo.'); }
    };
    setStatus('loading'); setMessage('Caricamento dell’aspetto salvato…');
    let queue: Promise<void> = (async () => {
      const unsaved = pending.current.get(key);
      if (unsaved) { await save(unsaved, 0); return; }
      const saved = await readCustomerAppearance(customer);
      if (!active || edits > 0) return;
      apply.current(saved, { localOnly: true });
      setStatus('saved'); setMessage('Preferenza salvata sul tuo profilo.');
    })().catch(fail);
    const unsubscribe = subscribeModeChanges(mode => {
      const edit = ++edits;
      pending.current.set(key, mode);
      setStatus('saving'); setMessage('Salvataggio della preferenza…');
      queue = queue.catch(() => {}).then(() => save(mode, edit)).catch(fail);
    });
    return () => { active = false; unsubscribe(); };
  }, [salonCode, email, phone, revision, subscribeModeChanges]);
  return { status, message, retry: () => retry(value => value + 1) };
}
