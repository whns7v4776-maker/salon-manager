import { useAccessAppearance } from './access-premium';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import {
  packageMoney,
  refreshServicePackages,
  subscribePackageChanges,
} from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";
type Choice = {
  id: string;
  revision: number;
  name: string;
  description: string;
  points_cost: number;
  discount_cents: number;
  reward_type: string;
};
type Options = {
  price: number;
  rewards: Choice[];
  applied: { snapshot: Choice; discount_cents: number; state: string } | null;
};
export function LoyaltyCheckoutReminder({
  appointmentId,
  movementId,
  workspaceId,
  onApplied,
}: {
  appointmentId?: string;
  movementId?: string;
  workspaceId: string;
  onApplied?: () => void;
}) {
  const {palette:p}=useAccessAppearance();
  const [loading,setLoading]=useState(true);
  const [options, setOptions] = useState<Options | null>(null),
    [selected, setSelected] = useState<Choice | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const resolved = useRef<string | null>(null),
    lock = useRef(false),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    let id = appointmentId;
    if (!id && movementId && /^[0-9a-f-]{36}$/i.test(movementId)) {
      const { data, error: e } = await supabase
        .from("cash_movements")
        .select("appointment_id")
        .eq("id", movementId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (e) throw Error("Premi fedeltà non verificati. Riprova.");
      id = data?.appointment_id;
    }
    if (version !== generation.current) return;
    resolved.current = id || null;
    if (!id) {
      setOptions(null);
      return;
    }
    const { data, error: e } = await supabase.rpc("loyalty_checkout_options", {
      p_appointment: id,
    });
    if (version !== generation.current) return;
    if (e) throw Error("Premi fedeltà non verificati. Riprova.");
    setOptions(data);
    setError("");
  }, [appointmentId, movementId, workspaceId]);
  useEffect(() => {
    const requestGeneration = generation;
    setOptions(null);
    setSelected(null);
    const load = () => {
      setLoading(true);
      const request=refresh();
      const version=generation.current;
      void request.catch(e=>{if(version===generation.current)setError(e.message);}).finally(()=>{if(version===generation.current)setLoading(false);});
    };
    load();
    const unsubscribe = subscribePackageChanges(load);
    return () => {
      requestGeneration.current++;
      unsubscribe();
    };
  }, [refresh]);
  const button = (text: string, action: () => void) => (
    <HapticTouchable
      disabled={busy}
      accessibilityRole="button"
      onPress={action}
      style={{ padding: 12, borderRadius: 12, backgroundColor: p.field }}
    >
      <Text style={{ color: p.ink, fontWeight: "700" }}>{text}</Text>
    </HapticTouchable>
  );
  if(loading)return <View style={{minHeight:48,padding:12,borderRadius:14,borderWidth:1,borderColor:p.line,backgroundColor:p.field}}><Text style={{fontSize:12,lineHeight:20,color:p.muted}}>Verifica premi fedeltà…</Text></View>;
  if (!error && !options?.applied && !options?.rewards.length) return Platform.OS==='web'?null:<View style={{minHeight:48,padding:12,borderRadius:14,borderWidth:1,borderColor:p.line,backgroundColor:p.field}}><Text style={{fontSize:12,lineHeight:20,color:p.muted}}>Nessun premio fedeltà disponibile per questo servizio.</Text></View>;
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 16,
        backgroundColor: p.night?'rgba(177,135,160,.10)':'#F0E9EF',
        gap: 10,
      }}
    >
      <Text style={{ fontWeight: "800", color: p.night?'#D6B9CB':'#875F75' }}>
        Premi fedeltà del cliente
      </Text>
      {options?.applied ? (
        <Text style={{color:p.ink}}>
          {options.applied.snapshot.name} ·{" "}
          {options.applied.state === "released"
            ? "Annullato, punti restituiti"
            : options.applied.discount_cents
              ? "Sconto applicato: " +
                packageMoney(options.applied.discount_cents)
              : "Omaggio consegnato"}
        </Text>
      ) : (
        <>
          <Text style={{color:p.ink}}>
            Scegli il premio prima di incassare. Sconto e punti si aggiornano
            insieme.
          </Text>
          {options?.rewards.map((r) => (
            <View key={r.id} style={{ gap: 5 }}>
              {button(
                r.name +
                  " · " +
                  r.points_cost +
                  " punti" +
                  (r.discount_cents
                    ? " · −" + packageMoney(r.discount_cents)
                    : ""),
                () => setSelected(r),
              )}
            </View>
          ))}
          {selected ? (
            <View style={{ gap: 8 }}>
              <Text style={{color:p.ink}}>{selected.description}</Text>
              <Text style={{color:p.ink}}>
                {selected.reward_type === "custom"
                  ? "Conferma solo dopo aver consegnato il regalo."
                  : `Da incassare: ${packageMoney(Math.max(0, Math.round((options?.price || 0) * 100) - selected.discount_cents))}.`}{" "}
                Verranno usati {selected.points_cost} punti.
              </Text>
              {button(
                busy
                  ? "Applicazione…"
                  : selected.reward_type === "custom"
                    ? "Conferma consegna"
                    : "Applica premio",
                () => {
                  if (lock.current || !resolved.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  void (async () => {
                    const { error: e } = await supabase.rpc(
                      "apply_loyalty_checkout_reward",
                      {
                        p_appointment: resolved.current,
                        p_reward: selected.id,
                        p_revision: selected.revision,
                      },
                    );
                    if (e) throw Error(e.message);
                    setSelected(null);
                    await refresh();
                    refreshServicePackages();
                    onApplied?.();
                  })()
                    .catch((e) => setError(e.message))
                    .finally(() => {
                      lock.current = false;
                      setBusy(false);
                    });
                },
              )}
              {button("Annulla", () => setSelected(null))}
            </View>
          ) : null}
        </>
      )}
      {error ? (
        <>
          <Text accessibilityRole="alert" style={{ color: "#B42318" }}>
            {error}
          </Text>
          {button(
            "Riprova",
            () => void refresh().catch((e) => setError(e.message)),
          )}
        </>
      ) : null}
    </View>
  );
}
