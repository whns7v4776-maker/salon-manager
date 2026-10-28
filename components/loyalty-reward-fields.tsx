import { useCustomerPremiumColor } from './owner-premium-customers-style';
import { benefitsDesign as benefitsUi } from "./benefits-design";
import React, { useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { useAppContext } from "../src/context/AppContext";
import { HapticTouchable } from "./ui/haptic-touchable";
import { BenefitDateField } from "./benefit-date-field";
export type RewardTerms = {
  reward_type: "custom" | "fixed" | "percent" | "service";
  value: number;
  service_ids: string[];
  description: string;
  expires_on: string | null;
  cumulative: boolean;
};
export const emptyRewardTerms: RewardTerms = {
  reward_type: "custom",
  value: 0,
  service_ids: [],
  description: "",
  expires_on: null,
  cumulative: false,
};
export function LoyaltyRewardFields({
  value,
  onChange,
  disabled,
}: {
  value: RewardTerms;
  onChange: (v: RewardTerms) => void;
  disabled: boolean;
}) {
 const premiumColor=useCustomerPremiumColor();

  const { servizi } = useAppContext();
  const [showServices, setShowServices] = useState(false);
  const [amount, setAmount] = useState(String(value.value || ""));
  const patch = (next: Partial<RewardTerms>) => onChange({ ...value, ...next });
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>Che cosa riceve il cliente?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["percent", "Sconto %"],
            ["fixed", "Sconto €"],
            ["service", "Servizio omaggio"],
            ["custom", "Regalo personalizzato"],
          ] as const
        ).map(([type, label]) => (
          <HapticTouchable
            key={type}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: value.reward_type === type }}
            onPress={() => {
              setAmount("");
              patch({ reward_type: type, value: 0 });
            }}
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor:
                value.reward_type === type ? premiumColor("#963B57","backgroundColor") : premiumColor("#ECE8F4","backgroundColor"),
            }}
          >
            <Text
              style={{
                color: value.reward_type === type ? premiumColor("#FFF","color") : premiumColor("#47336F","color"),
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </HapticTouchable>
        ))}
      </View>
      {value.reward_type === "fixed" || value.reward_type === "percent" ? (
        <>
          <Text style={{color:premiumColor("#26384A")}}>
            {value.reward_type === "percent"
              ? "Percentuale di sconto (fino al 100%)"
              : "Sconto in euro"}
          </Text>
          <TextInput
            accessibilityLabel="Valore dello sconto"
            value={amount}
            editable={!disabled}
            keyboardType="decimal-pad"
            onChangeText={(v) => {
              setAmount(v);
              patch({ value: Number(v.replace(",", ".")) });
            }}
            style={[benefitsUi.input, {
              padding: 14,
              backgroundColor: premiumColor("#FFF","backgroundColor"),
              borderRadius: 12,
              color: premiumColor("#243447","color"),
            }]}
          />
        </>
      ) : null}
      <Text style={{color:premiumColor("#26384A")}}>Descrizione per il cliente (facoltativa)</Text>
      <TextInput
        accessibilityLabel="Descrizione del premio"
        value={value.description}
        editable={!disabled}
        multiline
        maxLength={500}
        onChangeText={(description) => patch({ description })}
        placeholder="Es. Un trattamento dedicato a te"
        placeholderTextColor={premiumColor("#667085","placeholderTextColor")}
        style={[benefitsUi.input, {
          padding: 14,
          minHeight: 72,
          backgroundColor: premiumColor("#FFF","backgroundColor"),
          borderRadius: 12,
          color: premiumColor("#243447","color"),
        }]}
      />
      {value.reward_type !== "custom" ? (
        <>
          <HapticTouchable
            disabled={disabled}
            onPress={() => setShowServices((v) => !v)}
          >
            <Text style={{ color: premiumColor("#963B57","color"), fontWeight: "700" }}>
              Servizi validi:{" "}
              {value.service_ids.length
                ? value.service_ids.length + (value.service_ids.length === 1 ? " selezionato" : " selezionati")
                : value.reward_type === "service"
                  ? "Scegli almeno un servizio"
                  : "Tutti"}{" "}
              · {showServices ? "Chiudi" : "Scegli"}
            </Text>
          </HapticTouchable>
          {showServices ? (
            <View style={{ gap: 6 }}>
              {servizi
                .filter((s) => !s.compositionId)
                .map((s) => (
                  <HapticTouchable
                    key={s.id}
                    disabled={disabled}
                    pressScale={1}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: value.service_ids.includes(s.id),
                    }}
                    onPress={() =>
                      patch({
                        service_ids: value.service_ids.includes(s.id)
                          ? value.service_ids.filter((id) => id !== s.id)
                          : [...value.service_ids, s.id],
                      })
                    }
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: value.service_ids.includes(s.id)
                        ? premiumColor("#F6E4EB","backgroundColor")
                        : premiumColor("#FFF","backgroundColor"),
                    }}
                  >
                    <Text style={{color:premiumColor("#26384A")}}>
                      {value.service_ids.includes(s.id) ? "✓  " : ""}
                      {s.nome}
                    </Text>
                  </HapticTouchable>
                ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ flex: 1 }}>
              Cumula questo premio con altri sconti
            </Text>
            <Switch
              accessibilityLabel="Cumula questo premio con altri sconti"
              disabled={disabled}
              value={value.cumulative}
              onValueChange={(cumulative) => patch({ cumulative })}
            />
          </View>
          <Text style={{ color: premiumColor("#667085","color") }}>
            Consente di applicare questo premio anche a prezzi personalizzati e
            promozioni. Non cambia l’accumulo dei punti. I servizi già coperti da
            pacchetto o gift card mantengono la loro copertura.
          </Text>
        </>
      ) : null}
      <BenefitDateField
        optional
        label="Utilizzabile entro (facoltativo)"
        value={value.expires_on || ""}
        onChange={(expires_on) => patch({ expires_on: expires_on || null })}
        disabled={disabled}
      />
    </View>
  );
}
