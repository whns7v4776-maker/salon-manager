import { useAccessAppearance } from './access-premium';
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import {
  refreshServicePackages,
  type CustomerPackage,
} from "../src/lib/service-packages";
import { Ionicons } from '@expo/vector-icons';
import { AppointmentBenefitConfirmation } from './appointment-benefit-confirmation';
import { AppointmentBenefitActionRow } from './appointment-benefit-action-row';
export function AppointmentPackageAction({
  appointmentId,
  workspaceId,
}: {
  appointmentId: string;
  workspaceId: string;
}) {
  const {palette:p}=useAccessAppearance();
  const [loading,setLoading]=useState(true);
  const [covered, setCovered] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);setCovered('');setOptions([]);setError('');
    void (async () => {
      const { data: a } = await supabase
        .from("appointments")
        .select(
          "customer_id,booking_request_id,completed,no_show,cashed_in,appointment_date,service_name",
        )
        .eq("id", appointmentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (!a || !current) return;
      const { data: line } = await supabase
        .from("service_package_booking_lines")
        .select("redemption_id")
        .eq("workspace_id", workspaceId)
        .or(
          `appointment_id.eq.${appointmentId}${a.booking_request_id ? `,request_id.eq.${a.booking_request_id}` : ""}`,
        )
        .maybeSingle();
      if (line) {
        const { data: r } = await supabase
          .from("service_package_redemptions")
          .select("state")
          .eq("id", line.redemption_id)
          .maybeSingle();
        if (current) {
          setCovered(
            r?.state === "consumed"
              ? "Pacchetto · utilizzo effettuato"
              : r?.state === "released"
                ? "Pacchetto · utilizzo restituito"
                : "Incluso nel pacchetto · utilizzo prenotato",
          );
          setOptions([]);
        }
        return;
      }
      if (a.completed || a.no_show || a.cashed_in || !a.customer_id) return;
      const { data: wallet } = await supabase.rpc("owner_customer_benefits", {
        p_customer: a.customer_id,
      });
      if (!current) return;
      setOptions(
        (wallet?.packages ?? [])
          .filter(
            (p: CustomerPackage) =>
              p.available > 0 &&
              p.starts_on <= a.appointment_date &&
              p.expires_on >= a.appointment_date &&
              p.entitlements.some(
                (s) => s.name === a.service_name || s.kind === "composition",
              ),
          )
          .map((p: CustomerPackage) => ({ id: p.id, name: p.name })),
      );
    })().catch(() => {if(current)setError('Vantaggi non disponibili. Riapri la scheda per riprovare.');}).finally(()=>{if(current)setLoading(false);});
    return () => {
      current = false;
    };
  }, [appointmentId, workspaceId, revision]);
  if(loading)return <View accessibilityLabel="Verifica vantaggi" style={{minHeight:48,padding:12,borderRadius:14,borderWidth:1,borderColor:p.line,backgroundColor:p.field}}><Text style={{fontSize:12,lineHeight:20,color:p.muted}}>Verifica pacchetti del cliente…</Text></View>;
  if (!covered && !options.length && !error) return <View style={{minHeight:48,padding:12,borderRadius:14,borderWidth:1,borderColor:p.line,backgroundColor:p.field}}><Text style={{fontSize:12,lineHeight:20,color:p.muted}}>Nessun pacchetto applicabile a questo servizio.</Text></View>;
  const apply = async () => {
    if (lock.current || !confirm) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const { error: e } = await supabase.rpc('apply_owner_service_package', { p_package_id: confirm, p_appointment_id: appointmentId });
      if (e) throw new Error(e.message);
      setConfirm(null);
      refreshServicePackages();
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View
      style={{
        gap: 7,
      }}
    >
      {covered ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="layers-outline" size={16} color={p.night?'#B2D4BB':'#426B54'} /><Text style={{ color: p.night?'#B2D4BB':'#426B54', fontWeight: "700", fontSize: 13, flexShrink: 1 }}>{covered}</Text></View>
      ) : (
        <>
          <View style={{ gap: 10 }}>
          {options.map((p) => (
            <AppointmentBenefitActionRow
              key={p.id}
              title={p.name}
              caption="Pacchetto disponibile"
              icon="layers-outline"
              tone="rose"
              actionLabel="Usa"
              disabled={busy}
              accessibilityLabel={`Usa pacchetto ${p.name}`}
              onPress={() => { setError(''); setConfirm(p.id); }}
            />
          ))}
          </View>
          <AppointmentBenefitConfirmation visible={!!confirm} title="Usa il pacchetto" service={options.find((p) => p.id === confirm)?.name ?? ''} message="Il prezzo da incassare diventa 0 € e viene riservato un utilizzo per questo appuntamento. I pagamenti già avviati devono essere gestiti prima." confirmLabel="Conferma utilizzo" busy={busy} error={error} onClose={() => setConfirm(null)} onConfirm={() => { void apply(); }} />
        </>
      )}
      {error && !confirm ? (
        <Text accessibilityRole="alert" style={{ color: "#B42318" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
