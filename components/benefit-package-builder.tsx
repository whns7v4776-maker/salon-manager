import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import { benefitsDesign as baseBenefitsDesign } from "./benefits-design";
import React, { useMemo, useState } from "react";
import { TextInput, View } from "react-native";

import { useAppContext } from "../src/context/AppContext";
import {
  getServiceCardTheme,
  normalizeServiceAccentKey,
} from "../src/lib/service-accents";
import {
  packageMoney,
  type PackageEntitlement,
} from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";
export type PackageForm = {
  name: string;
  uses: string;
  months: string;
  price: string;
  discount: string;
};
export function BenefitPackageBuilder({
  saveLabel = "Salva modello del salone",
  form,
  setForm,
  services,
  selected,
  setSelected,
  busy,
  onSave,
  onCancel,
  onArchive,
}: {
  saveLabel?: string;
  form: PackageForm;
  setForm: React.Dispatch<React.SetStateAction<PackageForm>>;
  services: PackageEntitlement[];
  selected: PackageEntitlement[];
  setSelected: React.Dispatch<React.SetStateAction<PackageEntitlement[]>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
 const premiumColor=useCustomerPremiumColor();

 const benefitsUi=useCustomerPremiumStyles(baseBenefitsDesign);

  const { servizi, roleCardColorOverrides } = useAppContext();
  const [step, setStep] = useState(0),
    [query, setQuery] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [error, setError] = useState("");
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; items: PackageEntitlement[] }
    >();
    for (const item of services) {
      const source = servizi.find((s) =>
        item.kind === "composition"
          ? s.compositionId === item.id || s.id === item.id
          : s.id === item.id,
      );
      const name = source?.mestiereRichiesto?.trim() || "Altri servizi";
      const key = normalizeServiceAccentKey(name);
      if (!map.has(key)) map.set(key, { name, items: [] });
      if (
        item.name
          .toLocaleLowerCase("it")
          .includes(query.toLocaleLowerCase("it"))
      )
        map.get(key)!.items.push(item);
    }
    return [...map.values()]
      .filter((g) => g.items.length)
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [services, servizi, query]);
  const money = Number(form.price.replace(",", "."));
  const next = () => {
    setError("");
    if (step === 0 && !selected.length) {
      setError("Scegli almeno un servizio da includere.");
      return;
    }
    if (
      step === 1 &&
      (!form.name.trim() ||
        !Number.isInteger(Number(form.uses)) ||
        Number(form.uses) < 1 ||
        Number(form.uses) > 1000 ||
        !Number.isInteger(Number(form.months)) ||
        Number(form.months) < 1 ||
        Number(form.months) > 60 ||
        !Number.isFinite(money) ||
        money <= 0 ||
        money > 1000000 ||
        !Number.isInteger(Number(form.discount)) ||
        Number(form.discount) < 0 ||
        Number(form.discount) > 100)
    ) {
      setError(
        "Controlla nome, utilizzi (1–1000), mesi (1–60), prezzo e sconto (0–100%).",
      );
      return;
    }
    if (step === 0 && !form.name.trim() && selected.length === 1)
      setForm((f) => ({ ...f, name: selected[0].name }));
    setStep((v) => v + 1);
  };
  const button = (label: string, action: () => void, secondary = false) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy}
      onPress={action}
      style={{
        padding: 14,
        borderRadius: 14,
        alignItems: "center",
        backgroundColor: secondary ? premiumColor("#F0F2F6","backgroundColor") : premiumColor("#953651","backgroundColor"),
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Text
        style={{ fontWeight: "700", color: secondary ? premiumColor("#475569","color") : premiumColor("#FFF","color") }}
      >
        {label}
      </Text>
    </HapticTouchable>
  );
  const field = (key: keyof PackageForm, label: string) => (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: "600", color: premiumColor("#344054","color") }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={form[key]}
        editable={!busy}
        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        keyboardType={
          key === "name"
            ? "default"
            : key === "price"
              ? "decimal-pad"
              : "number-pad"
        }
        style={[benefitsUi.input, {
          padding: 14,
          borderWidth: 1,
          borderColor: premiumColor("#DFE3EB","borderColor"),
          borderRadius: 14,
          fontSize: 16,
          backgroundColor: premiumColor("#FFF","backgroundColor"),
          color: premiumColor("#243447","color"),
        }]}
      />
    </View>
  );
  return (
    <View style={{ gap: 16 }}> 
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["Servizi", "Condizioni", "Riepilogo"].map((name, i) => (
          <View key={name} style={{ flex: 1, gap: 7 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= step ? premiumColor("#AD4865","backgroundColor") : premiumColor("#E8EAF0","backgroundColor"),
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: i === step ? "800" : "500",
                color: i === step ? premiumColor("#953651","color") : premiumColor("#788393","color"),
              }}
            >
              {i + 1}. {name}
            </Text>
          </View>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: premiumColor("#B42318","color") }}>
          {error}
        </Text>
      ) : null}
      {step === 0 ? (
        <>
          <Text style={{ fontSize: 20, fontWeight: "800", color: premiumColor("#253447","color") }}>
            Quali servizi comprende?
          </Text>
          <Text style={{ color: premiumColor("#667085","color") }}>
            Ogni utilizzo copre un servizio scelto. Una combinazione completa
            conta una volta.
          </Text>
          <PremiumSearchToolbar><TextInput
            accessibilityLabel="Cerca servizi del pacchetto"
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca un servizio"
            placeholderTextColor={premiumColor("#667085","placeholderTextColor")}
            style={[benefitsUi.input, {
              padding: 13,
              borderRadius: 14,
              backgroundColor: premiumColor("#F2F4F8","backgroundColor"),
              color: premiumColor("#243447","color"),
              fontSize: 16,
            }]}
          /></PremiumSearchToolbar>
          <Text style={{ fontWeight: "700", color: premiumColor("#953651","color") }}>
            {selected.length} selezionati
          </Text>
          {!groups.length ? <Text style={{color:premiumColor("#26384A")}}>Nessun servizio trovato.</Text> : null}
          {groups.map((group) => {
            const theme = getServiceCardTheme({
              roleName: group.name,
              roleColorOverrides: roleCardColorOverrides,
              preferRoleColor: true,
            });
            return (
              <View
                key={group.name}
                style={{
                  borderWidth: 1,
                  borderColor: theme.borderColor,
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    padding: 13,
                    backgroundColor: theme.bg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      height: 18,
                      width: 5,
                      backgroundColor: theme.borderColor,
                      borderRadius: 3,
                    }}
                  />
                  <Text style={{ fontWeight: "800", color: theme.text }}>
                    {group.name}
                  </Text>
                  <Text style={{ color: theme.text }}>
                    · {group.items.length}
                  </Text>
                </View>
                {group.items.map((item) => {
                  const active = selected.some(
                    (s) => s.id === item.id && s.kind === item.kind,
                  );
                  return (
                    <HapticTouchable
                      key={item.kind + item.id}
                      // Contiguous rows must not shrink away from the group border.
                      pressScale={1}
                      pressOpacity={1}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      disabled={busy}
                      onPress={() =>
                        setSelected((list) =>
                          active
                            ? list.filter(
                                (s) => s.id !== item.id || s.kind !== item.kind,
                              )
                            : [...list, item],
                        )
                      }
                      style={{
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: active ? theme.bg : premiumColor("#FFF","backgroundColor"),
                        borderTopWidth: 1,
                        borderTopColor: theme.borderColor,
                      }}
                    >
                      <Ionicons
                        name={active ? "checkbox" : "square-outline"}
                        size={23}
                        color={active ? theme.text : premiumColor("#98A2B3","color")}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontWeight: active ? "700" : "500",
                            color: premiumColor("#243447","color"),
                          }}
                        >
                          {item.name}
                        </Text>
                        {item.kind === "composition" ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: premiumColor("#667085","color"),
                              marginTop: 3,
                            }}
                          >
                            Combinazione
                          </Text>
                        ) : null}
                      </View>
                    </HapticTouchable>
                  );
                })}
              </View>
            );
          })}
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Text style={{ fontSize: 20, fontWeight: "800", color: premiumColor("#253447","color") }}>
            Definisci il pacchetto
          </Text>
          <Text style={{ color: premiumColor("#667085","color") }}>
            Parti da una durata e personalizza liberamente.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[3, 6, 12].map((n) => (
              <HapticTouchable
                key={n}
                disabled={busy}
                onPress={() =>
                  setForm((f) => ({ ...f, uses: String(n), months: String(n) }))
                }
                style={{
                  padding: 11,
                  borderRadius: 12,
                  backgroundColor:
                    Number(form.months) === n && Number(form.uses) === n
                      ? premiumColor("#F5DAE4","backgroundColor")
                      : premiumColor("#F1F3F7","backgroundColor"),
                }}
              >
                <Text style={{color:premiumColor("#26384A")}}>
                  {n} utilizzi · {n} mesi
                </Text>
              </HapticTouchable>
            ))}
          </View>
          {field("name", "Nome del pacchetto")}
          {field("uses", "Utilizzi inclusi")}
          {field("months", "Validità in mesi")}
          {field("price", "Prezzo totale €")}
          {button(
            advanced ? "Nascondi opzioni" : "Opzioni facoltative",
            () => setAdvanced((v) => !v),
            true,
          )}
          {advanced ? (
            <>
              {field("discount", "Sconto prodotti %")}
              <Text style={{ color: premiumColor("#667085","color") }}>
                Lo sconto prodotti viene indicato al cliente e applicato dal
                salone.
              </Text>
            </>
          ) : null}
        </>
      ) : null}
      {step === 2 ? (
        <View
          style={{
            padding: 20,
            borderRadius: 20,
            backgroundColor: premiumColor("#FFF5F8","backgroundColor"),
            gap: 12,
            borderWidth: 1,
            borderColor: premiumColor("#EBD5DE","borderColor"),
          }}
        >
          <Text style={{ fontSize: 21, fontWeight: "800", color: premiumColor("#51313F","color") }}>
            {form.name}
          </Text>
          <Text style={{color:premiumColor("#26384A")}}>{selected.map((s) => s.name).join(" · ")}</Text>
          <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
            {form.uses} utilizzi · {form.months} mesi
          </Text>
          <Text style={{ fontSize: 24, fontWeight: "800", color: premiumColor("#953651","color") }}>
            {packageMoney(Math.round(money * 100))}
          </Text>
          <Text style={{color:premiumColor("#26384A")}}>
            Circa {packageMoney(Math.round((money * 100) / Number(form.uses)))}{" "}
            per utilizzo
          </Text>
          <Text style={{ color: premiumColor("#667085","color") }}>
            Salvi un modello per il salone. Potrai poi assegnarlo a un cliente
            dopo aver ricevuto il pagamento.
          </Text>
        </View>
      ) : null}
      {step < 2 ? button("Continua", next) : button(saveLabel, onSave)}
      {step > 0
        ? button(
            "Indietro",
            () => {
              setError("");
              setStep((v) => v - 1);
            },
            true,
          )
        : null}
      {button("Annulla", onCancel, true)}
      {onArchive && step === 2
        ? button("Archivia per le nuove assegnazioni", onArchive, true)
        : null}
    </View>
  );
}
