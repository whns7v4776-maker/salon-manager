import { PremiumChoiceRow } from './ui/premium-choice-row';
import { PremiumSectionHeading } from './ui/premium-section-heading';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import { LoyaltyEarningFields } from './loyalty-earning-fields';
import { defaultLoyaltyEarning, loyaltyRuleSummary, validateLoyaltyRule, type LoyaltyEarningRule } from '../src/lib/loyalty-earning';
import { useBenefitsRefresh } from "../src/lib/use-benefits-refresh";
import { BenefitsSectionHeader } from "./benefits-section-header";
import { benefitsDesign as baseBenefitsDesign } from "./benefits-design";
import { LoyaltyRewardFields, emptyRewardTerms, type RewardTerms } from "./loyalty-reward-fields";

import { GiftCardEmail } from "./gift-card-email";
import { GiftCardTemplates } from "./gift-card-templates";
import { GiftCardDocument } from "./gift-card-document";
import { BenefitDateField } from "./benefit-date-field";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Switch, TextInput, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import { benefitOperationId, packageMoney } from "../src/lib/service-packages";
import { HapticTouchable } from "./ui/haptic-touchable";
type Settings = LoyaltyEarningRule & {
  packages_enabled: boolean;
  loyalty_enabled: boolean;
  gift_cards_enabled: boolean;
  points_per_service: number;
  revision: number;
};
type Reward = RewardTerms & {
  id: string;
  name: string;
  points_cost: number;
  revision: number;
  archived: boolean;
};
type Gift = {
  id: string;
  code: string;
  amount_cents: number;
  expires_on: string | null;
  funding: string;
  message: string;
  available: number;
};
const defaults: Settings = {
  ...defaultLoyaltyEarning,
  packages_enabled: false,
  loyalty_enabled: false,
  gift_cards_enabled: false,
  points_per_service: 1,
  revision: 1,
};
export function CustomerBenefitExtras({
  section,
  onOpenSection,
  workspaceId,
  customerId,
  onSettings,
  onBusy,
  disabled = false,
}: {
  section: "settings" | "points" | "gifts";
  onOpenSection: (
    section: "settings" | "packages" | "points" | "gifts",
  ) => void;
  workspaceId: string;
  customerId: string;
  onSettings: (enabled: boolean) => void;
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
}) {
 const premiumColor=useCustomerPremiumColor();

 const benefitsUi=useCustomerPremiumStyles(baseBenefitsDesign);

  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const tab = section;
  useEffect(() => { setNotice(""); setError(""); }, [section]);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [showPointsRule, setShowPointsRule] = useState(false);
  const pointsRevision = useRef(1);
  const [pointsDraft, setPointsDraft] = useState<LoyaltyEarningRule>(defaultLoyaltyEarning);
  const [expandedGift, setExpandedGift] = useState<string | null>(null);
  const [showGiftForm, setShowGiftForm] = useState(false);
  const [showGiftTemplates, setShowGiftTemplates] = useState(false);
  const [rewardName, setRewardName] = useState("");
  const [rewardCost, setRewardCost] = useState("10");
  const [rewardTerms, setRewardTerms] = useState<RewardTerms>(emptyRewardTerms);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [amount, setAmount] = useState("");
  const [expires, setExpires] = useState("");
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [giftMethod, setGiftMethod] = useState<
    "complimentary" | "cash" | "card" | "bank_transfer"
  >("complimentary");
  const [confirmGift, setConfirmGift] = useState(false);
  const operation = useRef(benefitOperationId());
  const lock = useRef(false);
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
    const { data, error: failure } = customerId
      ? await supabase.rpc("owner_customer_benefits", {
          p_customer: customerId,
        })
      : await supabase.rpc("owner_benefits_console");
    if (failure) throw new Error("Vantaggi non disponibili. Riprova.");
    if (!alive.current || generation !== readGeneration.current) return;
    const next = { ...defaults, ...data.settings } as Settings;
    setSettings(next);
    onSettings(next.packages_enabled);
    setPoints(data.points);
    setRewards(data.rewards);
    setGifts(data.giftCards);
    setReady(true);
  }, [customerId, onSettings]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useBenefitsRefresh(workspaceId, async () => { if (!lock.current) await refresh(); });
  const run = async (work: () => Promise<void>) => {
    if (lock.current || disabled || templateBusy) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy?.(false);
      }
    }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error: e } = await supabase.rpc(name, args);
    if (e) throw new Error(e.message);
  };
  const saveSettings = (next: Settings, revision = settings.revision) =>
    void run(async () => {
      if (!Number.isInteger(next.points_per_service) || next.points_per_service < 1 || next.points_per_service > 10000) throw new Error("Scegli da 1 a 10.000 punti per servizio.");
      await rpc("save_salon_benefit_settings", {
        p_packages: next.packages_enabled,
        p_loyalty: next.loyalty_enabled,
        p_gifts: next.gift_cards_enabled,
        p_points: next.points_per_service,
        p_revision: revision,
      });
      setShowPointsRule(false);
      setNotice(
        "Impostazioni del salone salvate. I vantaggi già maturati restano validi.",
      );
    });
  const savePointsRule = () => void run(async () => {
    const invalid = validateLoyaltyRule(pointsDraft);
    if (invalid) throw new Error(invalid);
    await rpc("save_loyalty_earning_rule_v2", {
      p_package_services: pointsDraft.loyalty_package_services,
      p_revision: pointsRevision.current,
      p_mode: pointsDraft.loyalty_earning_mode,
      p_service_points: pointsDraft.points_per_service,
      p_step_cents: pointsDraft.loyalty_spend_step_cents,
      p_spend_points: pointsDraft.loyalty_spend_points,
      p_carry: pointsDraft.loyalty_spend_carry,
      p_services: pointsDraft.loyalty_spend_services,
      p_products: pointsDraft.loyalty_spend_products,
      p_minimum_cents: pointsDraft.loyalty_minimum_cents,
      p_description: pointsDraft.loyalty_rule_description,
    });
    setShowPointsRule(false);
    setNotice("Regola punti salvata per il salone. I punti già maturati restano validi.");
  });
  const button = (label: string, onPress: () => void, unavailable = false) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy || disabled || templateBusy || !ready || unavailable}
      onPress={onPress}
      style={{
        ...(/^(Salva|Conferma|Crea|Emetti|Prepara)/.test(label) ? benefitsUi.primary : benefitsUi.secondary),
        opacity: busy || unavailable ? 0.5 : 1,
      }}
    >
      <Text style={/^(Salva|Conferma|Crea|Emetti|Prepara)/.test(label) ? benefitsUi.primaryText : benefitsUi.secondaryText}>{label}</Text>
    </HapticTouchable>
  );
  const input = (
    label: string,
    value: string,
    set: (v: string) => void,
    numeric = false,
  ) => (
    <View style={{ gap: 5 }}>
      <Text style={{ fontWeight: "600", color: premiumColor("#334155","color") }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[benefitsUi.input, {
          backgroundColor: premiumColor("#FFF","backgroundColor"),
          borderWidth: 1,
          borderColor: premiumColor("#DCE3ED","borderColor"),
          borderRadius: 12,
          padding: 12,
          fontSize: 16,
          ...(label === "Messaggio regalo" ? {minHeight:100,textAlignVertical:"top" as const} : {}),
        }]}
        multiline={label === "Messaggio regalo"}
        maxLength={label === "Messaggio regalo" ? 500 : label === "Da parte di" ? 120 : undefined}
        editable={!busy && !disabled && !templateBusy}
        value={value}
        onChangeText={set}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
  return (
    <View
      style={{
        gap: 12,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: premiumColor("#FFFFFF","backgroundColor"),
      }}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: premiumColor("#B42318","color") }}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={{ color: premiumColor("#176B53","color") }}>
          {notice}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator /> : null}
      {tab === "settings" ? (
        <>
          <BenefitsSectionHeader title="Scegli i tuoi vantaggi" description="Attiva le iniziative da offrire ai clienti." icon="grid-outline" scope="Impostazioni del salone"/>
          <View style={benefitsUi.panel}><Text style={benefitsUi.copy}>Queste impostazioni valgono per tutti i clienti. I vantaggi già maturati restano validi anche disattivando un’iniziativa.</Text></View>
          {(
            [
              [
                "packages_enabled",
                "Abbonamenti",
                "Servizi prepagati, utilizzabili nel tempo.",
                "packages",
                "layers-outline",
              ],
              [
                "loyalty_enabled",
                "Punti fedeltà",
                "Premia i clienti dopo ogni servizio.",
                "points",
                "heart-outline",
              ],
              [
                "gift_cards_enabled",
                "Gift card",
                "Un credito da acquistare o regalare.",
                "gifts",
                "gift-outline",
              ],
            ] as const
          ).map(([key, label, description, target, icon]) => (
            <View
              key={key}
              style={{
                padding: 17,
                borderRadius: 20,
                backgroundColor: premiumColor("#FFF7FA","backgroundColor"),
                borderWidth: 1,
                borderColor: premiumColor("#EADCE2","borderColor"),
                gap: 12,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons name={icon} size={23} color={premiumColor("#A33E5B","color")} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 17,
                      color: premiumColor("#3F3040","color"),
                    }}
                  >
                    {label}
                  </Text>
                  <Text style={{ fontSize: 13, color: premiumColor("#7D6A75","color") }}>
                    {settings[key] ? "Attivo" : "Disattivato"}
                  </Text>
                </View>
                <Switch
                  trackColor={{false:premiumColor("#D9DDE5","false"),true:premiumColor("#B16B84","true")}}
                  thumbColor={premiumColor("#FFFFFF","thumbColor")}
                  accessibilityLabel={`Attiva ${label}`}
                  value={settings[key]}
                  disabled={busy || disabled || templateBusy || !ready}
                  onValueChange={(v) => saveSettings({ ...settings, [key]: v })}
                />
              </View>
              <Text style={{ color: premiumColor("#667085","color"), lineHeight: 20 }}>
                {description}
              </Text>
              <HapticTouchable
                accessibilityRole="button"
                disabled={busy || disabled || templateBusy || !ready}
                onPress={() => onOpenSection(target)}
                style={{
                  paddingVertical: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontWeight: "700", color: premiumColor("#953651","color") }}>
                  Gestisci {label.toLocaleLowerCase("it")}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={premiumColor("#953651","color")} />
              </HapticTouchable>
            </View>
          ))}
        </>
      ) : null}
      {tab === "points" ? (
        <>
          <BenefitsSectionHeader title={customerId ? `${points} punti disponibili` : "Punti e premi fedeltà"} description={customerId ? "Il saldo di questo cliente e i premi che può richiedere." : "Decidi come accumulare punti e quali premi offrire."} icon="heart-outline" scope={customerId ? "Vantaggi del cliente" : "Impostazioni del salone"}/>
          <Text style={{ color: premiumColor("#526477","color") }}>
            {settings.loyalty_enabled
              ? settings.loyalty_earning_mode === "spend" ? "I punti maturano automaticamente sugli importi incassati, secondo la tua regola." : "I clienti guadagnano punti dopo il servizio effettuato."
              : "Accumulo disattivato. I punti maturati possono ancora essere usati."}
          </Text>
          {button(
            showPointsRule
              ? "Chiudi regola punti"
              : `${loyaltyRuleSummary(settings)} · Modifica regola`,
            () => { pointsRevision.current = settings.revision; setPointsDraft({...settings}); setShowPointsRule((v) => !v); },
          )}
          {showPointsRule ? (
            <>
              <LoyaltyEarningFields value={pointsDraft} onChange={setPointsDraft} disabled={busy || disabled || templateBusy || !ready}/>
              {button("Salva regola punti", savePointsRule)}
            </>
          ) : null}
          {rewards
            .filter((r) => !r.archived)
            .map((r) => (
              <View
                key={r.id}
                style={{
                  padding: 12,
                  backgroundColor: premiumColor("#FFF","backgroundColor"),
                  borderWidth: 1, borderColor: premiumColor("#E7DFE6","borderColor"),
                  borderRadius: 18,
                  gap: 8,
                }}
              >
                <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
                  {r.name} · {r.points_cost} punti
                </Text>
                {r.description ? <Text style={{color:premiumColor("#26384A")}}>{r.description}</Text> : null}
                {r.reward_type && r.reward_type !== "custom" ? <Text style={{color:premiumColor("#963B57","color")}}>{r.reward_type === "percent" ? r.value + "% di sconto" : r.reward_type === "fixed" ? packageMoney(Math.round(r.value * 100)) + " di sconto" : "Servizio omaggio"} · Proposto automaticamente in Cassa</Text> : null}
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {customerId && (!r.reward_type || r.reward_type === "custom")
                    ? button(
                        "Consegna omaggio",
                        () => {
                          operation.current = benefitOperationId();
                          setRedeeming(r);
                        },
                        points < r.points_cost,
                      )
                    : null}
                  {button("Modifica", () => {
                    setShowRewardForm(true);
                    setEditing(r);
                    setRewardName(r.name);
                    setRewardCost(String(r.points_cost));
                    setRewardTerms({...emptyRewardTerms, ...r});
                  })}
                  {button(
                    "Archivia",
                    () =>
                      void run(() =>
                        rpc("save_loyalty_reward", {
                          p_id: r.id,
                          p_revision: r.revision,
                          p_name: r.name,
                          p_cost: r.points_cost,
                          p_archived: true,
                        }),
                      ),
                  )}
                </View>
              </View>
            ))}
          {redeeming ? (
            <View style={{ gap: 8 }}>
              <Text style={{color:premiumColor("#26384A")}}>
                Confermi di aver consegnato “{redeeming.name}”? Verranno scalati{" "}
                {redeeming.points_cost} punti.
              </Text>
              {button(
                "Conferma omaggio consegnato",
                () =>
                  void run(async () => {
                    await rpc("redeem_loyalty_reward", {
                      p_customer: customerId,
                      p_reward: redeeming.id,
                      p_revision: redeeming.revision,
                      p_operation: operation.current,
                    });
                    setRedeeming(null);
                    setNotice("Omaggio registrato. Saldo punti aggiornato.");
                  }),
              )}
              {button("Annulla", () => setRedeeming(null))}
            </View>
          ) : null}
          {!showRewardForm ? (
            button("Crea un premio", () => {
              setEditing(null);
              setRewardName("");
              setRewardCost("10");
              setRewardTerms(emptyRewardTerms);
              setShowRewardForm(true);
            })
          ) : (
            <View
              style={{
                padding: 16,
                borderRadius: 18,
                backgroundColor: premiumColor("#F7F5FB","backgroundColor"),
                gap: 12,
              }}
            >
              <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>
                {editing ? "Modifica premio" : "Crea premio del salone"}
              </Text>
              {input("Nome del premio", rewardName, setRewardName)}
              {input("Punti necessari", rewardCost, setRewardCost, true)}
              <LoyaltyRewardFields key={editing?.id || "new"} value={rewardTerms} onChange={setRewardTerms} disabled={busy || disabled}/>
              {button(
                "Salva premio",
                () =>
                  void run(async () => {
                    if (
                      !rewardName.trim() ||
                      !Number.isInteger(Number(rewardCost)) ||
                      Number(rewardCost) < 1
                    )
                      throw new Error("Indica nome e punti del premio.");
                    await rpc("save_loyalty_reward_terms", {
                      p_type: rewardTerms.reward_type, p_value: rewardTerms.value,
                      p_services: rewardTerms.service_ids, p_description: rewardTerms.description,
                      p_expires: rewardTerms.expires_on, p_cumulative: rewardTerms.cumulative,
                      p_id: editing?.id ?? null,
                      p_revision: editing?.revision ?? 0,
                      p_name: rewardName,
                      p_cost: Number(rewardCost),
                    });
                    setEditing(null);
                    setShowRewardForm(false);
                    setRewardName("");
                    setNotice("Premio salvato.");
                  }),
              )}
              {button("Annulla", () => {
                setShowRewardForm(false);
                setEditing(null);
              })}
            </View>
          )}
        </>
      ) : null}
      {tab === "gifts" ? (
        <>
          <BenefitsSectionHeader title={customerId ? "I buoni del cliente" : "Gift card del salone"} description={customerId ? "Crea un regalo, controlla il credito o invia un buono." : "Prepara i modelli, poi scegli un cliente a cui assegnarli."} icon="gift-outline" scope={customerId ? "Vantaggi del cliente" : "Modelli del salone"}/>
          {!settings.gift_cards_enabled ? <View style={benefitsUi.panel}><Text style={benefitsUi.copy}>Nuove gift card disattivate. Puoi preparare i modelli e gestire i buoni già emessi.</Text>{button("Vai alle attivazioni",()=>onOpenSection("settings"))}</View> : null}
          {button(
            showGiftTemplates
              ? "Chiudi modelli"
              : "Modelli gift card del salone",
            () => setShowGiftTemplates((v) => !v),
          )}
          {showGiftTemplates ? (
            <GiftCardTemplates
              workspaceId={workspaceId}
              disabled={busy || disabled}
              onBusy={(v) => {
                setTemplateBusy(v);
                onBusy?.(v);
              }}
              onChoose={
                customerId && settings.gift_cards_enabled
                  ? (t) => {
                      setShowGiftForm(true);
                      setSender("");
                      setGiftMethod("complimentary");
                      setShowGiftTemplates(false);
                      setAmount(String(t.amount_cents / 100));
                      setMessage(t.message);
                      setConfirmGift(false);
                      if (t.months) {
                        const d = new Date();
                        const day = d.getDate();
                        d.setDate(1);
                        d.setMonth(d.getMonth() + t.months);
                        const last = new Date(
                          d.getFullYear(),
                          d.getMonth() + 1,
                          0,
                        ).getDate();
                        d.setDate(Math.min(day, last));
                        d.setDate(d.getDate() - 1);
                        setExpires(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                        );
                      } else setExpires("");
                    }
                  : undefined
              }
            />
          ) : null}
          {gifts.map((g) => (
            <View
              key={g.id}
              style={benefitsUi.card}
            >
              <Text style={{ fontWeight: "700", fontSize: 18 }}>
                Gift card · {packageMoney(g.available)} disponibili
              </Text>
              {button(
                expandedGift === g.id
                  ? "Chiudi dettagli"
                  : "Mostra buono e invia",
                () => setExpandedGift((v) => (v === g.id ? null : g.id)),
              )}
              {expandedGift === g.id ? (
                <>
                  <Text
                    selectable
                    style={{ letterSpacing: 1, color: premiumColor("#963B57","color") }}
                  >
                    {g.code}
                  </Text>
                  <Text style={{color:premiumColor("#26384A")}}>
                    {g.expires_on
                      ? `Scadenza ${g.expires_on.split("-").reverse().join("/")}`
                      : "Senza scadenza"}{" "}
                    ·{" "}
                    {g.funding === "paid" ? "Acquistata" : "Omaggio del salone"}
                  </Text>
                  {g.message ? <Text style={{color:premiumColor("#26384A")}}>{g.message}</Text> : null}
                  <GiftCardDocument
                    gift={{ ...g, available_cents: g.available }}
                  />
                  <GiftCardEmail giftId={g.id} />
                  <Text style={{ color: premiumColor("#526477","color") }}>
                    Buono intestato a questo cliente.
                  </Text>
                </>
              ) : null}
            </View>
          ))}
          {settings.gift_cards_enabled && customerId && !showGiftForm
            ? button("Crea una gift card", () => {
                setAmount("");
                setSender("");
                setMessage("");
                setExpires("");
                setGiftMethod("complimentary");
                setShowGiftForm(true);
                setConfirmGift(false);
              })
            : null}
          {settings.gift_cards_enabled && customerId && showGiftForm ? (
            <View style={benefitsUi.panel}>
              <PremiumSectionHeading tone={3} style={{ fontWeight: "700", fontSize: 18 }}>1. Personalizza il regalo</PremiumSectionHeading>
              <PremiumChoiceRow style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[25, 50, 100, 150].map((value) => (
                  <HapticTouchable
                    key={value}
                    disabled={busy || disabled}
                    onPress={() => {
                      setAmount(String(value));
                      setConfirmGift(false);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor:
                        amount === String(value) ? premiumColor("#F3D9E3","backgroundColor") : premiumColor("#F2F4F7","backgroundColor"),
                    }}
                  >
                    <Text style={{color:premiumColor("#26384A")}}>{value} €</Text>
                  </HapticTouchable>
                ))}
              </PremiumChoiceRow>
              {input(
                "Valore €",
                amount,
                (v) => {
                  setAmount(v);
                  setConfirmGift(false);
                },
                true,
              )}
              {input("Da parte di", sender, (v) => {
                setSender(v);
                setConfirmGift(false);
              })}
              {input("Messaggio regalo", message, (v) => {
                setMessage(v);
                setConfirmGift(false);
              })}
              <BenefitDateField
                label="Scadenza gift card"
                value={expires}
                optional
                disabled={busy || disabled}
                onChange={(v) => {
                  setExpires(v);
                  setConfirmGift(false);
                }}
              />
              <PremiumSectionHeading tone={2} style={{ fontWeight: "800", fontSize: 17 }}>2. Come viene emessa?</PremiumSectionHeading>
              <PremiumChoiceRow style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(
                  ["complimentary", "cash", "card", "bank_transfer"] as const
                ).map((m, i) => (
                  <HapticTouchable
                    key={m}
                    disabled={busy || disabled}
                    style={{
                      ...benefitsUi.secondary,
                      borderColor: giftMethod === m ? premiumColor("#B8758C","borderColor") : premiumColor("#E1D9E2","borderColor"),
                      backgroundColor: giftMethod === m ? premiumColor("#F6E4EB","backgroundColor") : premiumColor("#FFF","backgroundColor"),
                    }}
                    onPress={() => {
                      setGiftMethod(m);
                      setConfirmGift(false);
                    }}
                  >
                    <Text style={{color:premiumColor("#26384A")}}>
                      {["Omaggio salone", "Contanti", "POS", "Bonifico"][i]}
                    </Text>
                  </HapticTouchable>
                ))}
              </PremiumChoiceRow>
              <Text style={{ color: premiumColor("#526477","color") }}>
                {giftMethod === "complimentary"
                  ? "È un regalo del salone: non verrà registrato alcun incasso."
                  : "Conferma soltanto se il pagamento è già stato ricevuto. Verrà registrato una sola volta in Cassa."}
              </Text>
              {confirmGift ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: premiumColor("#FFF2F6","backgroundColor"),
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>
                    3. Controlla e conferma
                  </Text>
                  <Text style={{color:premiumColor("#26384A")}}>
                    Valore:{" "}
                    {packageMoney(
                      Math.round(Number(amount.replace(",", ".")) * 100),
                    )}
                  </Text>
                  <Text style={{color:premiumColor("#26384A")}}>
                    {expires
                      ? `Scade il ${expires.split("-").reverse().join("/")}`
                      : "Senza scadenza"}
                  </Text>
                  <Text style={{color:premiumColor("#26384A")}}>
                    {giftMethod === "complimentary"
                      ? "Omaggio del salone · Nessun incasso"
                      : "Pagamento già ricevuto · Verrà registrato in Cassa"}
                  </Text>
                </View>
              ) : null}
              {button(
                confirmGift
                  ? "Conferma emissione gift card"
                  : "Prepara gift card",
                () => {
                  if (!confirmGift) {
                    const value = Number(amount.replace(",", "."));
                    if (
                      !Number.isFinite(value) ||
                      value <= 0 ||
                      value > 1000000
                    ) {
                      setError("Indica un importo valido prima di proseguire.");
                      return;
                    }
                    setError("");
                    operation.current = benefitOperationId();
                    setConfirmGift(true);
                    return;
                  }
                  void run(async () => {
                    const cents = Math.round(
                      Number(amount.replace(",", ".")) * 100,
                    );
                    if (!Number.isFinite(cents) || cents <= 0)
                      throw new Error("Inserisci un valore valido.");
                    if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires))
                      throw new Error("Controlla la data di scadenza.");
                    await rpc("issue_customer_gift_card", {
                      p_id: operation.current,
                      p_customer: customerId,
                      p_amount: cents,
                      p_expires: expires || null,
                      p_sender: sender,
                      p_message: message,
                      p_method:
                        giftMethod === "complimentary" ? null : giftMethod,
                    });
                    setConfirmGift(false);
                    setShowGiftForm(false);
                    setExpandedGift(operation.current);
                    setAmount("");
                    setNotice(
                      "Gift card pronta. Apri il buono per scaricarlo o inviarlo.",
                    );
                  });
                },
              )}
              {button("Annulla", () => {
                setShowGiftForm(false);
                setConfirmGift(false);
                setError("");
              })}
            </View>
          ) : !customerId || !settings.gift_cards_enabled ? (
            <Text style={{ color: premiumColor("#526477","color") }}>
              {!customerId && settings.gift_cards_enabled
                ? "Scegli un cliente per creare e assegnare una gift card."
                : "Emissione gift card disattivata. Quelle già emesse restano utilizzabili."}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
