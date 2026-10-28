import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';

import { benefitsDesign as baseBenefitsDesign } from "./benefits-design";
import { GiftCardLookup } from "./gift-card-lookup";
import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { CustomerPackagesEditor } from "./customer-packages-editor";
import { HapticTouchable } from "./ui/haptic-touchable";
export function BenefitsConsole({
  workspaceId,
  customers,
  onClose,
  onShow,
  initialSection = "settings",
}: {
  workspaceId: string;
  customers: { id: string; full_name: string }[];
  onClose: () => void;
  onShow?: () => void;
  initialSection?: "settings" | "packages" | "points" | "gifts";
}) {
 const premiumColor=useCustomerPremiumColor();

 const benefitsUi=useCustomerPremiumStyles(baseBenefitsDesign);

  const [section, setSection] = useState<
    "settings" | "packages" | "points" | "gifts"
  >(initialSection);
  const [mode, setMode] = useState<"none" | "customer" | "gift">("none");
  const [selected, setSelected] = useState<{
      id: string;
      full_name: string;
    } | null>(null),
    [search, setSearch] = useState("");
  const [assignmentCatalogId, setAssignmentCatalogId] = useState<string | undefined>();
  return (
    <CustomerPackagesEditor
      key={selected?.id || "salon"}
      startAssignment={!!selected && section === "packages"}
      initialCatalogId={assignmentCatalogId}
      renderCatalogAssignment={(catalogId) => (
        <View style={{ gap: 8 }}>
          <HapticTouchable accessibilityRole="button" accessibilityState={{ expanded: assignmentCatalogId === catalogId }} onPress={() => { setAssignmentCatalogId(assignmentCatalogId === catalogId ? undefined : catalogId); setSearch(""); }} style={{ paddingVertical: 11, paddingHorizontal:18, alignSelf:"center", minHeight:42, borderRadius: 12, backgroundColor: premiumColor("#953651","backgroundColor") }}>
            <Text style={{ color: premiumColor("#FFFFFF","color"), fontWeight: "700", textAlign: "center" }}>{assignmentCatalogId === catalogId ? "Annulla scelta cliente" : "Assegna al cliente"}</Text>
          </HapticTouchable>
          {assignmentCatalogId === catalogId ? <View style={{ gap: 8, padding: 12, backgroundColor: premiumColor("#EAF1FB","backgroundColor"), borderWidth: 1, borderColor: premiumColor("#CBDCF1","borderColor"), borderRadius: 12 }}>
            <Text style={{ color: premiumColor("#244568","color"), fontWeight: "800", fontSize: 15 }}>1. Scegli il cliente</Text><Text style={{ color: premiumColor("#526477","color"), fontSize: 12 }}>Poi controlla i dettagli e conferma l’assegnazione.</Text>
            <PremiumSearchToolbar><TextInput accessibilityLabel="Cerca cliente da associare al modello" placeholder="Cerca cliente" value={search} onChangeText={setSearch} style={benefitsUi.input} /></PremiumSearchToolbar>
            {customers.filter(c => c.full_name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it"))).slice(0, 15).map(c => <HapticTouchable key={c.id} accessibilityRole="button" onPress={() => { setSection("packages"); setSelected(c); }} style={{ minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: premiumColor("#FFFFFF","backgroundColor"), borderWidth: 1, borderColor: premiumColor("#D2DEED","borderColor"), flexDirection: "row", alignItems: "center", gap: 10 }}><Ionicons name="person-circle-outline" size={24} color={premiumColor("#426387","color")} /><Text style={{ color: premiumColor("#26384A","color"), fontWeight: "600", flex: 1 }}>{c.full_name}</Text><Ionicons name="chevron-forward" size={17} color={premiumColor("#426387","color")} /></HapticTouchable>)}
            {!customers.some(c => c.full_name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it"))) ? <Text style={{color:premiumColor("#26384A")}}>Nessun cliente trovato.</Text> : null}
          </View> : null}
        </View>
      )}
      initialSection={section}
      onSectionChange={setSection}
      workspaceId={workspaceId}
      customerId={selected?.id || ""}
      customerName={selected?.full_name || ""}
      onClose={onClose}
      onShow={onShow}
      customerSelector={
        <View
          style={{
            gap: 10,
            padding: 14,
            borderRadius: 16,
            borderWidth:1,borderColor:premiumColor("#D2DEED","borderColor"),
            backgroundColor: premiumColor("#F7F2F5","backgroundColor"),
          }}
        >
          {selected ? (
            <HapticTouchable
              onPress={() => {
                setSelected(null);
                setAssignmentCatalogId(undefined);
                setSearch("");
              }}
            >
              <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
                ← Torna alla gestione del salone
              </Text>
            </HapticTouchable>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    ["customer", "Assegna a un cliente"],
                    ["gift", "Trova buono"],
                  ] as const
                ).map(([id, label]) => (
                  <HapticTouchable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: mode === id }}
                    onPress={() => { setAssignmentCatalogId(undefined); setMode((v) => (v === id ? "none" : id)); }}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: mode === id ? premiumColor("#EAD8E1","backgroundColor") : premiumColor("#FFF","backgroundColor"),
                    }}
                  >
                    <Text style={{ fontWeight: "700", color: premiumColor("#654355","color") }}>
                      {label}
                    </Text>
                  </HapticTouchable>
                ))}
              </View>
              {mode === "gift" ? (
                <GiftCardLookup
                  onFound={(customer) => {
                    setSection("gifts");
                    setSelected(customer);
                  }}
                />
              ) : null}
              {mode === "customer" ? (
                <>
                  <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
                    Assegna o consulta i vantaggi di un cliente
                  </Text>
                  <PremiumSearchToolbar><TextInput
                    accessibilityLabel="Cerca cliente per vantaggi"
                    placeholder="Cerca nome cliente"
                    value={search}
                    onChangeText={setSearch}
                    style={[benefitsUi.input, {
                      padding: 12,
                      backgroundColor: premiumColor("#FFF","backgroundColor"),
                      borderRadius: 12,
                    }]}
                  /></PremiumSearchToolbar>
                  {customers.length ? (
                    customers
                      .filter((c) =>
                        c.full_name
                          .toLocaleLowerCase("it")
                          .includes(search.trim().toLocaleLowerCase("it")),
                      )
                      .slice(0, 15)
                      .map((c) => (
                        <HapticTouchable
                          key={c.id}
                          onPress={() => { if (section === "settings") setSection("packages"); setSelected(c); }}
                          style={{ padding: 10 }}
                        >
                          <Text style={{color:premiumColor("#26384A")}}>{c.full_name}</Text>
                        </HapticTouchable>
                      ))
                  ) : (
                    <Text style={{color:premiumColor("#26384A")}}>Nessun cliente in rubrica.</Text>
                  )}
                </>
              ) : null}
            </>
          )}
        </View>
      }
    />
  );
}
