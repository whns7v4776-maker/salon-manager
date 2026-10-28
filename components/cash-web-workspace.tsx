import { NativeMedal } from './owner-premium-native-home';
import { ShopSwitch } from './shop/shop-switch';
import { CASH_LOCKED_PERMISSION_LABELS } from '../src/lib/cash-locked-permissions';
import {OwnerWebPageTitle} from './owner-web-page-title';
import { premiumSectionAccent } from "./premium-section-accent";
import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { popupGlass } from "./premium-web-surfaces";
import { CashWebPanel } from "./cash-web-panel";
import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useAccessAppearance } from "./access-premium";
import { ServicesSelect } from "./services-profession-filter";
import { ServiceWebField } from "./services-web-edit-form";
import { CashWebDialog } from "./cash-web-dialog";
import { formatCash } from "../src/lib/cash-summary";
import type { CashAccessControls } from "./cash-device-gate";

export function CashWebWorkspace({
  model: m,
  access,
}: {
  model: any;
  access: CashAccessControls;
}) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const [expandedMovements, setExpandedMovements] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [selectedMovement, setMovement] = useState<any>(null);
  const movement = selectedMovement ? m.getMovement(selectedMovement.id) : null;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const surface = p.night ? "rgba(30,32,31,.88)" : "rgba(248,245,239,.85)";
  const button = (
    title: string,
    fn: () => void,
    primary = false,
    disabled = false,
    icon?: React.ComponentProps<typeof Ionicons>["name"],
    danger = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={fn}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: danger ? (p.night ? "#8A4B50" : "#D49894") : p.border,
        backgroundColor: danger
          ? p.night
            ? "#442428"
            : "#F5DDDB"
          : primary
            ? p.action
            : p.night
              ? "#2D2D2A"
              : "#E8E2D8",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={
            danger
              ? p.night
                ? "#FFB5B5"
                : "#A22D2D"
              : primary
                ? p.actionText
                : p.ink
          }
        />
      ) : null}
      <Text
        style={{
          fontSize: 13,
          fontWeight: "500",
          color: danger
            ? p.night
              ? "#FFB5B5"
              : "#A22D2D"
            : primary
              ? p.actionText
              : p.ink,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
  const heading = (title: string) => (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: "Georgia",
        fontSize: 24,
        color: p.ink,
        lineHeight: 31,
      }}
    >
      {title}
    </Text>
  );
  const panelTitles: Record<string, string> = {
    references: "Riferimenti carta facoltativi",
    reports: "Report e statistiche",
    payments: "Pagamenti e Stripe",
    policy: "Condizioni di pagamento",
    fiscal: "Ricevute fiscali",
    archive: "Archivio fiscale",
    expenses: "Spese e report mensili",
    refunds: "Rimborsi appuntamenti",
    settings: "Gestione Cassa",
  };
  // Protection on + locked: day-to-day work stays available, totals/reports/settings are reserved.
  const reserved = access.locked;
  const allow = (key: keyof typeof access.permissions) => !reserved || access.permissions[key];
  const visibleMovements = m.movements.filter((item: any) => (item.metodo || item.legacy) ? allow("movements") : allow("completePending"));
  const status = (item: any) =>
    item.legacy ? "Da verificare" : item.metodo ? "Incassato" : "Da incassare";
  // Quiet status: coloured dot + ink text (no tinted pills), same as Richieste.
  const statusColors = (item: any) => {
    const dot = item.legacy
      ? (p.night ? "#E0B46E" : "#8A5F1E")
      : item.metodo
        ? (p.night ? "#9CC7A6" : "#3F7A4D")
        : (p.night ? "#E6A9AF" : "#9A4B53");
    return { background: "transparent", border: "transparent", ink: p.ink, dot };
  };
  const statusBadge = (item: any) => {
    const colors = statusColors(item);
    return (
      <View
        {...{
          dataSet: {
            cashStatus: item.legacy
              ? "review"
              : item.metodo
                ? "paid"
                : "pending",
          },
        }}
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 4,
        }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.dot }} />
        <Text
          style={{
            color: colors.ink,
            fontSize: 12,
            fontWeight: "600",
            lineHeight: 16,
          }}
        >
          {status(item)}
        </Text>
      </View>
    );
  };
  const fieldDate = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <View style={{ gap: 6, flex: 1, minWidth: 150 }}>
      <Text style={{ color: p.muted, fontSize: 12 }}>{label}</Text>
      {React.createElement("input", {
        type: "date",
        "aria-label": label,
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value),
        style: {
          height: 46,
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${p.border}`,
          borderRadius: 11,
          padding: "0 12px",
          background: p.night ? "#2B2B29" : "#EAE4DA",
          color: p.ink,
          colorScheme: p.night ? "dark" : "light",
          fontFamily: "inherit",
        },
      })}
    </View>
  );
  const movementsPanel = (expanded = false) => (
    <View
      style={{
        borderWidth: expanded ? 0 : 1,
        borderColor: p.border,
        borderRadius: 20,
        backgroundColor: expanded ? "transparent" : surface,
        flex: expanded ? 1 : undefined,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <View
        {...{ dataSet: { cashTableToolbar: "true" } }}
        style={{
          padding: expanded ? 0 : 22,
          paddingBottom: expanded ? 18 : 22,
          backgroundColor: expanded ? undefined : premiumSectionAccent(p.night, 1).backgroundColor,
          borderBottomWidth: expanded ? 0 : 1,
          borderBottomColor: premiumSectionAccent(p.night, 1).borderColor,
          gap: 16,
        }}
      >
        <View
          {...{ dataSet: { cashToolbarHeading: "true" } }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          {expanded ? (
            <Text style={{ color: p.muted, fontSize: 14 }}>
              {m.periodLabel}
            </Text>
          ) : (
            <View {...{ dataSet: { cashTableTitle: "true" } }}>
              {heading("Movimenti")}
            </View>
          )}
          <Text style={{ color: p.muted, fontSize: 12 }}>
            {m.count} movimenti
          </Text>
          {!expanded
            ? button(
                "Espandi",
                () => setExpandedMovements(true),
                false,
                false,
                "expand-outline",
              )
            : null}
        </View>
        <PremiumSearchToolbar><View
          {...{ dataSet: { cashSearch: "true" } }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderWidth: 1,
            borderColor: p.night ? "#55574F" : "#B9AE9C",
            borderRadius: 12,
            backgroundColor: p.night ? "#2B2B29" : "#EAE4DA",
            paddingHorizontal: 14,
          }}
        >
          <Ionicons name="search-outline" size={18} color={p.muted} />
          <TextInput
            accessibilityLabel="Cerca un movimento"
            value={m.query}
            onChangeText={m.onQuery}
            placeholder="Cerca descrizione, servizio o metodo"
            placeholderTextColor={p.muted}
            style={{
              flex: 1,
              minHeight: 46,
              fontSize: 14,
              color: p.ink,
              backgroundColor: "transparent",
              borderWidth: 0,
              borderRadius: 0,
            }}
          />
        </View></PremiumSearchToolbar>
      </View>
      <View
        {...{
          dataSet: { cashRow: "true", cashTableHeading: "true" },
        }}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 22,
          backgroundColor: p.night
            ? "rgba(255,255,255,.035)"
            : "rgba(52,55,53,.05)",
        }}
      >
        {["Descrizione", "Metodo", "Importo", "Stato", ""].map(
          (label, index) => (
            <Text key={index} style={{ color: p.muted, fontSize: 12 }}>
              {label}
            </Text>
          ),
        )}
      </View>
      <ScrollView
        style={expanded ? { flex: 1, minHeight: 0 } : { maxHeight: 360 }}
        keyboardShouldPersistTaps="handled"
      >
        {m.loading ? (
          <Text style={{ padding: 24, color: p.muted }}>
            Caricamento movimenti…
          </Text>
        ) : (
          visibleMovements.map((item: any) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Apri movimento ${item.title}`}
              onPress={() => setMovement(item)}
              {...{ dataSet: { cashRow: "true", cashMovementRow: "true" } }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 22,
                borderBottomWidth: 1,
                borderColor: p.night ? "#4E514D" : "#BEB7AB",
              }}
            >
              <View style={{ gap: 5, flex: 1, minWidth: 0 }}> 
                <Text
                  style={{
                    color: p.ink,
                    fontSize: 15,
                    lineHeight: 21,
                  }}
                >
                  {item.title}
                </Text>
                <Text style={{ color: p.muted, fontSize: 12 }}>
                  {item.stamp}
                </Text>
                <View
                  {...{ dataSet: { cashMobileMeta: "true" } }}
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <Text
                    style={{
                      color: p.muted,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    {item.methodLabel}
                  </Text>
                  {statusBadge(item)}
                </View>
              </View>
              <Text
                {...{ dataSet: { cashCell: "method" } }}
                style={{ color: p.muted, fontSize: 13 }}
              >
                {item.methodLabel}
              </Text>
              <Text
                style={{
                  color: p.ink,
                  fontSize: 17,
                  fontWeight: "500",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatCash(item.importo)}
              </Text>
              <View {...{ dataSet: { cashCell: "status" } }}>
                {statusBadge(item)}
              </View>
              <View
                accessible={false}
                pointerEvents="none"
                style={{
                  width: 38,
                  height: 38,
                  borderWidth: 1,
                  borderColor: p.border,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chevron-forward" size={18} color={p.ink} />
              </View>
            </Pressable>
          ))
        )}
        {!m.loading && !visibleMovements.length ? (
          <View style={{ padding: 28, gap: 8 }}>
            <Text style={{ color: p.ink, fontSize: 17 }}>
              Nessun movimento in questo periodo
            </Text>
            <Text style={{ color: p.muted, fontSize: 13 }}>
              Cambia periodo o ricerca, oppure registra un incasso.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {m.pages > 1 ? (
        <View
          style={{
            padding: 14,
            borderTopWidth: 1,
            borderColor: p.line,
            gap: 12,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Pagina {m.page + 1} di {m.pages}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {button(
              "Precedenti",
              () => m.onPage(m.page - 1),
              false,
              m.page === 0,
            )}
            {button(
              "Successivi",
              () => m.onPage(m.page + 1),
              false,
              m.page === m.pages - 1,
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
  return (
    <View
      {...{ dataSet: { premiumCash: "root" } }}
      style={{ flex: 1, minHeight: 0 }}
    >
      {React.createElement(
        "style",
        null,
        `
 [data-premium-cash="root"]{--cash-ink:${p.ink};--cash-muted:${p.muted};--cash-line:${p.line};color:var(--cash-ink);}
 [data-premium-cash="root"] *,[data-cash-dialog] *{min-width:0;box-sizing:border-box;}
 [data-premium-cash="root"]{color-scheme:${p.night ? "dark" : "light"};}
 [data-premium-cash="root"],[data-premium-cash="root"] *{scrollbar-width:thin;scrollbar-color:${p.night ? "#777167 #222321" : "#A79B89 #DED7CD"};}
 [data-premium-cash="root"] *::-webkit-scrollbar{width:8px;height:8px;background:${p.night ? "#222321" : "#DED7CD"};}
 [data-premium-cash="root"] *::-webkit-scrollbar-track,[data-premium-cash="root"] *::-webkit-scrollbar-track:hover,[data-premium-cash="root"] *::-webkit-scrollbar-track:active{background:${p.night ? "#222321" : "#DED7CD"};}
 [data-premium-cash="root"] *::-webkit-scrollbar-thumb{border-radius:8px;background:${p.night ? "#777167" : "#A79B89"};border:2px solid ${p.night ? "#222321" : "#DED7CD"};}
 [data-premium-cash="root"] [role="button"]{transition:filter .15s ease,background-color .15s ease;}
 [data-premium-cash="root"] [role="button"]:hover:not([aria-disabled="true"]){filter:brightness(${p.night ? "1.12" : ".96"});}
 [data-premium-cash="root"] :focus{outline:none!important;}
 [data-premium-cash="root"] [role="button"]:focus-visible{box-shadow:inset 0 0 0 1px ${p.muted};}
 [data-premium-cash="root"] input:focus,[data-cash-dialog] input:focus{outline:none!important;box-shadow:none!important;}
 [data-cash-metrics]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;}
 [data-cash-metrics]>div{container-type:inline-size;min-width:0;}
 [data-cash-metric-value]{font-size:clamp(24px,10cqi,28px)!important;line-height:1.25!important;white-space:nowrap;overflow-wrap:normal;word-break:normal;font-variant-numeric:tabular-nums;}
 [data-cash-metric-icon]{flex-shrink:0;}
 [data-cash-table-title]{white-space:nowrap;}
 [data-cash-toolbar-heading]{flex-wrap:wrap;}
 [data-cash-toolbar-heading]>[dir=auto]{white-space:nowrap;}
 [data-cash-main]{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:16px;align-items:start;}
 [data-cash-row]{display:grid;grid-template-columns:minmax(180px,1.8fr) minmax(90px,.8fr) minmax(90px,.7fr) minmax(110px,.8fr) 42px;align-items:center;gap:14px;}
 [data-cash-mobile-meta]{display:none;}
 [data-cash-table-toolbar]{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:center;}
 [data-cash-search] input,[data-cash-dialog] [data-cash-search] input{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;outline:none!important;}
 [data-cash-movement-row]{transition:background-color .15s ease;}
 [data-cash-movement-row]:hover{background-color:${p.night ? "rgba(255,255,255,.035)" : "rgba(52,55,53,.035)"};}
 [data-cash-tools]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
 [data-cash-dialog] input:not([role="switch"]),[data-cash-dialog] textarea{color:${p.ink}!important;background:${p.night ? "#2B2B29" : "#EAE4DA"}!important;border-color:${p.night ? p.border : "#B9AE9C"}!important;border-radius:11px!important;}
 @media(max-width:1250px){[data-cash-main]{grid-template-columns:minmax(0,1fr);}[data-cash-row]{grid-template-columns:minmax(160px,1.6fr) 110px 100px 115px 42px;}}
 @media(max-width:480px){[data-cash-periods]{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;}[data-cash-metrics]{grid-template-columns:1fr!important;}}
 @media(max-width:700px){[data-cash-table-toolbar]{grid-template-columns:1fr;}[data-cash-mobile-meta]{display:flex;}[data-cash-tools]{grid-template-columns:1fr;}[data-cash-row]{grid-template-columns:minmax(0,1fr) auto 40px;gap:10px;}[data-cash-row] [data-cash-cell="method"],[data-cash-row] [data-cash-cell="status"]{display:none;}[data-cash-table-heading]{display:none!important;}}
 `,
      )}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          padding: 24,
          paddingTop: 24,
          gap: 18,
          paddingBottom: width < 1100 ? 116 : 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <View style={{ gap: 5 }}>
            <OwnerWebPageTitle>Cassa</OwnerWebPageTitle>
            <Text style={{ fontSize: 15, color: p.muted }}>
              Incassi e pagamenti
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {button(
              "Protezione della Cassa",
              access.onConfigure,
              false,
              false,
              "shield-checkmark-outline",
            )}
            {reserved
              ? button("Sblocca Cassa", access.onUnlock, true, false, "lock-open-outline")
              : access.enabled
                ? button(
                    "Blocca Cassa",
                    access.onLock,
                    false,
                    false,
                    "lock-closed-outline",
                  )
                : null}
            {reserved ? null : button(
              "Gestione Cassa",
              () => setPanel("settings"),
              false,
              false,
              "options-outline",
            )}
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            {...{ dataSet: { cashPeriods: "true" } }}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 4,
              maxWidth: "100%",
              flexShrink: 1,
              borderWidth: 1,
              borderColor: p.border,
              borderRadius: 13,
              padding: 4,
              backgroundColor: surface,
            }}
          >
            {(
              [
                ["today", "Oggi"],
                ["week", "Settimana"],
                ["month", "Mese"],
                ["all", "Storico"],
                ["custom", "Periodo"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                aria-pressed={m.period === id}
                onPress={() => m.onPeriod(id)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                  borderRadius: 10,
                  backgroundColor: m.period === id ? p.action : "transparent",
                }}
              >
                <Text
                  style={{
                    color: m.period === id ? p.actionText : p.ink,
                    fontSize: 13,
                    fontWeight: m.period === id ? "600" : "400",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Ionicons name="calendar-outline" size={18} color={p.muted} />
          <Text style={{ color: p.muted, fontSize: 13 }}>{m.periodLabel}</Text>
        </View>
        {m.period === "custom" ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 14,
              maxWidth: 650,
            }}
          >
            {fieldDate("Dal", m.start, m.onStart)}
            {fieldDate("Al", m.end, m.onEnd)}
          </View>
        ) : null}
        {!m.disabled ? (
          <>
            {!allow("totals") ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, padding: 18, borderRadius: 19, borderWidth: 1, borderColor: p.night ? p.border : "rgba(122,100,70,.2)", backgroundColor: p.night ? "rgba(38,41,43,.92)" : "rgba(255,253,250,.9)" }}>
                <NativeMedal icon="lock-closed-outline" size={44} iconSize={20} accent={p.night ? "#D6B27A" : "#8C6A35"} />
                <View style={{ flex: 1, minWidth: 220, gap: 3 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: p.ink }}>Totali e report riservati</Text>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>Il titolare ha scelto cosa resta disponibile con la Cassa bloccata. Sblocca per vedere tutto.</Text>
                </View>
                {button("Sblocca", access.onUnlock, true, false, "lock-open-outline")}
              </View>
            ) : (
            <>
            {/* Summary like Richieste/Home: hero amount, then three quiet stats with medallions. */}
            <View style={{ borderWidth: 1, borderColor: p.night ? p.border : "rgba(122,100,70,.2)", borderRadius: 19, backgroundColor: p.night ? "rgba(38,41,43,.92)" : "rgba(255,253,250,.9)", padding: 20, gap: 16, shadowColor: "#000", shadowOpacity: p.night ? 0.3 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <NativeMedal icon="receipt-outline" size={48} iconSize={22} accent={p.night ? "#D6B27A" : "#8C6A35"} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 13, color: p.muted }}>Incassato · {m.periodLabel}</Text>
                  <Text style={{ fontSize: 34, lineHeight: 40, fontWeight: "600", letterSpacing: -1, color: p.ink, fontVariant: ["tabular-nums"] }}>{m.loading ? "—" : formatCash(m.total)}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: p.line }} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14 }}>
                {([
                  { label: "Contanti", amount: m.cash, icon: "cash-outline", accent: ["#86C2BE", "#3E7C7A"] },
                  { label: "Carta", amount: m.card, icon: "card-outline", accent: ["#BFA6D4", "#7A5C8E"] },
                  { label: "Da incassare", amount: m.pending, icon: "time-outline", accent: ["#D99A92", "#A35A52"] },
                ] as const).map((metric, i) => (
                  <View key={metric.label} style={{ flexGrow: 1, flexBasis: 180, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 12, borderLeftWidth: i ? 1 : 0, borderLeftColor: p.line }}>
                    <NativeMedal icon={metric.icon} size={40} iconSize={18} accent={p.night ? metric.accent[0] : metric.accent[1]} />
                    <View style={{ minWidth: 0 }}>
                      <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: "600", color: p.ink, fontVariant: ["tabular-nums"] }}>{m.loading ? "—" : formatCash(metric.amount)}</Text>
                      <Text style={{ fontSize: 12, color: p.muted }}>{metric.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
            </>
            )}
            <View {...{ dataSet: { cashMain: "true" } }}>
              {movementsPanel()}
              {allow("newPayment") ? (
              <View
                style={{
                  padding: 22,
                  gap: 18,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: p.border,
                  backgroundColor: surface,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <NativeMedal icon="add-outline" size={42} iconSize={20} accent={p.night ? "#D6B27A" : "#8C6A35"} />
                  {heading("Nuovo incasso")}
                </View>
                <Text style={{ fontSize: 13, lineHeight: 20, color: p.muted }}>
                  Registra un pagamento già ricevuto.
                </Text>
                <ServicesSelect
                  fullWidth
                  label="Scegli un servizio"
                  placeholder="Scegli un servizio dal listino"
                  value={
                    m.services.find((s: any) => s.nome === m.description)?.id ??
                    ""
                  }
                  entries={m.services.map((s: any) => ({
                    value: s.id,
                    label: `${s.nome} · ${formatCash(s.prezzo)}`,
                  }))}
                  onChange={(id) => m.onService(id)}
                />
                <ServiceWebField
                  label="Servizio o descrizione"
                  value={m.description}
                  onChange={(value) => {
                    setShowSuggestions(true);
                    m.onDescription(value);
                  }}
                  placeholder="Es. Taglio e piega"
                />
                {showSuggestions &&
                m.description.trim() &&
                m.suggestions.length ? (
                  <View {...{dataSet:{premiumSearchResults:"true"}}}
                    style={{
                      borderWidth: 1,
                      borderColor: p.border,
                      borderRadius: 12,
                      padding: 7,
                      gap: 4,
                      backgroundColor: p.field,
                    }}
                  >
                    {m.suggestions.map((item: any) => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        accessibilityLabel={"Usa " + item.label}
                        onPress={() => {
                          m.onSuggestion(item);
                          setShowSuggestions(false);
                        }}
                        style={{ padding: 11, borderRadius: 8 }}
                      >
                        <Text style={{ fontSize: 13, color: p.ink }}>
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <ServiceWebField
                  label="Importo"
                  value={m.amount}
                  onChange={m.onAmount}
                  numeric
                  unit="€"
                  placeholder="0,00"
                />
                <ServicesSelect
                  fullWidth
                  label="Metodo di pagamento"
                  value={m.method}
                  onChange={m.onMethod}
                  entries={[
                    { value: "Contanti", label: "Contanti" },
                    { value: "Carta", label: "POS esterno" },
                    { value: "Bonifico", label: "Bonifico" },
                  ]}
                />
                {m.method === "Carta" ? (
                  <Text
                    style={{ color: p.muted, fontSize: 12, lineHeight: 19 }}
                  >
                    Registra soltanto un pagamento già ricevuto sul POS. Non
                    inserire dati della carta del cliente.
                  </Text>
                ) : null}
                {button(
                  m.saving ? "Registrazione…" : "Registra incasso",
                  m.onSave,
                  true,
                  !m.canSave || m.saving,
                  "add-outline",
                )}
              </View>
              ) : null}
            </View>
            {!allow("reports") ? null : (
            <View
              style={{
                padding: 22,
                gap: 18,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: p.border,
                backgroundColor: surface,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <NativeMedal icon="analytics-outline" size={42} iconSize={19} accent={p.night ? "#9DBAD6" : "#4D6E8F"} />
                    {heading("Report e statistiche")}
                  </View>
                  <Text style={{ color: p.muted, fontSize: 13 }}>
                    Esporta il periodo selezionato o consulta spese e
                    riepiloghi.
                  </Text>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {button(
                    m.exporting ? "Preparazione…" : "PDF / Stampa",
                    () => m.onExport(true),
                    false,
                    m.exporting || m.loading,
                    "document-text-outline",
                  )}
                  {button(
                    "Scarica Excel",
                    () => m.onExport(false),
                    false,
                    m.exporting || m.loading,
                    "download-outline",
                  )}
                </View>
              </View>
              {m.comparison ? (
                <Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>
                  Periodo precedente: {formatCash(m.comparison.previousTotal)} ·
                  Variazione: {formatCash(m.total - m.comparison.previousTotal)}
                </Text>
              ) : null}
            </View>
            )}
          </>
        ) : (
          <View
            style={{
              padding: 28,
              gap: 12,
              borderRadius: 18,
              backgroundColor: surface,
              borderWidth: 1,
              borderColor: p.border,
            }}
          >
            {heading("Cassa disattivata")}
            <Text style={{ color: p.muted, fontSize: 14 }}>
              I movimenti sono conservati. Puoi riattivarla in Gestione Cassa.
            </Text>
            {button("Gestione Cassa", () => setPanel("settings"))}
          </View>
        )}
        {access.enabled && !reserved ? (
          <View style={{ padding: 20, gap: 14, borderRadius: 19, borderWidth: 1, borderColor: p.night ? p.border : "rgba(122,100,70,.2)", backgroundColor: p.night ? "rgba(38,41,43,.92)" : "rgba(255,253,250,.9)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <NativeMedal icon="shield-checkmark-outline" size={42} iconSize={19} accent={p.night ? "#D6B27A" : "#8C6A35"} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {heading("Con la Cassa bloccata si può…")}
                <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>Scegli cosa resta disponibile ai collaboratori quando blocchi la Cassa su questo dispositivo. Le impostazioni restano sempre riservate.</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {CASH_LOCKED_PERMISSION_LABELS.map((item) => {
                const on = access.permissions[item.key];
                return (
                  <Pressable key={item.key} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => access.setPermission(item.key, !on)}
                    style={{ flexGrow: 1, flexBasis: 260, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: on ? (p.night ? "#9C8461" : "#7A6446") : (p.night ? p.border : "rgba(122,100,70,.2)"), backgroundColor: on ? (p.night ? "rgba(156,132,97,.12)" : "rgba(122,100,70,.07)") : "transparent" }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: p.ink }}>{item.title}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: p.muted }}>{item.hint}</Text>
                    </View>
                    <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: "center", backgroundColor: on ? (p.night ? "#9C8461" : "#7A6446") : (p.night ? "#3A3D3E" : "#D8CFC2") }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFDF8", alignSelf: on ? "flex-end" : "flex-start" }} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <View {...{ dataSet: { cashTools: "true" } }}>
          {[
            [
              "payments",
              "Pagamenti e Stripe",
              "QR, link e configurazione pagamenti",
              "card-outline",
            ],
            [
              "policy",
              "Condizioni di pagamento",
              "Acconti e regole delle prenotazioni",
              "options-outline",
            ],
            [
              "expenses",
              "Spese e report mensili",
              "Spese, riepiloghi e invio dei report",
              "stats-chart-outline",
            ],
            [
              "fiscal",
              "Ricevute fiscali",
              "Configurazione e stato del collegamento",
              "receipt-outline",
            ],
            [
              "archive",
              "Archivio fiscale",
              "Consulta i documenti registrati",
              "archive-outline",
            ],
            [
              "refunds",
              "Rimborsi appuntamenti",
              "Riepilogo dei rimborsi e degli stati",
              "return-down-back-outline",
            ],
          ].filter(([id]) => !reserved || (id === "payments" && allow("payments"))).map(([id, title, copy, icon]) => {
            // One enamel colour per tool, same family as Home and Richieste.
            const accent = ({ payments: ["#A9ABD9", "#5B5E9A"], policy: ["#D6B27A", "#8C6A35"], expenses: ["#9CC5A3", "#4E7A55"], fiscal: ["#D99A92", "#A35A52"], archive: ["#C9AA8C", "#7E6247"], refunds: ["#86C2BE", "#3E7C7A"] } as Record<string, string[]>)[id];
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={"Apri " + title.toLowerCase()}
                onPress={() => setPanel(id as any)}
                {...{ dataSet: { premiumHoverCard: "true" } }}
                style={{
                  padding: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: p.night ? p.border : "rgba(122,100,70,.2)",
                  backgroundColor: surface,
                }}
              >
                <NativeMedal icon={icon as any} size={44} iconSize={20} accent={p.night ? accent[0] : accent[1]} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: p.ink }}>{title}</Text>
                  <Text style={{ color: p.muted, fontSize: 13, lineHeight: 19 }}>{copy}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={p.muted} />
              </Pressable>
            );
          })}
        </View>
        <CashWebPanel>{m.shop}</CashWebPanel>
      </ScrollView>
      {expandedMovements ? (
        <CashWebDialog
          title="Movimenti"
          expanded
          onClose={() => setExpandedMovements(false)}
        >
          {movementsPanel(true)}
        </CashWebDialog>
      ) : null}
      {panel ? (
        <CashWebDialog
          title={panelTitles[panel]}
          onClose={() => setPanel(null)}
        >
          {panel === "settings" ? (
            <View {...{ dataSet: { cashManagement: "true" } }} style={{ gap: 16 }}>
              <Text style={{ color: p.muted, fontSize: 14, lineHeight: 21 }}>
                Impostazioni della Cassa del salone. La protezione con password si gestisce da Protezione della Cassa.
              </Text>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: p.night ? p.border : "rgba(122,100,70,.2)", backgroundColor: surface, paddingHorizontal: 16 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Riferimenti carta"
                  onPress={() => setPanel("references")}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}
                >
                  <NativeMedal icon="card-outline" size={40} iconSize={18} accent={p.night ? "#C9AA8C" : "#7E6247"} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: p.ink }}>Riferimenti carta</Text>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>Un aiuto facoltativo per riconoscere gli incassi del POS esterno.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={p.muted} />
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, borderTopWidth: 1, borderTopColor: p.line }}>
                  <NativeMedal icon="wallet-outline" size={40} iconSize={18} accent={p.night ? "#D6B27A" : "#8C6A35"} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: p.ink }}>Cassa attiva</Text>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>
                      {m.toggling ? "Salvataggio…" : m.disabled ? "Disattivata: i movimenti restano conservati." : "Se la disattivi, i movimenti restano conservati e puoi riattivarla quando vuoi."}
                    </Text>
                  </View>
                  <ShopSwitch accessibilityLabel="Cassa attiva" value={!m.disabled} disabled={m.toggling} onValueChange={() => m.onToggleDisabled()} />
                </View>
              </View>
            </View>
          ) : panel === "references" ? (
            <CashCardReferences model={m.references} />
          ) : (
            <CashWebPanel
              emptyText={
                panel === "refunds"
                  ? "Nessun rimborso da verificare."
                  : panel === "payments"
                    ? "Pagamenti Stripe non disponibili per questo salone."
                    : panel === "archive"
                      ? "Archivio fiscale non disponibile per questo salone."
                      : "Collegamento fiscale non disponibile per questo salone."
              }
            >
              {m.panels[panel]}
            </CashWebPanel>
          )}
        </CashWebDialog>
      ) : null}
      {movement ? (
        <CashWebDialog
          title="Dettaglio movimento"
          onClose={() => setMovement(null)}
        >
          <View style={{ gap: 10 }}>
            {heading(movement.title)}
            <Text style={{ fontSize: 14, color: p.muted }}>
              {movement.stamp}
            </Text>
            <Text style={{ fontSize: 32, fontFamily: "Georgia", color: p.ink }}>
              {formatCash(movement.importo)}
            </Text>
            {statusBadge(movement)}
            <Text style={{ color: p.muted, fontSize: 14 }}>
              {movement.methodLabel}
            </Text>
          </View>
          {!movement.metodo && !movement.legacy ? (
            <>
              <Text style={{ fontSize: 14, color: p.muted, lineHeight: 22 }}>
                Scegli come hai ricevuto il pagamento per registrarlo.
              </Text>
              {m.loyalty(movement.id)}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Contanti", "Carta", "Bonifico"].map((method) =>
                  button(
                    method === "Carta" ? "POS esterno" : method,
                    async () => {
                      await m.onSetMethod(movement.id, method);
                      setMovement(null);
                    },
                  ),
                )}
                {m.stripeAvailable
                  ? button(
                      "Incassa con Stripe",
                      () => {
                        m.onStripeMovement(movement);
                        setMovement(null);
                        setPanel("payments");
                      },
                      true,
                    )
                  : null}
              </View>
            </>
          ) : null}
        </CashWebDialog>
      ) : null}
    </View>
  );
}

export function CashShopTrigger({
  onPress,
  needsAttention,
}: {
  onPress: () => void;
  needsAttention: boolean;
}) {
  const { palette: p } = useAccessAppearance();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Apri vendite prodotti e ritiri"
      onPress={onPress}
      {...{ dataSet: { premiumHoverCard: "true" } }}
      style={{
        padding: 20,
        borderWidth: 1,
        borderColor: needsAttention ? (p.night ? "#9C8461" : "#7A6446") : p.night ? p.border : "rgba(122,100,70,.2)",
        borderRadius: 18,
        backgroundColor: p.night ? "rgba(30,32,31,.88)" : "rgba(248,245,239,.85)",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <NativeMedal icon="bag-handle-outline" size={46} iconSize={21} accent={p.night ? "#D69AB0" : "#9A4F67"} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontFamily: "Georgia", fontSize: 22, color: p.ink }}>
          Vendite prodotti e ritiri
        </Text>
        <Text style={{ fontSize: 13, color: p.muted }}>
          {needsAttention
            ? "Ci sono attività da gestire"
            : "Apri la vendita prodotti e gli ordini da ritirare."}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={p.muted} />
    </Pressable>
  );
}

function CashCardReferences({ model: m }: { model: any }) {
  const { palette: p } = useAccessAppearance();
  const action = (
    label: string,
    fn: () => void,
    disabled = false,
    danger = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={fn}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: danger ? (p.night ? "#75454E" : "#CF9C9C") : p.border,
        backgroundColor: danger ? (p.night ? "#452E33" : "#E9D1D0") : p.field,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: danger ? (p.night ? "#F0B4BD" : "#963F48") : p.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 20 }}>
      <Text style={{ fontSize: 14, lineHeight: 22, color: p.muted }}>
        Semplici annotazioni facoltative: non collegano carte, banche o POS e
        non autorizzano addebiti. Inserisci soltanto le ultime quattro cifre.
      </Text>
      <ServiceWebField
        label="Nome del riferimento"
        value={m.name}
        onChange={m.onName}
      />
      <ServiceWebField
        label="Circuito"
        value={m.network}
        onChange={m.onNetwork}
        placeholder="Es. Visa, Mastercard"
      />
      <ServiceWebField
        label="Ultime quattro cifre"
        value={m.last4}
        onChange={(value) => m.onLast4(value.replace(/\D/g, "").slice(0, 4))}
        numeric
        maxLength={4}
      />
      {action("Salva riferimento", m.onSave, !m.canSave)}
      {m.items.map((item: any) => (
        <View
          key={item.id}
          style={{
            gap: 10,
            paddingTop: 18,
            borderTopWidth: 1,
            borderColor: p.line,
          }}
        >
          <Text style={{ fontSize: 17, color: p.ink }}>{item.nome}</Text>
          <Text style={{ fontSize: 14, color: p.muted }}>
            {item.circuito} · •••• {item.ultime4}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {action(
              item.predefinita ? "Predefinito" : "Imposta predefinito",
              () => m.onDefault(item.id),
              item.predefinita,
            )}
            {action(
              "Rimuovi riferimento",
              () => m.onRemove(item.id),
              false,
              true,
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
