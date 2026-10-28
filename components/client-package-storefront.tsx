import { useAccessAppearance } from './access-premium';
import { customerPortalStyles } from './customer-portal-styles';
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { publicSupabase } from "../src/lib/supabase";
import {
  customerPaymentToken,
  type PaymentIdentity,
} from "../src/lib/client-payment-session";
import {
  benefitOperationId,
  packageMoney,
  refreshServicePackages,
  type PackageCatalog,
} from "../src/lib/service-packages";
import { benefitsDesign as customerBenefitsBase } from "./benefits-design";
import { HapticTouchable } from "./ui/haptic-touchable";
export function ClientPackageStorefront({
  identity,
}: {
  identity: PaymentIdentity;
}) {
  const { palette: customerPalette } = useAccessAppearance();
  const d = React.useMemo(() => customerPortalStyles(customerBenefitsBase, customerPalette), [customerPalette]);
  const [catalog, setCatalog] = useState<{
    items: PackageCatalog[];
    purchasable: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const orders = useRef<Record<string, string>>({});
  const key =
    "salonpro.package.orders." +
    encodeURIComponent(
      [identity.salonCode, identity.email, identity.phone].join("|"),
    );
  async function call(operation: string, extra: Record<string, unknown> = {}) {
    const paymentToken = await customerPaymentToken(identity);
    const { data, error: failure } = await publicSupabase.functions.invoke(
      "cash-stripe?action=package",
      {
        body: { ...identity, paymentToken, operation, ...extra },
        timeout: 30000,
      },
    );
    let message = data?.error;
    if (failure && !message && "context" in failure) {
      try {
        message = (await failure.context.json()).error;
      } catch {}
    }
    if (failure || message)
      throw Error(
        message || "Vetrina temporaneamente non disponibile. Riprova.",
      );
    return data;
  }
  async function checkOrders() {
    for (const [catalogId, orderId] of Object.entries(orders.current)) {
      const result = await call("check", { orderId });
      if (["paid", "expired", "refunded", "cancelled"].includes(result.status)) {
        delete orders.current[catalogId];
        await AsyncStorage.setItem(key, JSON.stringify(orders.current));
        if (result.status === "paid") {
          if (alive.current)
            setNotice(
              "Acquisto confermato. Il pacchetto è nel tuo portafoglio.",
            );
          refreshServicePackages();
        }
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void (async () => {
      try {
        orders.current = JSON.parse((await AsyncStorage.getItem(key)) || "{}");
        const result = await call("catalog");
        if (!cancelled) setCatalog(result);
        await checkOrders();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    const check = () => {
      if (lock.current) return;
      lock.current = true;
      void checkOrders()
        .catch((e) => {
          if (alive.current) setError((e as Error).message);
        })
        .finally(() => {
          lock.current = false;
        });
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    const focus = () => check();
    if (Platform.OS === "web") window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      alive.current = false;
      sub.remove();
      if (Platform.OS === "web") window.removeEventListener("focus", focus);
    };
    // Identity is stable throughout the wallet presentation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!catalog?.items.length && !error) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Ionicons name="layers-outline" size={24} color={customerPalette.ink} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: customerPalette.ink }}>
          Abbonamenti del salone
        </Text>
      </View>
      <Text style={d.copy}>
        Scegli il tuo pacchetto. La validità parte dal giorno del pagamento
        confermato.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: customerPalette.night ? '#E4B5B9' : '#963F4A' }}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" style={{ color: customerPalette.ink }}>
          {notice}
        </Text>
      ) : null}
      {catalog?.items.map((p) => (
        <PackageStorefrontCard
          key={p.id}
          model={p}
          purchasable={catalog.purchasable}
          busy={busy}
          pending={!!orders.current[p.id]}
          onCancel={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const result = await call("cancel", { orderId: orders.current[p.id] });
              if (["cancelled", "expired", "paid", "refunded"].includes(result.status)) {
                delete orders.current[p.id];
                await AsyncStorage.setItem(key, JSON.stringify(orders.current));
                setNotice(result.status === "paid" ? "Il pagamento è già confermato: il pacchetto è nel portafoglio. Per un rimborso contatta il salone." : "Tentativo di acquisto annullato.");
                refreshServicePackages();
              } else throw Error("Pagamento in verifica. Non è stato annullato: aggiorna gli acquisti.");
            } catch (e) {
              if (alive.current) setError((e as Error).message);
            } finally {
              lock.current = false;
              if (alive.current) setBusy(false);
            }
          }}
          onBuy={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const orderId = orders.current[p.id] || benefitOperationId();
              orders.current[p.id] = orderId;
              await AsyncStorage.setItem(key, JSON.stringify(orders.current));
              const result = await call("checkout", {
                orderId,
                catalogId: p.id,
                revision: p.revision,
              });
              if (result.status === "paid") {
                await checkOrders();
              } else if (
                result.url?.startsWith("https://checkout.stripe.com/")
              ) {
                await Linking.openURL(result.url);
                setNotice(
                  "Completa il pagamento su Stripe, poi torna qui per verificare il tuo pacchetto.",
                );
              } else if (result.status === "expired") {
                delete orders.current[p.id];
                await AsyncStorage.setItem(key, JSON.stringify(orders.current));
                setError("Pagamento scaduto. Puoi riprovare.");
              } else
                throw Error(
                  "Pagamento in verifica. Controlla prima di riprovare.",
                );
            } catch (e) {
              if (alive.current) setError((e as Error).message);
            } finally {
              lock.current = false;
              if (alive.current) setBusy(false);
            }
          }}
        />
      ))}

      {catalog && !catalog.purchasable ? (
        <Text style={d.copy}>
          Per acquistare questi pacchetti contatta il salone: il pagamento
          online non è ancora attivo.
        </Text>
      ) : null}
      <HapticTouchable
        accessibilityRole="button"
        disabled={busy}
        onPress={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await checkOrders();
            setCatalog(await call("catalog"));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Text
          style={{
            textAlign: "center",
            color: customerPalette.ink,
            fontWeight: "600",
            padding: 12,
          }}
        >
          Aggiorna acquisti e disponibilità
        </Text>
      </HapticTouchable>

    </View>
  );
}

export function PackageStorefrontCard({
  model: p,
  purchasable,
  busy = false,
  pending = false,
  onBuy,
  onCancel,
}: {
  model: PackageCatalog;
  purchasable: boolean;
  busy?: boolean;
  pending?: boolean;
  onBuy: () => void;
  onCancel?: () => void;
}) {
  const { palette: customerPalette } = useAccessAppearance();
  const d = React.useMemo(() => customerPortalStyles(customerBenefitsBase, customerPalette), [customerPalette]);
  return (
    <View
      style={[
        d.card,
        { backgroundColor: customerPalette.field, borderColor: customerPalette.border, gap: 10 },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: customerPalette.ink,
            flexShrink: 1,
          }}
        >
          {p.name}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: "700", color: customerPalette.ink }}>
          {packageMoney(p.price_cents)}
        </Text>
      </View>
      <Text style={d.copy}>
        {p.uses} utilizzi · {p.months} mesi
      </Text>
      <Text style={d.copy}>
        {p.entitlements.map((e) => e.name).join(" · ")}
      </Text>
      {p.product_discount > 0 ? (
        <Text style={d.copy}>Sconto prodotti: {p.product_discount}%</Text>
      ) : null}
      <HapticTouchable
        accessibilityRole="button"
        disabled={busy || !purchasable}
        style={[d.primary, { opacity: busy || !purchasable ? 0.5 : 1 }]}
        onPress={onBuy}
      >
        <Text style={d.primaryText}>
          {busy
            ? "Verifica…"
            : pending
              ? "Riprendi acquisto"
              : "Acquista pacchetto"}
        </Text>
      </HapticTouchable>
      {pending && onCancel ? <HapticTouchable accessibilityRole="button" disabled={busy} onPress={onCancel} style={{paddingVertical:12,alignItems:"center",opacity:busy ? 0.5 : 1}}><Text style={{color:customerPalette.ink,fontWeight:"600",fontSize:14}}>Annulla acquisto</Text></HapticTouchable> : null}
    </View>
  );
}
