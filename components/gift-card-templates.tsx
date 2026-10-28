import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import { useBenefitsRefresh } from "../src/lib/use-benefits-refresh";
import { benefitsDesign as baseScopedBenefits } from "./benefits-design";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import { packageMoney } from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";
export type GiftTemplate = {
  id: string;
  name: string;
  amount_cents: number;
  months: number | null;
  message: string;
  revision: number;
  archived: boolean;
};
export function GiftCardTemplates({
  workspaceId,
  onChoose,
  disabled,
  onBusy,
}: {
  workspaceId: string;
  onChoose?: (t: GiftTemplate) => void;
  disabled: boolean;
  onBusy?: (b: boolean) => void;
}) {
 const premiumColor=useCustomerPremiumColor();
 const d=useCustomerPremiumStyles(baseScopedBenefits);

  const [items, setItems] = useState<GiftTemplate[]>([]),
    [editing, setEditing] = useState<GiftTemplate | "new" | null>(null),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [months, setMonths] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const readGeneration = useRef(0);
  useEffect(() => () => { readGeneration.current++; }, [workspaceId]);
  const load = useCallback(async () => {
    const generation = ++readGeneration.current;
    const r = await supabase
      .from("gift_card_templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name");
    if (r.error) throw new Error("Modelli non disponibili");
    if (generation === readGeneration.current) setItems(r.data || []);
  }, [workspaceId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useBenefitsRefresh(workspaceId, async () => { if (!busy) await load(); });
  const edit = (t: GiftTemplate | "new") => {
    setEditing(t);
    setName(t === "new" ? "" : t.name);
    setAmount(t === "new" ? "" : String(t.amount_cents / 100));
    setMonths(t === "new" ? "" : String(t.months || ""));
    setMessage(t === "new" ? "" : t.message);
  };
  const save = async (archived = false) => {
    if (busy || disabled) return;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const cents = Math.round(Number(amount.replace(",", ".")) * 100);
      if (
        !name.trim() ||
        !Number.isFinite(cents) ||
        cents <= 0 ||
        (months &&
          (!Number.isInteger(Number(months)) ||
            Number(months) < 1 ||
            Number(months) > 60))
      )
        throw new Error("Controlla nome, importo e validità (da 1 a 60 mesi).");
      const current = editing && editing !== "new" ? editing : null;
      const r = await supabase.rpc("save_gift_card_template", {
        p_id: current?.id || null,
        p_revision: current?.revision || 0,
        p_name: name,
        p_amount: cents,
        p_months: months ? Number(months) : null,
        p_message: message,
        p_archived: archived,
      });
      if (r.error) throw new Error(r.error.message);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };
  const button = (title: string, press: () => void, primary = false) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={press}
      style={[primary ? d.primary : d.secondary, (busy || disabled) && { opacity: 0.5 }]}
    >
      <Text style={primary ? d.primaryText : d.secondaryText}>{title}</Text>
    </HapticTouchable>
  );
  return (
    <View style={{ gap: 16 }}>
      <View style={{flexDirection:"row",alignItems:"center",gap:12}}><View style={{backgroundColor:premiumColor("#FCE8EE","backgroundColor"),padding:12,borderRadius:16}}><Ionicons name="gift-outline" size={24} color={premiumColor("#963B57","color")}/></View><View style={{flex:1}}><Text style={d.title}>I tuoi modelli regalo</Text><Text style={d.copy}>Un pensiero pronto da personalizzare.</Text></View></View>
      <Text style={d.copy}>
        Riutilizzabili per tutti i clienti. Le modifiche non cambiano i buoni
        già emessi.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: premiumColor("#B42318","color") }}>
          {error}
        </Text>
      ) : null}
      {items.map((t) => (
        <View
          key={t.id}
          style={d.card}
        >
          <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
            {t.name} · {packageMoney(t.amount_cents)}
            {t.archived ? " · Archiviato" : ""}
          </Text>
          <Text style={{color:premiumColor("#26384A")}}>
            {t.months
              ? `${t.months} mesi dalla data di emissione`
              : "Senza scadenza"}
          </Text>
          {onChoose && !t.archived
            ? button("Usa per questo cliente", () => onChoose(t))
            : null}
          {button("Modifica modello", () => edit(t))}
        </View>
      ))}
      {editing ? (
        <View style={d.panel}>
          <Text style={d.title}>{editing === "new" ? "Crea un modello" : "Personalizza il modello"}</Text>
          <Text style={d.copy}>Scegli il valore e il messaggio. Potrai riutilizzarlo quando emetti un buono.</Text>
          {(
            [
              ["Nome del modello", name, setName],
              ["Valore del regalo (€)", amount, setAmount],
              ["Validità in mesi · facoltativa", months, setMonths],
              ["Messaggio predefinito", message, setMessage],
            ] as const
          ).map(([label, value, set], i) => (
            <View key={label}>
              <Text style={d.label}>{label}</Text>
              <TextInput
                accessibilityLabel={label}
                placeholder={["Es. Un momento per te", "Es. 50", "Senza scadenza", "Es. Un regalo speciale, tutto per te"][i]}
                placeholderTextColor={premiumColor("#7B8493","placeholderTextColor")}
                multiline={i === 3}
                maxLength={i === 3 ? 500 : i === 0 ? 120 : 10}
                editable={!busy && !disabled}
                value={value}
                onChangeText={set}
                keyboardType={
                  i === 1 ? "decimal-pad" : i === 2 ? "number-pad" : "default"
                }
                style={[d.input, i === 3 && {minHeight:100,textAlignVertical:"top"}]}
              />
            </View>
          ))}
          {button(busy ? "Salvataggio…" : "Salva modello", () => void save(), true)}
          {editing !== "new"
            ? button("Archivia modello", () => void save(true))
            : null}
          {button("Annulla", () => setEditing(null))}
        </View>
      ) : (
        button("Crea modello gift card", () => edit("new"), true)
      )}
    </View>
  );
}
