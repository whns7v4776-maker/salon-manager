import {InfoButton} from './ui/info-button';
import { popupGlass } from "./premium-web-surfaces";
import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAccessAppearance } from "./access-premium";

type Movement = { id: string; importo: number; descrizione?: string };
type Status = {
  configured?: boolean;
  connected?: boolean;
  ready?: boolean;
  live?: boolean;
  payments?: { refunded_cents: number }[];
};

/** Web presentation only. Every action is supplied by the existing payment controller. */
export function CashStripeWebPanel({
  status,
  tapLabel,
  statusError,
  error,
  busy,
  pickerOpen,
  movements,
  onOpenPicker,
  onClosePicker,
  onPickMovement,
  onRefresh,
  onConnect,
  onOnboard,
}: {
  status: Status | null;
  tapLabel: string;
  statusError: boolean;
  error: string;
  busy: boolean;
  pickerOpen: boolean;
  movements: Movement[];
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onPickMovement?: (movement: Movement) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onOnboard: () => void;
}) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const [info, setInfo] = useState(false);
  const chip = (label: string, good = false) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        alignSelf: "flex-start",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: good
          ? p.night
            ? "#19392B"
            : "#D8EEDC"
          : p.night
            ? "#3D3322"
            : "#EFE2C7",
      }}
    >
      <Ionicons
        name={good ? "checkmark-circle" : "time-outline"}
        size={15}
        color={
          good
            ? p.night
              ? "#98E0AF"
              : "#196635"
            : p.night
              ? "#EACD91"
              : "#78551E"
        }
      />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: good
            ? p.night
              ? "#98E0AF"
              : "#196635"
            : p.night
              ? "#EACD91"
              : "#78551E",
        }}
      >
        {label}
      </Text>
    </View>
  );
  const action = (
    label: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    onPress: () => void,
    primary = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        alignSelf: "flex-start",
        minHeight: 44,
        paddingHorizontal: 17,
        paddingVertical: 12,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: primary ? p.action : p.border,
        backgroundColor: primary ? p.action : p.field,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Ionicons name={icon} size={18} color={primary ? p.actionText : p.ink} />
      <Text
        style={{
          fontSize: 14,
          fontWeight: "500",
          color: primary ? p.actionText : p.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  if (pickerOpen)
    return (
      <View {...{ dataSet: { cashStripeWeb: "picker" } }} style={{ gap: 18 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {action("Indietro", "arrow-back-outline", onClosePicker)}
          <Text style={{ fontSize: 14, color: p.muted }}>
            Scegli il movimento da incassare · tutti i periodi
          </Text>
        </View>
        {movements.length ? (
          movements.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Incassa ${item.descrizione || "Servizi del salone"}`}
              disabled={busy}
              onPress={() => onPickMovement?.(item)}
              style={{
                minHeight: 72,
                flexDirection: "row",
                gap: 16,
                alignItems: "center",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderColor: p.line,
              }}
            >
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: p.ink, fontSize: 16 }}>
                  {item.descrizione || "Servizi del salone"}
                </Text>
                <Text
                  style={{
                    color: p.night ? "#FFB5B5" : "#A22D2D",
                    fontSize: 12,
                  }}
                >
                  Da incassare
                </Text>
              </View>
              <Text
                style={{
                  color: p.ink,
                  fontSize: 18,
                  fontWeight: "500",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {item.importo.toLocaleString("it-IT", {
                  style: "currency",
                  currency: "EUR",
                })}
              </Text>
              <Ionicons
                name="arrow-forward-outline"
                size={18}
                color={p.muted}
              />
            </Pressable>
          ))
        ) : (
          <Text style={{ fontSize: 15, lineHeight: 23, color: p.muted }}>
            Non ci sono movimenti da saldare. “Nuovo incasso” registra pagamenti
            già ricevuti e non crea una richiesta Stripe.
          </Text>
        )}
      </View>
    );
  const wide = width >= 700;
  const qrLabel = !status
    ? "Verifica in corso"
    : status.ready
      ? status.live
        ? "Attivo"
        : "Modalità test"
      : status.connected
        ? "Attivazione da completare"
        : "Non collegato";
  return (
    <View {...{ dataSet: { cashStripeWeb: "overview" } }} style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 23, color: p.muted }}>
          Scegli come ricevere i pagamenti del salone.
        </Text>
        <InfoButton accessibilityRole="button" accessibilityLabel="Informazioni sui pagamenti" accessibilityState={{ expanded: info }} onPress={() => setInfo((value) => !value)} style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: p.night ? p.border : "#B9AE9C",
            alignItems: "center",
            justifyContent: "center",
          }} />
      </View>
      {info ? (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 22,
            color: p.ink,
            borderLeftWidth: 2,
            borderColor: p.muted,
            paddingLeft: 16,
          }}
        >
          Registra i pagamenti già ricevuti sul tuo POS come “POS esterno”. Con
          Stripe, QR e link servono invece a chiedere un pagamento al cliente.
          Tap to Pay si usa nell’app su un telefono compatibile. Cassa e Agenda
          si aggiornano dopo la conferma di Stripe; il pagamento non sostituisce
          il documento fiscale.
        </Text>
      ) : null}
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            gap: 16,
            padding: 22,
            borderRadius: 17,
            backgroundColor: p.night ? "#30352F" : "#E5DED2",
            ...popupGlass(p, "panel"),
            borderWidth: 1,
            borderColor: p.night ? "#50564D" : "#B9AE9C",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                backgroundColor: p.night ? "#3F473B" : "#D6CDBF",
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="qr-code-outline" size={24} color={p.ink} />
            </View>
            {chip(qrLabel, !!status?.ready && !!status.live)}
          </View>
          <View style={{ gap: 9, flex: 1 }}>
            <Text style={{ fontFamily: "Georgia", fontSize: 26, color: p.ink }}>
              QR e link
            </Text>
            <Text style={{ color: p.muted, fontSize: 14, lineHeight: 22 }}>
              Mostra il QR o invia il link al cliente. Il pagamento avviene sul
              suo telefono.
            </Text>
          </View>
          {status?.ready && onPickMovement
            ? action("Incassa", "arrow-forward-outline", onOpenPicker, true)
            : null}
          {status?.configured && !status.connected
            ? action("Collega Stripe", "link-outline", onConnect, true)
            : null}
          {status?.connected && !status.ready
            ? action(
                "Completa configurazione Stripe",
                "arrow-forward-outline",
                onOnboard,
                true,
              )
            : null}
        </View>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            gap: 16,
            padding: 22,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: p.night ? "#50564D" : "#B9AE9C",
            backgroundColor: p.night ? "#2B2F2A" : "#D4CCBF",
            ...popupGlass(p, "panel"),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                backgroundColor: p.night ? "#393E36" : "#E5DED2",
                ...popupGlass(p, "panel"),
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="phone-portrait-outline" size={24} color={p.ink} />
            </View>
            <Text style={{ fontSize: 11, letterSpacing: 1.1, color: p.muted }}>
              DALL’APP SALONPRO
            </Text>
          </View>
          <View style={{ gap: 9 }}>
            <Text style={{ fontFamily: "Georgia", fontSize: 26, color: p.ink }}>
              Tap to Pay
            </Text>
            <Text style={{ color: p.muted, fontSize: 14, lineHeight: 22 }}>
              Ricevi una carta direttamente sul telefono, senza un POS esterno.
            </Text>
          </View>
          {chip(tapLabel)}
          <Text style={{ color: p.muted, fontSize: 12, lineHeight: 19 }}>
            Su iPhone e Android compatibili. Il dispositivo viene verificato
            prima del pagamento.
          </Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          paddingTop: 4,
        }}
      >
        <Text
          style={{
            flex: 1,
            minWidth: 180,
            color: p.muted,
            fontSize: 13,
            lineHeight: 21,
          }}
        >
          {!status
            ? statusError
              ? "Verifica non disponibile. Riprova con Aggiorna stato."
              : "Verifica del collegamento Stripe…"
            : !status.configured
              ? "Pagamenti digitali non ancora disponibili per questo salone."
              : !status.connected
                ? "Collega Stripe per attivare i pagamenti."
                : !status.ready
                  ? "Completa i dati richiesti da Stripe per continuare."
                  : status.live
                    ? "Cassa e Agenda si aggiornano dopo la conferma di Stripe."
                    : "Modalità test: nessun incasso reale."}
        </Text>
        {action(
          busy ? "Verifica in corso…" : "Aggiorna stato",
          "refresh-outline",
          onRefresh,
        )}
      </View>
      {status?.payments?.some((payment) => payment.refunded_cents > 0) ? (
        <Text style={{ color: p.muted, fontSize: 13, lineHeight: 21 }}>
          Sono presenti rimborsi Stripe. Consulta il dettaglio su Stripe: gli
          importi originali in Cassa restano conservati.
        </Text>
      ) : null}
      {statusError && status ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: p.night ? "#EACD91" : "#78551E",
            fontSize: 14,
            lineHeight: 22,
          }}
        >
          Connessione non disponibile: è mostrato lo stato dell’ultima verifica.
          Riprova con Aggiorna stato.
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: p.night ? "#FFB5B5" : "#A22D2D",
            fontSize: 14,
            lineHeight: 22,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
