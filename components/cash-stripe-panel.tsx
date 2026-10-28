import { NativeMedal } from './owner-premium-native-home';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { CashWebDialog } from "./cash-web-dialog";
import { CashStripeWebPanel } from "./cash-stripe-web-panel";
import { useAccessAppearance } from "./access-premium";
import { useCashPanelStyles } from "./cash-web-panel";
import { LoyaltyCheckoutReminder } from "./loyalty-checkout-reminder";
import { useAppContext } from "../src/context/AppContext";
import { useCashRefresh } from "../src/lib/use-cash-refresh";

import { PremiumGuideDock } from "./ui/premium-guide-dock";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
  NativeModules,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Constants from "expo-constants";
import { supabase } from "../src/lib/supabase";
import { HapticTouchable } from "./ui/haptic-touchable";
import { CashContactless } from "./cash-contactless";
import { CashTapToPaySetup } from "./cash-tap-to-pay-setup";

type Status = {
  configured?: boolean;
  connected?: boolean;
  ready?: boolean;
  live?: boolean;
  payments?: { movement_id: string; refunded_cents: number }[];
};
const confirmedStatuses = new Map<
  string,
  {
    status: Status;
    terminal: { enabled?: boolean; locations?: unknown[] } | null;
  }
>();
export async function callCashStripe(action: string, movementId?: string) {
  const { data, error } = await supabase.functions.invoke("cash-stripe", {
    body: { action, movementId },
    timeout: 30000,
  });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error && "context" in error) {
      try {
        message = (await error.context.json()).error;
      } catch {}
    }
    throw new Error(
      message || "Collegamento non disponibile. Riprova tra poco.",
    );
  }
  return data;
}
const call = callCashStripe;
export function CashStripePanel({
  movement,
  onClose,
  active = true,
  modalOnly = false,
  inlineCheckout = false,
  onAvailabilityChange,
  pendingMovements = [],
  onSelectMovement,
}: {
  inlineCheckout?: boolean;
  modalOnly?: boolean;
  pendingMovements?: { id: string; importo: number; descrizione: string }[];
  onSelectMovement?: (movement: { id: string; importo: number }) => void;
  movement: { id: string; importo: number } | null;
  onClose: () => void;
  active?: boolean;
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const { salonWorkspace } = useAppContext();
  const styles = useCashPanelStyles(baseCashStyles);
  const { palette: p } = useAccessAppearance();
  const web = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const qrSize = Math.max(120, Math.min(200, width - 132));
  const [showPicker, setShowPicker] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [status, setStatus] = useState<Status | null>(
    () => confirmedStatuses.get(salonWorkspace.id)?.status ?? null,
  );
  const [terminalStatus, setTerminalStatus] = useState<{
    enabled?: boolean;
    locations?: unknown[];
  } | null>(() => confirmedStatuses.get(salonWorkspace.id)?.terminal ?? null);
  const [terminalError, setTerminalError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contactlessBusy, setContactlessBusy] = useState(false);
  const [method, setMethod] = useState<"checkout" | "terminal">("checkout");
  const lock = useRef(false);
  const paymentRequestVersion = useRef(0);
  const [error, setError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [checkout, setCheckout] = useState<{
    status: string;
    channel?: string;
    url?: string;
    amountCents?: number;
    receipt?: string;
    receiptEmailConfigured?: boolean;
  } | null>(null);
  const run = useCallback(async (job: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  const statusRefreshLock = useRef(false);
  const refresh = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      if (statusRefreshLock.current) return;
      statusRefreshLock.current = true;
      try {
        const next = await call("status");
        if (!isCurrent()) return;
        setStatus(next);
        setStatusError(false);
        confirmedStatuses.set(salonWorkspace.id, {
          status: next,
          terminal: confirmedStatuses.get(salonWorkspace.id)?.terminal ?? null,
        });
        if (next.configured && next.connected) {
          try {
            const terminal = await call("terminal-status");
            if (isCurrent()) {
              setTerminalStatus(terminal);
              setTerminalError(false);
              confirmedStatuses.set(salonWorkspace.id, {
                status: next,
                terminal,
              });
            }
          } catch {
            if (isCurrent()) setTerminalError(true);
          }
        } else {
          setTerminalStatus(null);
          setTerminalError(false);
        }
      } catch (e) {
        if (isCurrent()) setStatusError(true);
        throw e;
      } finally {
        statusRefreshLock.current = false;
      }
    },
    [salonWorkspace.id],
  );
  useEffect(() => {
    const cached = confirmedStatuses.get(salonWorkspace.id);
    setStatus(cached?.status ?? null);
    setTerminalStatus(cached?.terminal ?? null);
    setTerminalError(false);
  }, [salonWorkspace.id]);
  useCashRefresh(salonWorkspace.id, refresh, active);
  useEffect(() => {
    paymentRequestVersion.current++;
    setCheckout(null);
    setError("");
    setLinkCopied(false);
    setMethod("checkout");
    const movementId = movement?.id;
    if (!movementId) return;
    let stopped = false;
    const version = paymentRequestVersion.current;
    void call("check", movementId)
      .then((r) => {
        if (
          !stopped &&
          version === paymentRequestVersion.current &&
          r.status !== "expired"
        ) {
          setCheckout(r);
          if (r.channel === "terminal") setMethod("terminal");
        }
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [movement?.id]);
  useEffect(() => {
    const movementId = movement?.id;
    if (!active || !movementId || checkout?.status !== "open") return;
    let stopped = false,
      checking = false;
    const timer = setInterval(() => {
      if (AppState.currentState !== "active" && Platform.OS !== "web") return;
      if (lock.current || checking) return;
      checking = true;
      const version = paymentRequestVersion.current;
      void call("check", movementId)
        .then((result) => {
          if (!stopped && version === paymentRequestVersion.current)
            setCheckout(result);
        })
        .catch(() => {
          /* Keep the manual verification available during a network interruption. */
        })
        .finally(() => {
          checking = false;
        });
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, movement?.id, checkout?.status, run]);
  useEffect(() => {
    onAvailabilityChange?.(status?.configured === true);
  }, [status?.configured, onAvailabilityChange]);
  const button = (text: string, action: () => void) => {
    const primary = web && text === "Crea QR e link",
      danger = web && text.startsWith("Annulla");
    return (
      <HapticTouchable
        accessibilityRole="button"
        disabled={busy || contactlessBusy}
        onPress={action}
        style={[
          styles.button,
          web && {
            alignSelf: "flex-start",
            paddingHorizontal: 17,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: danger
              ? p.night
                ? "#8A4B50"
                : "#D49894"
              : primary
                ? p.action
                : p.border,
            backgroundColor: danger
              ? p.night
                ? "#442428"
                : "#F5DDDB"
              : primary
                ? p.action
                : p.field,
            borderRadius: 11,
          },
          (busy || contactlessBusy) && { opacity: 0.5 },
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            web && {
              fontSize: 14,
              fontWeight: "500",
              color: danger
                ? p.night
                  ? "#FFB5B5"
                  : "#A22D2D"
                : primary
                  ? p.actionText
                  : p.ink,
            },
          ]}
        >
          {text}
        </Text>
      </HapticTouchable>
    );
  };
  const operate = (action: string) =>
    void run(async () => {
      if (!movement) return;
      paymentRequestVersion.current++;
      setCheckout(await call(action, movement.id));
    });
  const canSelectTapToPay =
    Platform.OS !== "web" &&
    Constants.expoConfig?.extra?.terminalBuildEnabled === true &&
    !!NativeModules.StripeTerminalReactNative &&
    status?.ready === true &&
    !statusError &&
    !terminalError &&
    terminalStatus?.enabled === true &&
    !!terminalStatus.locations?.length;
  const paymentMethods: ("checkout" | "terminal")[] = canSelectTapToPay
    ? ["checkout", "terminal"]
    : ["checkout"];
  const checkoutBody = (
    <View
      {...(web ? { dataSet: { cashStripeCheckout: "true" } } : {})}
      style={[
        web ? { gap: 20 } : styles.modal,
        inlineCheckout &&
          Platform.OS !== "web" && {
            padding: 14,
            alignSelf: "stretch",
            maxWidth: "100%",
          },
      ]}
    >
      <Text style={styles.title}>Incassa</Text>
      {movement && !checkout ? (
        <LoyaltyCheckoutReminder
          movementId={movement.id}
          workspaceId={salonWorkspace.id}
          onApplied={onClose}
        />
      ) : null}
      <Text
        style={[
          styles.amount,
          web && {
            fontFamily: "Georgia",
            fontSize: 36,
            fontWeight: "400",
            color: p.ink,
          },
        ]}
      >
        {(checkout?.amountCents != null
          ? checkout.amountCents / 100
          : (movement?.importo ?? 0)
        ).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
      </Text>
      {!status?.live && status?.configured ? (
        <Text style={styles.text}>Pagamento di prova</Text>
      ) : null}
      <Text style={styles.text}>
        Scegli come incassare. Cassa e Agenda si aggiornano dopo la conferma di
        Stripe.
      </Text>
      {checkout?.status !== "paid" && (!web || paymentMethods.length > 1) ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {paymentMethods.map((value) => (
            <HapticTouchable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: method === value }}
              disabled={busy || contactlessBusy}
              style={[
                styles.button,
                {
                  flex: 1,
                  backgroundColor:method===value?p.action:p.field,
                },
              ]}
              onPress={() => {
                if (value === "terminal" && checkout?.url) {
                  setError(
                    "Per passare al contactless, annulla prima il QR / link aperto. Il cliente non deve poter pagare due volte.",
                  );
                  return;
                }
                if (
                  value === "checkout" &&
                  checkout?.channel === "terminal" &&
                  checkout.status === "open"
                ) {
                  setError(
                    "Verifica o annulla il tentativo contactless prima di creare un QR / link.",
                  );
                  return;
                }
                setError("");
                setMethod(value);
                if (checkout?.status === "expired") setCheckout(null);
              }}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color:method===value?p.actionText:p.ink,
                  },
                ]}
              >
                {value === "checkout" ? "QR / link" : "Tap to Pay"}
              </Text>
            </HapticTouchable>
          ))}
        </View>
      ) : null}
      {checkout?.status === "paid" ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.success}>Pagamento confermato</Text>
          <Text style={styles.text}>
            {checkout.receiptEmailConfigured
              ? "Ricevuta di pagamento richiesta a Stripe per l’email del cliente associato."
              : "Nessuna email cliente associata: verifica la ricevuta nel tuo account Stripe."}
          </Text>
          {Platform.OS === "ios" &&
          checkout.channel === "terminal" &&
          checkout.receipt
            ? button(
                "Condividi ricevuta di pagamento",
                () =>
                  void Share.share({ message: checkout.receipt! }).catch(
                    () => {},
                  ),
              )
            : null}
          <Text style={styles.note}>
            Documento fiscale: emissione reale non ancora attivata in SalonPro.
          </Text>
        </View>
      ) : checkout?.status === "expired" ? (
        <Text style={styles.text}>
          Link annullato o scaduto. Puoi scegliere un altro metodo di pagamento.
        </Text>
      ) : checkout?.url ? (
        <>
          <View style={styles.qr}>
            <QRCode value={checkout.url} size={qrSize} />
          </View>
          {button(
            Platform.OS === "web" ? "Apri link di pagamento" : "Condividi link",
            () =>
              void run(async () => {
                if (Platform.OS === "web") await Linking.openURL(checkout.url!);
                else
                  await Share.share({
                    message: `Paga i servizi del salone: ${checkout.url}`,
                    url: checkout.url,
                  });
              }),
          )}
          {Platform.OS === "web"
            ? button(
                linkCopied ? "Link copiato" : "Copia link",
                () =>
                  void run(async () => {
                    if (!navigator.clipboard)
                      throw Error(
                        "Copia non disponibile: usa Apri link di pagamento.",
                      );
                    await navigator.clipboard.writeText(checkout.url!);
                    setLinkCopied(true);
                  }),
              )
            : null}
          {button("Verifica pagamento", () => operate("check"))}
          {button("Annulla link di pagamento", () => operate("cancel"))}
        </>
      ) : status?.ready ? (
        method === "terminal" && movement ? (
          <CashContactless
            movementId={movement.id}
            disabled={busy}
            onBusyChange={setContactlessBusy}
            onPaid={() => operate("check")}
          />
        ) : (
          button(busy ? "Preparazione…" : "Crea QR e link", () =>
            operate("checkout"),
          )
        )
      ) : (
        <Text style={styles.text}>
          Stripe non è ancora pronto per questo salone. Verifica il collegamento
          nella Cassa.
        </Text>
      )}
      {checkout?.channel === "terminal" && checkout.status === "open" ? (
        <>
          {button("Verifica pagamento", () => operate("check"))}
          {button("Annulla tentativo contactless", () => operate("cancel"))}
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Text style={styles.note}>
        Il pagamento non sostituisce lo scontrino o il documento fiscale.
        Chiudere questa finestra non annulla un pagamento aperto.
      </Text>
      {button(
        inlineCheckout
          ? web
            ? "Torna ai pagamenti"
            : "Torna all’appuntamento"
          : "Chiudi",
        onClose,
      )}
    </View>
  );
  const tapLabel = !status?.connected
    ? "Da configurare"
    : terminalError || statusError
      ? "Stato da verificare"
      : !terminalStatus
        ? "Verifica in corso"
        : !terminalStatus.enabled
          ? "In preparazione"
          : !terminalStatus.locations?.length
            ? "Sede da configurare"
            : Platform.OS === "web"
              ? "Richiede app compatibile"
              : !Constants.expoConfig?.extra?.terminalBuildEnabled ||
                  !NativeModules.StripeTerminalReactNative
                ? "Aggiornamento richiesto"
                : "Pronto alla verifica telefono";
  if (web)
    return movement ? (
      checkoutBody
    ) : modalOnly ? null : (
      <CashStripeWebPanel
        status={status}
        tapLabel={tapLabel}
        statusError={statusError}
        error={error}
        busy={busy || contactlessBusy}
        pickerOpen={showPicker}
        movements={pendingMovements}
        onOpenPicker={() => setShowPicker(true)}
        onClosePicker={() => setShowPicker(false)}
        onPickMovement={
          onSelectMovement
            ? (item) => {
                setShowPicker(false);
                onSelectMovement(item);
              }
            : undefined
        }
        onRefresh={() => void run(() => refresh())}
        onConnect={() =>
          void run(async () => {
            const result = await call("connect");
            window.location.assign(result.url);
          })
        }
        onOnboard={() =>
          void run(async () => {
            const result = await call("onboard");
            window.location.assign(result.url);
          })
        }
      />
    );
  if (status?.configured !== true && !movement) return null;
  return (
    <View
      style={[
        modalOnly ? undefined : styles.card,
        inlineCheckout &&
          Platform.OS !== "web" && {
            alignSelf: "stretch",
            width: "100%",
            minWidth: 0,
          },
      ]}
    >
      {!modalOnly ? (
        <>
          <View style={styles.heading}>
            <NativeMedal icon="flash-outline" size={44} iconSize={20} accent={p.night ? "#D6B27A" : "#8C6A35"} />
            <View style={styles.headingCopy}>
              <Text style={styles.title}>Stripe</Text>
              <Text style={styles.subtitle}>QR, link e carta sul telefono</Text>
            </View>
          </View>
          <PremiumGuideDock
            guideOpen={showInfo}
            onGuidePress={() => setShowInfo((value) => !value)}
            guideAccessibilityLabel="Informazioni sui pagamenti"
            cutoutColor={p.field}
          />
          {showInfo ? (
            <Text style={styles.text}>
              Registra i pagamenti già ricevuti sul tuo POS come “POS esterno”.
              Stripe permette di ricevere pagamenti tramite QR o link quando è
              abilitato per il salone.
            </Text>
          ) : null}
          {status === null ? (
            <Text style={styles.text}>Verifica disponibilità Stripe…</Text>
          ) : status.configured === false ? (
            <Text style={styles.text}>
              Non ancora disponibile per questo salone.
            </Text>
          ) : (
            <>
              {/* One row per way of getting paid: medallion, name, quiet dot status. */}
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: p.night ? p.border : "rgba(122,100,70,.2)", paddingHorizontal: 14 }}>
                {([
                  {
                    icon: "qr-code-outline",
                    accent: p.night ? "#86C2BE" : "#3E7C7A",
                    title: "QR e link",
                    note: "Il cliente paga dal proprio telefono.",
                    dot: status.ready ? (status.live ? (p.night ? "#86C2BE" : "#3E7C7A") : "#C9A35A") : status.connected ? "#C9A35A" : p.muted,
                    label: status.ready ? (status.live ? "Attivo" : "Modalità test") : status.connected ? "Da completare" : "Non collegato",
                  },
                  {
                    icon: "phone-portrait-outline",
                    accent: p.night ? "#9DBAD6" : "#4D6E8F",
                    title: "Tap to Pay",
                    note: "Carta appoggiata al telefono, su iPhone e Android compatibili.",
                    dot: terminalStatus?.enabled && terminalStatus.locations?.length ? (p.night ? "#86C2BE" : "#3E7C7A") : "#C9A35A",
                    label: terminalStatus?.enabled && terminalStatus.locations?.length ? tapLabel : `Non attivo · ${tapLabel}`,
                  },
                ] as const).map((item, index) => (
                  <View key={item.title} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: p.line }}>
                    <NativeMedal icon={item.icon} size={38} iconSize={17} accent={item.accent} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={{ color: p.ink, fontSize: 15, fontWeight: "600" }}>{item.title}</Text>
                      <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17 }}>{item.note}</Text>
                      <View accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.dot }} />
                        <Text style={{ color: p.ink, fontSize: 12, fontWeight: "600" }}>{item.label}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.text}>
                {status?.connected
                  ? status.ready
                    ? status.live
                      ? "Scegli un movimento da saldare, poi il metodo di pagamento."
                      : "Stripe pronto per il collaudo."
                    : "Stripe collegato · Completa i dati richiesti nel tuo account per abilitare i pagamenti."
                  : "Collega Stripe per il tuo salone."}
                {status?.configured && !status.live
                  ? " · Modalità test: nessun incasso reale."
                  : ""}
              </Text>
              {status?.connected ? <CashTapToPaySetup /> : null}
              {!status?.connected && status?.configured
                ? button(
                    "Collega Stripe",
                    () =>
                      void run(async () => {
                        const r = await call("connect");
                        if (Platform.OS === "web")
                          window.location.assign(r.url);
                        else await Linking.openURL(r.url);
                      }),
                  )
                : null}
            </>
          )}
          {status?.connected && !status.ready
            ? button(
                "Completa configurazione Stripe",
                () =>
                  void run(async () => {
                    const r = await call("onboard");
                    if (Platform.OS === "web") window.location.assign(r.url);
                    else await Linking.openURL(r.url);
                  }),
              )
            : null}
          {status?.ready && onSelectMovement ? (
            <HapticTouchable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setShowPicker(true)}
              style={[styles.primaryButton, busy && { opacity: 0.5 }]}
            >
              <Ionicons
                name="qr-code-outline"
                size={21}
                color={p.actionText}
              />
              <Text style={styles.primaryButtonText}>Incassa</Text>
            </HapticTouchable>
          ) : null}
          {status?.connected || error
            ? button(
                busy ? "Verifica in corso…" : "Aggiorna stato",
                () => void run(() => refresh()),
              )
            : null}
          {status?.payments?.some((p) => p.refunded_cents > 0) ? (
            <Text style={styles.text}>
              Sono presenti rimborsi Stripe. Consulta il dettaglio su Stripe:
              gli importi originali in Cassa restano conservati.
            </Text>
          ) : null}
          {statusError ? (
            <Text accessibilityRole="alert" style={styles.note}>
              Connessione non disponibile: stato dell’ultima verifica. Riprova
              con Aggiorna stato.
            </Text>
          ) : null}
          {error && !movement ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
      {web ? (
        showPicker ? (
          <CashWebDialog
            title="Scegli il movimento da incassare"
            onClose={() => setShowPicker(false)}
          >
            {" "}
            <Text style={styles.text}>
              Scegli il movimento da saldare. Sono inclusi tutti i periodi.
            </Text>
            <ScrollView>
              {pendingMovements.length ? (
                pendingMovements.map((item) => (
                  <HapticTouchable
                    key={item.id}
                    accessibilityRole="button"
                    style={[
                      styles.button,
                      { marginBottom: 8, alignItems: "stretch" },
                    ]}
                    onPress={() => {
                      setShowPicker(false);
                      onSelectMovement?.(item);
                    }}
                  >
                    <Text style={styles.buttonText}>
                      {item.descrizione || "Servizi del salone"}
                    </Text>
                    <Text style={styles.text}>
                      {item.importo.toLocaleString("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </Text>
                  </HapticTouchable>
                ))
              ) : (
                <Text style={styles.text}>
                  Non ci sono movimenti da saldare. “Nuovo incasso” registra
                  pagamenti già ricevuti e non crea una richiesta Stripe.
                </Text>
              )}
            </ScrollView>
          </CashWebDialog>
        ) : null
      ) : (
        <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
          visible={showPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPicker(false)}
        >
          <View style={styles.backdrop}>
            <View
              style={[
                styles.modal,
                { maxHeight: "85%", marginTop: "auto", marginBottom: 0 },
              ]}
            >
              <Text style={styles.title}>Incassa</Text>
              {movement && !checkout ? (
                <LoyaltyCheckoutReminder
                  movementId={movement.id}
                  workspaceId={salonWorkspace.id}
                  onApplied={onClose}
                />
              ) : null}
              <Text style={styles.text}>
                Scegli il movimento da saldare. Sono inclusi tutti i periodi.
              </Text>
              <ScrollView>
                {pendingMovements.length ? (
                  pendingMovements.map((item) => (
                    <HapticTouchable
                      key={item.id}
                      accessibilityRole="button"
                      style={[
                        styles.button,
                        { marginBottom: 8, alignItems: "stretch" },
                      ]}
                      onPress={() => {
                        setShowPicker(false);
                        onSelectMovement?.(item);
                      }}
                    >
                      <Text style={styles.buttonText}>
                        {item.descrizione || "Servizi del salone"}
                      </Text>
                      <Text style={styles.text}>
                        {item.importo.toLocaleString("it-IT", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </Text>
                    </HapticTouchable>
                  ))
                ) : (
                  <Text style={styles.text}>
                    Non ci sono movimenti da saldare. “Nuovo incasso” registra
                    pagamenti già ricevuti e non crea una richiesta Stripe.
                  </Text>
                )}
              </ScrollView>
              {button("Chiudi", () => setShowPicker(false))}
            </View>
          </View>
        </Modal>
      )}
      {inlineCheckout ? (
        movement ? (
          checkoutBody
        ) : null
      ) : (
        <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
          visible={!!movement}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!busy && !contactlessBusy) onClose();
          }}
        >
          <View style={styles.backdrop}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {checkoutBody}
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}
const baseCashStyles = StyleSheet.create({
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: "#EAF7EF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22A66A",
  },
  statusLabel: { color: "#176843", fontSize: 13, fontWeight: "600" },
  primaryButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#20364D",
    borderRadius: 16,
    padding: 16,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    gap: 12,
    marginTop: 0,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 32,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#EFF4F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1 },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 3 },
  title: { color: "#13213a", fontWeight: "800", fontSize: 18 },
  text: { color: "#52627a", fontSize: 14, lineHeight: 21 },
  button: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EFF4F9",
    alignItems: "center",
  },
  buttonText: { color: "#244b85", fontSize: 15, fontWeight: "700" },
  backdrop: {
    flex: 1,
    backgroundColor: "#0c162b99",
    paddingBottom: 0,
    justifyContent: "flex-end",
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: 22,
    paddingBottom: 0,
  },
  modal: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: "white",
    padding: 24,
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: 15,
  },
  amount: { fontSize: 28, fontWeight: "800", color: "#13213a" },
  qr: { padding: 20, alignSelf: "center", backgroundColor: "white" },
  error: { color: "#b42332", fontSize: 14 },
  success: { color: "#13734c", fontWeight: "800", fontSize: 20 },
  note: { color: "#66758a", fontSize: 12, lineHeight: 18 },
});
