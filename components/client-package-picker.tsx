import { useAccessAppearance } from './access-premium';
import {
  benefitToday,
  loadCustomerBenefits,
  type BenefitsWallet,
} from "../src/lib/customer-benefits";
import { packageMoney } from "../src/lib/service-packages";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  authenticateCustomerPayment,
  type PaymentIdentity,
} from "../src/lib/client-payment-session";
import {
  eligiblePackages,
  subscribePackageChanges,
  type CustomerPackage,
} from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";

export type PackageSelection = { id: string; key: string; name: string };
export function ClientPackagePicker({
  identity,
  serviceId,
  compositionId,
  date,
  selection,
  onChange,
}: {
  identity: PaymentIdentity;
  serviceId: string;
  compositionId?: string;
  date: string;
  selection: PackageSelection | null;
  onChange: (value: PackageSelection | null) => void;
}) {
  const { palette: customerPalette } = useAccessAppearance();
  const key = [
    identity.salonCode,
    identity.email,
    identity.phone,
    compositionId || serviceId,
    date,
  ].join("|");
  const explicitChoice = useRef<{ key: string; id: string | null } | null>(null);
  const choosePackage = (value: PackageSelection | null) => {
    explicitChoice.current = { key, id: value?.id ?? null };
    onChange(value);
  };
  const [wallet, setWallet] = useState<BenefitsWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const enabled = selection?.key === key && packages.some((p) => p.id === selection.id);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribePackageChanges(() => setRevision((v) => v + 1)), []);
  useEffect(() => {
    let current = true;
    setPackages([]);
    setWallet(null);
    setLoading(true);
    setError("");
    onChange(null);
    void loadCustomerBenefits(identity)
      .then((all) => {
        if (!current) return;
        setWallet(all);
        setLoading(false);
        const next = eligiblePackages(
          all.packages,
          compositionId ? "composition" : "service",
          compositionId || serviceId,
          date,
        );
        setPackages(next);
        const choice = explicitChoice.current;
        const preferred = choice?.key === key
          ? next.find((p) => p.id === choice.id)
          : next[0];
        if (preferred) onChange({ id: preferred.id, key, name: preferred.name });
      })
      .catch((e) => {
        if (current) {
          setLoading(false);
          setError((e as Error).message);
        }
      });
    return () => {
      current = false;
    };
    // The parent passes a stable setter; key includes the complete identity and service/date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);
  // Nothing to apply: the booking's compact wallet still exposes all other benefits.
  // Keep quote/package effects mounted; only omit an empty visual panel.
  if (!loading && !error && !packages.length && !open && !selection) return null;
  return (
    <View
      style={{
        gap: 10,
        flexGrow: 0,
        flexShrink: 0,
        alignSelf: "stretch",
        padding: 14,
        backgroundColor: enabled ? customerPalette.field : customerPalette.field,
        borderRadius: 16,
        marginVertical: 10,
      }}
    >
      {!packages.length ? <HapticTouchable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Text style={{ fontWeight: "700", color: customerPalette.ink }}>
          {selection?.key === key
            ? `Incluso nel pacchetto · ${selection.name}`
            : loading
              ? "Verifica dei tuoi vantaggi…"
              : error
                ? "Verifica i tuoi vantaggi"
                : "Vantaggi per questo appuntamento"}
        </Text>
      </HapticTouchable> : null}
      {!loading && !error && !packages.length ? (
        <Text style={{ color: customerPalette.muted }}>
          Nessun pacchetto copre questo servizio nella data scelta.
        </Text>
      ) : null}
      {open && wallet?.giftCards
        .filter(
          (g) =>
            g.available_cents > 0 && (!g.expires_on || g.expires_on >= date),
        )
        .map((g) => (
          <View key={g.id} style={{ gap: 4 }}>
            <Text style={{ fontWeight: "700", color: customerPalette.ink }}>
              Gift card disponibile · {packageMoney(g.available_cents)}
            </Text>
            <Text style={{color:customerPalette.muted}}>
              Puoi richiederne l’utilizzo al salone. Non è ancora applicata al
              prezzo di questa prenotazione.
            </Text>
          </View>
        ))}
      {open && wallet && (wallet.settings.loyalty_enabled || wallet.points > 0) ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontWeight: "700", color: customerPalette.ink }}>
            {wallet.points} punti fedeltà
          </Text>
          {wallet.rewards
            .filter((r) => r.points_cost <= wallet.points && (!r.expires_on || r.expires_on >= benefitToday()))
            .map((r) => (
              <Text key={r.id}>
                Puoi richiedere al salone: {r.name} ({r.points_cost} punti).
              </Text>
            ))}
          {wallet.settings.loyalty_enabled ? (
            <Text style={{color:customerPalette.muted}}>I nuovi punti maturano a servizio effettuato.</Text>
          ) : null}
        </View>
      ) : null}
      {packages.length ? (
        <>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Ionicons name="layers-outline" size={19} color={customerPalette.muted} style={{ marginTop: 1 }} />
              <View style={{ flexShrink: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ fontWeight: "700", color: enabled ? customerPalette.ink : customerPalette.ink }}>{enabled ? "Pacchetto applicato" : "Pacchetto non utilizzato"}</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: customerPalette.muted }}>{enabled ? "1 utilizzo riservato alla conferma · extra esclusi" : "Paghi il servizio · utilizzi conservati"}</Text>
              </View>
            </View>
            <HapticTouchable
              accessibilityRole="button"
              accessibilityLabel={enabled ? "Disattiva pacchetto e paga il servizio" : "Applica il pacchetto"}
              onPress={() => choosePackage(enabled ? null : { id: packages[0].id, key, name: packages[0].name })}
              style={{ minWidth: 58, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: customerPalette.border, backgroundColor: enabled ? customerPalette.action : customerPalette.field, justifyContent: "center", alignItems: "center" }}
            ><Text style={{ textAlign: "center", fontSize: 13, lineHeight: 18, fontWeight: "700", color: enabled ? customerPalette.actionText : customerPalette.ink }}>{enabled ? "Disattiva pacchetto e paga il servizio" : "Applica il pacchetto"}</Text></HapticTouchable>
          </View>
          <HapticTouchable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontSize: 12, flexShrink: 1, fontWeight: "600", color: customerPalette.muted }}>{open ? "Chiudi dettagli" : "Dettagli pacchetto e altri vantaggi"}</Text><Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={customerPalette.muted} />
          </HapticTouchable>
          {open ? packages.map((p) => (
            <HapticTouchable key={p.id} onPress={() => choosePackage({ id: p.id, key, name: p.name })} accessibilityRole="radio" accessibilityState={{ selected: enabled && selection?.id === p.id }} style={{ padding: 10, borderRadius: 12, backgroundColor: customerPalette.field }}>
              <Text style={{ color: customerPalette.ink, fontWeight: "600" }}>{enabled && selection?.id === p.id ? "✓ " : ""}{p.name} · {p.available} disponibili · fino al {p.expires_on.split("-").reverse().join("/")}</Text>
            </HapticTouchable>
          )) : null}
        </>
      ) : null}
      {open && !packages.length ? (
        <>
          <Text style={{ color: customerPalette.muted }}>
            {error
              ? error
              : "Nessun pacchetto disponibile per questo servizio e questa data."}
          </Text>
          {error.toLowerCase().includes("password") ? (
            <>
              <TextInput
                accessibilityLabel="Password per verificare i pacchetti"
                placeholder="Password del tuo account"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                style={{
                  padding: 12,
                  backgroundColor: customerPalette.field,
                  color: customerPalette.ink,
                  borderRadius: 12,
                }}
              />
              <HapticTouchable
                disabled={busy || !password}
                onPress={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    await authenticateCustomerPayment(identity, password);
                    setPassword("");
                    setRevision((v) => v + 1);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text style={{ fontWeight: "700", color: customerPalette.ink }}>
                  Verifica pacchetti
                </Text>
              </HapticTouchable>
            </>
          ) : (
            <HapticTouchable onPress={() => setRevision((v) => v + 1)}>
              <Text style={{ fontWeight: "700", color: customerPalette.ink }}>
                Aggiorna disponibilità
              </Text>
            </HapticTouchable>
          )}
        </>
      ) : null}
    </View>
  );
}
