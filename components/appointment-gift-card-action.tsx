import { useAccessAppearance } from './access-premium';
import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import {
  packageMoney,
  refreshServicePackages,
} from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";
export function AppointmentGiftCardAction({
  appointmentId,
  workspaceId,
}: {
  appointmentId: string;
  workspaceId: string;
}) {
  const {palette:p}=useAccessAppearance();
  const [cards, setCards] = useState<
    { id: string; code: string; available: number }[]
  >([]);
  const [coverage, setCoverage] = useState("");
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    void (async () => {
      const { data: a } = await supabase
        .from("appointments")
        .select(
          "customer_id,completed,no_show,cashed_in,price,appointment_date",
        )
        .eq("id", appointmentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const { data: use } = await supabase
        .from("gift_card_uses")
        .select("amount_cents,state")
        .eq("workspace_id", workspaceId)
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      if (!current) return;
      if (use) {
        setCoverage(
          `${packageMoney(use.amount_cents)} da gift card · ${use.state === "released" ? "credito restituito" : use.state === "consumed" ? "utilizzato" : "riservato"}`,
        );
        setCards([]);
        return;
      }
      if (
        !a ||
        !a.customer_id ||
        a.price <= 0 ||
        a.completed ||
        a.no_show ||
        a.cashed_in
      )
        return;
      setPrice(a.price);
      const { data: wallet } = await supabase.rpc("owner_customer_benefits", {
        p_customer: a.customer_id,
      });
      if (current)
        setCards(
          (wallet?.giftCards ?? []).filter(
            (g: any) =>
              (!g.expires_on || g.expires_on >= a.appointment_date) &&
              g.available > 0,
          ),
        );
    })().catch(() => {});
    return () => {
      current = false;
    };
  }, [workspaceId, appointmentId, revision]);
  if (!coverage && !cards.length) return null;
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 16,
        backgroundColor: p.night?'rgba(177,135,160,.10)':'#F0E9EF',
        gap: 10,
      }}
    >
      {coverage ? (
        <Text style={{ fontWeight: "700", color: p.night?'#D6B9CB':'#875F75' }}>{coverage}</Text>
      ) : (
        <>
          <Text style={{ fontWeight: "700", color: p.night?'#D6B9CB':'#875F75' }}>
            Credito regalo disponibile
          </Text>
          {cards.map((c) => (
            <HapticTouchable
              key={c.id}
              disabled={busy}
              onPress={() => {
                setSelected(c.id);
                setAmount(String(Math.min(c.available / 100, price)));
              }}
            >
              <Text style={{ padding: 8, color:p.ink }}>
                {selected === c.id ? "✓ " : ""}
                {c.code} · {packageMoney(c.available)}
              </Text>
            </HapticTouchable>
          ))}
          {selected ? (
            <>
              <Text style={{color:p.ink}}>Importo da coprire con gift card (€)</Text>
              <TextInput
                accessibilityLabel="Importo gift card da utilizzare"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                editable={!busy}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: p.field, color: p.ink, borderWidth:1, borderColor:p.line,
                }}
              />
              <Text style={{ color: p.muted }}>
                Il credito sarà riservato. In Cassa resta da incassare solo
                l’eventuale differenza.
              </Text>
              <HapticTouchable
                disabled={busy}
                onPress={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const cents = Math.round(
                      Number(amount.replace(",", ".")) * 100,
                    );
                    if (!Number.isFinite(cents) || cents <= 0)
                      throw new Error("Importo non valido.");
                    const { error: e } = await supabase.rpc(
                      "apply_customer_gift_card",
                      {
                        p_card: selected,
                        p_appointment: appointmentId,
                        p_amount: cents,
                      },
                    );
                    if (e) throw new Error(e.message);
                    refreshServicePackages();
                    setRevision((v) => v + 1);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                <Text style={{ fontWeight: "700", color: p.night?'#D6B9CB':'#875F75' }}>
                  Conferma utilizzo gift card
                </Text>
              </HapticTouchable>
            </>
          ) : null}
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#B42318" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
