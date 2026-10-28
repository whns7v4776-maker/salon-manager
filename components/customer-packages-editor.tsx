import { PremiumChoiceRow } from './ui/premium-choice-row';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles, useCustomerPremiumAppearance } from './owner-premium-customers-style';
import { useBenefitsRefresh } from "../src/lib/use-benefits-refresh";
import { BenefitsSectionHeader } from "./benefits-section-header";
import { BenefitPackageBuilder } from "./benefit-package-builder";

import { BenefitDateField } from "./benefit-date-field";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import { supabase } from "../src/lib/supabase";
import {
  type PackageCatalog,
  type CustomerPackage,
  type PackageEntitlement,
  packageMoney,
  benefitOperationId,
} from "../src/lib/service-packages";
import { CreationSheet } from "./creation-sheet";
import { HapticTouchable } from "./ui/haptic-touchable";
import { CustomerBenefitExtras } from "./customer-benefit-extras";

type Props = {
  workspaceId: string;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onShow?: () => void;
  customerSelector?: React.ReactNode;
  startAssignment?: boolean;
  initialCatalogId?: string;
  renderCatalogAssignment?: (catalogId: string) => React.ReactNode;
  initialSection?: "settings" | "packages" | "points" | "gifts";
  onSectionChange?: (
    section: "settings" | "packages" | "points" | "gifts",
  ) => void;
};
const blank = { name: "", uses: "3", months: "3", price: "", discount: "0" };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function CustomerPackagesEditor({
  workspaceId,
  customerId,
  customerName,
  onClose,
  onShow,
  customerSelector,
  initialSection,
  startAssignment = false,
  initialCatalogId,
  renderCatalogAssignment,
  onSectionChange,
}: Props) {
 const premiumColor=useCustomerPremiumColor();

 const s=useCustomerPremiumStyles(baseCustomerComponentStyles);
 const premium=useCustomerPremiumAppearance();
 const {width:choiceViewportWidth}=useWindowDimensions();

  const [section, setSection] = useState<
    "settings" | "packages" | "points" | "gifts"
  >(initialSection || (customerId ? "packages" : "settings"));
  const changeSection = (
    next: "settings" | "packages" | "points" | "gifts",
  ) => {
    setSection(next);
    onSectionChange?.(next);
  };
  const [catalog, setCatalog] = useState<PackageCatalog[]>([]);
  const [owned, setOwned] = useState<CustomerPackage[]>([]);
  const [services, setServices] = useState<PackageEntitlement[]>([]);
  const [editing, setEditing] = useState<PackageCatalog | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [selected, setSelected] = useState<PackageEntitlement[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(startAssignment);
  const [assign, setAssign] = useState<PackageCatalog | null>(null);
  const initialAssignmentOpened = useRef(false);
  useEffect(() => {
    if (!customerId || !initialCatalogId || initialAssignmentOpened.current) return;
    const model = catalog.find((p) => p.id === initialCatalogId && !p.archived);
    if (!model) return;
    initialAssignmentOpened.current = true;
    purchaseId.current = benefitOperationId();
    setAssign(model);
    setMethod("cash");
    setStart(today());
  }, [catalog, customerId, initialCatalogId]);
  const [start, setStart] = useState(today);
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">(
    "cash",
  );
  const [busy, setBusy] = useState(false);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [packagesEnabled, setPackagesEnabled] = useState(false);
  const lock = useRef(false);
  const purchaseId = useRef(benefitOperationId());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const readGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;
    const results = await Promise.all([
      customerId
        ? supabase.rpc("owner_customer_benefits", { p_customer: customerId })
        : supabase.rpc("owner_benefits_console"),
      supabase
        .from("services")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .is("superseded_by_composition_id", null)
        .eq("composition_only", false)
        .order("name"),
      supabase
        .from("service_compositions")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name"),
    ]);
    const failure = results.find((r) => r.error)?.error;
    if (failure)
      throw new Error("Pacchetti non disponibili. Riprova tra poco.");
    if (!alive.current || generation !== readGeneration.current) return;
    setCatalog(results[0].data?.catalog ?? []);
    setOwned(results[0].data?.packages ?? []);
    setServices([
      ...(results[1].data ?? []).map((s: any) => ({
        ...s,
        kind: "service" as const,
        componentIds: [s.id],
      })),
      ...(results[2].data ?? []).map((s: any) => ({
        ...s,
        kind: "composition" as const,
        componentIds: [],
      })),
    ]);
  }, [workspaceId, customerId]);
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useBenefitsRefresh(workspaceId, async () => { if (!lock.current) await refresh(); });
  const run = async (work: () => Promise<void>) => {
    if (lock.current || extrasBusy) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const edit = (p: PackageCatalog | "new") => {
    setAssign(null);
    setEditing(p);
    setSelected(p === "new" ? [] : p.entitlements);
    setForm(
      p === "new"
        ? blank
        : {
            name: p.name,
            uses: String(p.uses),
            months: String(p.months),
            price: String(p.price_cents / 100),
            discount: String(p.product_discount),
          },
    );
    setError("");
  };
  const save = (archived = false) =>
    run(async () => {
      const price = Number(form.price.replace(",", "."));
      if (
        !form.name.trim() ||
        !selected.length ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isInteger(Number(form.uses)) ||
        Number(form.uses) < 1 ||
        !Number.isInteger(Number(form.months)) ||
        Number(form.months) < 1
      )
        throw new Error("Completa nome, servizi, utilizzi, mesi e prezzo.");
      const current = editing && editing !== "new" ? editing : null;
      const { data: saved, error: failure } = await supabase.rpc("save_service_package", {
        p_id: current?.id ?? null,
        p_revision: current?.revision ?? 0,
        p_name: form.name,
        p_services: selected.map(({ id, kind }) => ({ id, kind })),
        p_uses: Number(form.uses),
        p_months: Number(form.months),
        p_price_cents: Math.round(price * 100),
        p_product_discount: Number(form.discount),
        p_archived: archived,
      });
      if (failure) throw new Error(failure.message);
      setEditing(null);
      if (customerId && editing === "new" && !archived && saved) {
        purchaseId.current = benefitOperationId();
        setAssign(saved as PackageCatalog);
        setMethod("cash");
        setStart(today());
        setNotice(`Modello creato. Ora conferma l’assegnazione a ${customerName}: nessun incasso ancora registrato.`);
        return;
      }
      setNotice(
        archived
          ? "Pacchetto archiviato. Gli acquisti esistenti restano validi."
          : "Modello salvato nel catalogo del salone. Nessun abbonamento assegnato: scegli un cliente e conferma l’assegnazione.",
      );
    });
  const button = (label: string, onPress: () => void, secondary = false) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy || extrasBusy}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: premiumColor("#334155","color") }]}>
        {label}
      </Text>
    </HapticTouchable>
  );
  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      visible
      transparent
      animationType="none"
      onShow={onShow}
      onRequestClose={() => {
        if (!busy && !extrasBusy) onClose();
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CreationSheet premiumWeb={!!premium} premiumKind="customer" fillAvailableHeight={false}
          keepFocusedFieldVisible
          title="Pacchetti e vantaggi"
          icon="layers-outline"
          onClose={() => {
            if (!busy && !extrasBusy) onClose();
          }}
          animatePresentation
        >
          <View style={s.stack}>
            <View pointerEvents={busy || extrasBusy ? "none" : "auto"}>
              {busy || extrasBusy || editing || assign ? null : customerSelector}
            </View>
            <Text style={s.title}>
              {customerName || "Gestione generale del salone"}
            </Text>
            <PremiumChoiceRow style={s.row}>
              {(
                [
                  ["settings", "Panoramica", "grid-outline"],
                  ["packages", "Abbonamenti", "layers-outline"],
                  ["points", "Fedeltà", "heart-outline"],
                  ["gifts", "Gift card", "gift-outline"],
                ] as const
              ).map(([id, label, icon]) => (
                <HapticTouchable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: section === id }}
                  disabled={busy || extrasBusy || !!editing || !!assign}
                  onPress={() => changeSection(id)}
                  style={{
                    flexGrow: 1,
                    flexBasis: choiceViewportWidth<=600 ? "auto" : "42%",
                    flexShrink:0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                    padding: 14,
                    borderRadius: 15,
                    backgroundColor: premium ? (section === id ? premium.action : premium.field) : (section === id ? premiumColor("#953651","backgroundColor") : premiumColor("#F3F4F7","backgroundColor")),
                    borderWidth:1,borderColor:premium?.border || premiumColor("#E1D9E2","borderColor"),
                  }}
                >
                  <Ionicons
                    name={icon}
                    size={19}
                    color={premium ? (section===id?premium.actionText:premium.ink) : (section === id ? premiumColor("#FFF","color") : premiumColor("#7C6572","color"))}
                  />
                  <Text
                    style={{
                      fontWeight: "700",
                      color: premium ? (section===id?premium.actionText:premium.ink) : (section === id ? premiumColor("#FFF","color") : premiumColor("#475467","color")),
                    }}
                  >
                    {label}
                  </Text>
                </HapticTouchable>
              ))}
            </PremiumChoiceRow>
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            {notice ? (
              <Text accessibilityLiveRegion="polite" style={s.success}>
                {notice}
              </Text>
            ) : null}
            {loading ? <ActivityIndicator /> : null}
            {section === "packages" ? <BenefitsSectionHeader title={customerId ? `Abbonamenti di ${customerName}` : "Abbonamenti del salone"} description={customerId ? "Qui trovi soltanto gli abbonamenti già assegnati a questo cliente." : "Scegli un modello e assegnalo a un cliente."} icon="layers-outline" scope={customerId ? "Vantaggi del cliente" : "Catalogo del salone"}/> : null}
            {section === "packages" &&
              owned.map((p) => (
                <View key={p.id} style={s.card}>
                  <Text style={s.title}>{p.name}</Text>
                  <Text style={s.copy}>
                    {p.entitlements.map((e) => e.name).join(" · ")}
                  </Text>
                  <Text style={s.balance}>
                    {p.expires_on < today()
                      ? "Scaduto"
                      : `${p.available} disponibili · ${p.reserved} prenotati · ${p.consumed} utilizzati`}
                  </Text>
                  <Text style={s.copy}>
                    Dal {p.starts_on.split("-").reverse().join("/")} al{" "}
                    {p.expires_on.split("-").reverse().join("/")} ·{" "}
                    {packageMoney(p.price_cents)} già registrati
                  </Text>
                  {p.product_discount > 0 ? (
                    <Text style={s.copy}>
                      Vantaggio prodotti: {p.product_discount}% (da applicare in
                      salone)
                    </Text>
                  ) : null}
                </View>
              ))}
            <View
              style={section === "packages" ? { display: "none" } : undefined}
            >
              <CustomerBenefitExtras
                section={section === "packages" ? "settings" : section}
                onOpenSection={changeSection}
                workspaceId={workspaceId}
                customerId={customerId}
                onSettings={setPackagesEnabled}
                onBusy={setExtrasBusy}
                disabled={busy}
              />
            </View>
            {section === "packages" && !packagesEnabled ? (
              <Text style={s.copy}>
                Nuove assegnazioni disattivate. I pacchetti già acquistati
                restano validi.
              </Text>
            ) : null}
            {section === "packages" &&
            customerId &&
            !loading &&
            !owned.length ? (
              <View style={s.card}><Text style={s.title}>Nessun abbonamento assegnato</Text><Text style={s.copy}>{customerName} non ha ancora un abbonamento. Creare un modello nel catalogo non lo assegna al cliente.</Text></View>
            ) : null}
            {section === "packages" && !editing && !assign ? (
              <>
                {customerId ? button(catalogOpen ? "Chiudi catalogo del salone" : "Assegna un nuovo abbonamento", () => setCatalogOpen(v => !v), catalogOpen) : null}
                {!customerId || catalogOpen ? <View style={{ gap: 12 }}>
                {customerId ? <Text style={s.copy}>Scegli il modello da assegnare a {customerName}.</Text> : null}
                {catalog.map((p) => (
                  <View key={p.id} style={[s.card, { backgroundColor: premiumColor("#FFFFFF","backgroundColor"), borderColor: premiumColor("#D7DFEA","borderColor"), borderRadius: 16, padding: 14, gap: 12 }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                        <Text style={[s.title, { fontSize: 17 }]}>{p.name}{p.archived ? " · Archiviato" : ""}</Text>
                        <Text style={{ color: premiumColor("#526477","color"), fontSize: 13 }}>{p.uses} utilizzi · {p.months} mesi</Text>
                      </View>
                      <View style={{ backgroundColor: premiumColor("#F8E9EF","backgroundColor"), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}><Text style={{ color: premiumColor("#8D304D","color"), fontSize: 16, fontWeight: "800" }}>{packageMoney(p.price_cents)}</Text></View>
                    </View>
                    <View style={{ padding: 10, borderRadius: 10, backgroundColor: premiumColor("#F4F7FB","backgroundColor"), gap: 4 }}>
                      <Text style={{ color: premiumColor("#60728A","color"), fontSize: 10, fontWeight: "700", letterSpacing: 0.7 }}>SERVIZI INCLUSI</Text>
                      <Text style={{ color: premiumColor("#334A62","color"), fontSize: 13, lineHeight: 19 }}>{p.entitlements.map((e) => e.name).join(" · ")}</Text>
                    </View>
                    <View style={{ gap: 8, alignSelf: "stretch", flexDirection:"row", flexWrap:"wrap", justifyContent:"center" }}>
                      {!p.archived && customerId && packagesEnabled
                        ? button(`Assegna a ${customerName}`, () => {
                            purchaseId.current = benefitOperationId();
                            setAssign(p);
                            setMethod("cash");
                            setStart(today());
                          })
                        : null}
                      {button("Modifica modello", () => edit(p), true)}
                      {!p.archived ? button(p.online_visible ? "Nascondi dalla vetrina clienti" : "Mostra nella vetrina clienti", () => void run(async () => {
                        const {error} = await supabase.rpc('set_package_online_visibility', {p_catalog:p.id,p_visible:!p.online_visible});
                        if(error) throw Error(error.message);
                      }), true) : null}
                      <Text style={s.copy}>{p.online_visible ? "Visibile ai clienti. Acquistabile online quando Stripe è attivo." : "Visibile solo al salone."}</Text>
                    </View>
                    {!customerId && !p.archived && packagesEnabled ? renderCatalogAssignment?.(p.id) : null}
                  </View>
                ))}
                {button("+ Nuovo modello", () => edit("new"), true)}
                </View> : null}
              </>
            ) : null}
            {editing ? (
              <BenefitPackageBuilder
                key={editing === "new" ? "new" : editing.id}
                saveLabel={customerId && editing === "new" ? `Salva modello e continua per ${customerName}` : "Salva modello del salone"}
                form={form}
                setForm={setForm}
                services={services}
                selected={selected}
                setSelected={setSelected}
                busy={busy || extrasBusy}
                onSave={() => void save()}
                onCancel={() => setEditing(null)}
                onArchive={
                  editing !== "new" && !editing.archived
                    ? () => void save(true)
                    : undefined
                }
              />
            ) : null}
            {packagesEnabled && assign ? (
              <View style={s.card}>
                <Text style={s.title}>Assegna {assign.name}</Text>
                <Text style={s.balance}>{customerName}</Text>
                <Text style={s.copy}>
                  {assign.uses} utilizzi in {assign.months} mesi ·{" "}
                  {packageMoney(assign.price_cents)}. Conferma soltanto dopo
                  aver ricevuto il pagamento. Non viene eseguito alcun addebito.
                </Text>
                <BenefitDateField
                  label="Inizio validità"
                  value={start}
                  onChange={setStart}
                  disabled={busy || extrasBusy}
                />
                <View style={s.row}>
                  {(["cash", "card", "bank_transfer"] as const).map((m, i) => (
                    <HapticTouchable
                      key={m}
                      disabled={busy || extrasBusy}
                      onPress={() => setMethod(m)}
                      style={[s.choice, method === m && s.chosen]}
                    >
                      <Text style={{color:premiumColor("#26384A")}}>{["Contanti", "POS", "Bonifico"][i]}</Text>
                    </HapticTouchable>
                  ))}
                </View>
                {button(
                  `Conferma incasso ${packageMoney(assign.price_cents)} e assegna a ${customerName}`,
                  () =>
                    void run(async () => {
                      if (
                        !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
                        !Number.isFinite(Date.parse(start))
                      )
                        throw new Error("Inserisci una data valida.");
                      const { error: failure } = await supabase.rpc(
                        "assign_service_package",
                        {
                          p_purchase_id: purchaseId.current,
                          p_customer_id: customerId,
                          p_catalog_id: assign.id,
                          p_revision: assign.revision,
                          p_starts_on: start,
                          p_payment_method: method,
                        },
                      );
                      if (failure) throw new Error(failure.message);
                      setAssign(null);
                      setCatalogOpen(false);
                      setNotice(
                        `Abbonamento assegnato a ${customerName}. Incasso registrato in Cassa.`,
                      );
                    }),
                )}
                {button("Annulla assegnazione", () => setAssign(null), true)}
              </View>
            ) : null}
            {busy ? <ActivityIndicator /> : null}
          </View>
        </CreationSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}
const baseCustomerComponentStyles = StyleSheet.create({
  stack: { gap: 14 },
  title: { fontSize: 18, fontWeight: "700", color: "#152A3B" },
  copy: { fontSize: 14, lineHeight: 21, color: "#526477" },
  card: {
    backgroundColor: "#FBF5F8",
    borderColor: "#EAD9E2",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  balance: { fontSize: 15, fontWeight: "700", color: "#963B57" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    backgroundColor: "#963B57",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  secondary: { backgroundColor: "#EAF0F6" },
  buttonText: { fontWeight: "700", color: "#FFF", fontSize: 14 },
  label: { fontWeight: "600", color: "#334155", marginBottom: 6 },
  input: {
    backgroundColor: "#F7F9FC",
    borderWidth: 1,
    borderColor: "#D7DFE7",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#17293A",
  },
  choice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DFE5EE",
  },
  chosen: { backgroundColor: "#F8E8EF", borderColor: "#C5839A" },
  error: { color: "#B42318" },
  success: { color: "#176B53" },
});

