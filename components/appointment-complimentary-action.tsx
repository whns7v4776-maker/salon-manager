import React, { useEffect, useRef, useState } from 'react';
import { useAccessAppearance } from './access-premium';
import { Text, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { packageMoney, refreshServicePackages, subscribePackageChanges } from '../src/lib/service-packages';
import { AppointmentBenefitConfirmation } from './appointment-benefit-confirmation';
import { AppointmentBenefitActionRow } from './appointment-benefit-action-row';

export function AppointmentComplimentaryAction({ appointmentId, workspaceId, save, inline = false }: { appointmentId: string; workspaceId: string; inline?: boolean; save: (id:string, expected:string, enabled:boolean)=>Promise<{ok:boolean;error?:string}> }) {
  const {palette:p}=useAccessAppearance();
  const [row, setRow] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setRow(null); setConfirm(false); setError('');
    const load = async () => {
      const {data, error} = await supabase.from('appointments').select('service_name,price,complimentary,complimentary_original_price,completed,no_show,cashed_in,updated_at').eq('id', appointmentId).eq('workspace_id', workspaceId).maybeSingle();
      if (active && !error) setRow(data);
    };
    void load();
    const unsubscribe = subscribePackageChanges(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, [appointmentId, workspaceId]);
  if (!row || row.no_show || (!row.complimentary && (Number(row.price) <= 0 || row.cashed_in || row.completed))) return null;
  const apply = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await save(appointmentId, row.updated_at, !row.complimentary);
      if (!result.ok) throw new Error(result.error);
      setConfirm(false); refreshServicePackages();
    } catch (e: any) { setError(e.message || 'Impossibile aggiornare il servizio. Riprova.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{gap: 6, marginBottom: inline ? 0 : 10, ...(inline ? {flexGrow:1,flexBasis:220,minWidth:0} : {})}}>
    {row.complimentary && <Text style={{color: p.night?'#B2D4BB':'#426B54', fontWeight: '700', fontSize: 13}}>Servizio in omaggio · 0 €</Text>}
    {!row.completed && !row.cashed_in ? <AppointmentBenefitActionRow title={row.complimentary ? 'Ripristina prezzo' : 'Segna come omaggio'} icon={row.complimentary ? 'refresh-outline' : 'gift-outline'} tone="blue" disabled={busy} onPress={() => { setError(''); setConfirm(true); }} /> : null}
    <AppointmentBenefitConfirmation visible={confirm} title={row.complimentary ? 'Ripristina il prezzo' : 'Conferma omaggio'} service={row.service_name} message={row.complimentary ? `Il prezzo torna a ${packageMoney(Math.round(Number(row.complimentary_original_price) * 100))}.` : 'Il prezzo di questo servizio diventa 0 €. Gli altri servizi restano da pagare. Pacchetti, gift card e premi non vengono utilizzati.'} confirmLabel={row.complimentary ? 'Ripristina' : 'Conferma omaggio'} busy={busy} error={error} onClose={() => setConfirm(false)} onConfirm={() => { void apply(); }} />
  </View>;
}
