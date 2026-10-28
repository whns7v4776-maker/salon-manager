import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import React, { useState } from "react";
import { Switch, TextInput, View } from "react-native";

import { benefitsDesign as baseScopedBenefits } from "./benefits-design";
import { HapticTouchable } from "./ui/haptic-touchable";
import {
  loyaltyMoney,
  loyaltyRuleSummary,
  parseLoyaltyCents,
  validateLoyaltyRule,
  type LoyaltyEarningRule,
} from "../src/lib/loyalty-earning";

export function LoyaltyEarningFields({
  value,
  onChange,
  disabled,
}: {
  value: LoyaltyEarningRule;
  onChange: (v: LoyaltyEarningRule) => void;
  disabled: boolean;
}) {
 const premiumColor=useCustomerPremiumColor();
 const ui=useCustomerPremiumStyles(baseScopedBenefits);

  const [amount, setAmount] = useState(
    String(value.loyalty_spend_step_cents / 100).replace(".", ","),
  );
  const [minimum, setMinimum] = useState(
    String(value.loyalty_minimum_cents / 100).replace(".", ","),
  );
  const [points, setPoints] = useState(String(value.loyalty_spend_points));
  const [servicePoints, setServicePoints] = useState(
    String(value.points_per_service),
  );
  const patch = (v: Partial<LoyaltyEarningRule>) =>
    onChange({ ...value, ...v });
  const validation = validateLoyaltyRule(value);
  const exampleCents = Math.max(
    value.loyalty_spend_step_cents * 3,
    value.loyalty_minimum_cents,
  );
  const examplePoints =
    Math.floor(exampleCents / value.loyalty_spend_step_cents) *
    value.loyalty_spend_points;
  const field = (
    label: string,
    text: string,
    change: (v: string) => void,
    inline = false,
  ) => (
    <View style={[{ gap: 6 }, inline && { flexGrow: 1, flexBasis: 140 }]}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={ui.input}
        accessibilityLabel={label}
        value={text}
        editable={!disabled}
        keyboardType="decimal-pad"
        onChangeText={change}
        placeholderTextColor={premiumColor("#77818F","placeholderTextColor")}
      />
    </View>
  );
  const toggle = (
    label: string,
    detail: string,
    checked: boolean,
    change: (v: boolean) => void,
  ) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={ui.label}>{label}</Text>
        <Text style={ui.copy}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={checked}
        disabled={disabled}
        onValueChange={change}
        trackColor={{ false: premiumColor("#D9DDE5","false"), true: premiumColor("#B16B84","true") }}
        thumbColor={premiumColor("#FFFFFF","thumbColor")}
      />
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <Text style={ui.label}>Come guadagnano punti i clienti?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {(
          [
            [
              "service",
              "Per servizio",
              "Un numero fisso di punti dopo il servizio.",
              "cut-outline",
            ],
            [
              "spend",
              "Per importo",
              "Una regola sugli importi effettivamente incassati.",
              "wallet-outline",
            ],
          ] as const
        ).map(([mode, title, copy, icon]) => (
          <HapticTouchable
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{
              checked: value.loyalty_earning_mode === mode,
            }}
            disabled={disabled}
            onPress={() => patch({ loyalty_earning_mode: mode })}
            style={{
              flexGrow: 1,
              flexBasis: 160,
              gap: 8,
              padding: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor:
                value.loyalty_earning_mode === mode ? premiumColor("#B56E86","borderColor") : premiumColor("#E6E1E7","borderColor"),
              backgroundColor:
                value.loyalty_earning_mode === mode ? premiumColor("#FBEEF3","backgroundColor") : premiumColor("#F8F9FC","backgroundColor"),
            }}
          >
            <Ionicons name={icon} size={24} color={premiumColor("#963B57","color")} />
            <Text style={ui.label}>{title}</Text>
            <Text style={ui.copy}>{copy}</Text>
          </HapticTouchable>
        ))}
      </View>
      {value.loyalty_earning_mode === "service" ? (
        <>
          {field("Punti per servizio effettuato", servicePoints, (v) => {
            if (/^\d*$/.test(v)) {
              setServicePoints(v);
              patch({ points_per_service: Number(v) });
            }
          })}
          <Text style={ui.copy}>
            Un servizio composto da più fasi conta una volta. Annullamenti e
            mancate presenze non danno punti.
          </Text>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {field(
              "Ogni importo (€)",
              amount,
              (v) => {
                setAmount(v);
                patch({ loyalty_spend_step_cents: parseLoyaltyCents(v) });
              },
              true,
            )}
            {field(
              "Assegna punti",
              points,
              (v) => {
                if (/^\d*$/.test(v)) {
                  setPoints(v);
                  patch({ loyalty_spend_points: Number(v) });
                }
              },
              true,
            )}
          </View>
          <View style={[ui.card, { gap: 16 }]}>
            <Text style={ui.label}>Quali acquisti contano?</Text>
            {toggle(
              "Servizi",
              "Dopo il servizio effettuato e il pagamento.",
              value.loyalty_spend_services,
              (v) => patch({ loyalty_spend_services: v }),
            )}
            {toggle(
              "Prodotti Shop",
              "Vendite e ritiri associati a un cliente.",
              value.loyalty_spend_products,
              (v) => patch({ loyalty_spend_products: v }),
            )}
          </View>
          {toggle(
            "Somma i residui tra visite",
            "Gli importi sotto soglia concorrono ai punti successivi.",
            value.loyalty_spend_carry,
            (v) => patch({ loyalty_spend_carry: v }),
          )}
          {field("Spesa minima per operazione (€)", minimum, (v) => {
            setMinimum(v);
            patch({ loyalty_minimum_cents: parseLoyaltyCents(v) });
          })}
          <Text style={ui.copy}>
            Lascia 0 per accettare qualsiasi importo. Sconti, rimborsi e quote
            coperte da gift card sono esclusi. L’acquisto di pacchetti e gift
            card non genera punti.
          </Text>
        </>
      )}
      <View style={{ gap: 6 }}>
        <Text style={ui.label}>Messaggio per il cliente · facoltativo</Text>
        <TextInput
          style={[ui.input, { minHeight: 76, textAlignVertical: "top" }]}
          accessibilityLabel="Messaggio della raccolta punti"
          placeholder="Es. Ogni visita ti avvicina al tuo prossimo regalo"
          placeholderTextColor={premiumColor("#77818F","placeholderTextColor")}
          value={value.loyalty_rule_description}
          onChangeText={(loyalty_rule_description) =>
            patch({ loyalty_rule_description })
          }
          maxLength={180}
          multiline
          editable={!disabled}
        />
      </View>
      <View style={[ui.card, { backgroundColor: premiumColor("#FBEEF3","backgroundColor"), gap: 8 }]}>
        <Text style={ui.label}>La tua regola, in breve</Text>
        <Text
          style={{
            fontSize: 20,
            lineHeight: 27,
            color: premiumColor("#963B57","color"),
            fontWeight: "700",
          }}
        >
          {validation ?? loyaltyRuleSummary(value)}
        </Text>
        {value.loyalty_earning_mode === "spend" && !validation ? (
          <Text style={ui.copy}>
            Con {loyaltyMoney(exampleCents)} maturano {examplePoints}{" "}
            {examplePoints === 1 ? "punto" : "punti"}.{" "}
            {value.loyalty_spend_carry
              ? "Gli importi residui si sommano."
              : "Ogni operazione riparte da zero."}
          </Text>
        ) : null}
      </View>
      {toggle(
        "Punti sui servizi in abbonamento",
        "Se attivo, anche i servizi coperti da abbonamento maturano punti. Se disattivo, continuano a maturarli i servizi non coperti. I punti già acquisiti restano validi.",
        value.loyalty_package_services,
        (enabled) => patch({ loyalty_package_services: enabled }),
      )}
      <Text style={ui.copy}>
        La regola vale per tutti i clienti, dal prossimo accumulo. I punti già
        guadagnati restano validi. Cambiando formula parte una nuova raccolta
        dei residui.
      </Text>
    </View>
  );
}
