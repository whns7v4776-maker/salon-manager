import { useCustomerShopStyles } from './customer-shop-theme';
import { PremiumSearchToolbar } from '../ui/premium-search-toolbar';
import { ShopAttentionDot } from "./shop-attention";
import {ShopSectionToneContext} from './shop-section-tone';
import React from "react";
import { Text, TextInput, View } from "react-native";
import { HapticTouchable } from "../ui/haptic-touchable";
import {
  shopDate,
  orderStatus,
  type StoreOrder,
} from "../../src/lib/shop-pickup";
import { shopMoney } from "../../src/lib/shop-inventory";
export function ShopButton({
  title,
  onPress,
  disabled = false,
  primary = false,
  attention = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  attention?: boolean;
}) {
  const s = useCustomerShopStyles();
  const tone=React.useContext(ShopSectionToneContext);
  return (
    <HapticTouchable
      accessibilityRole="button"
      accessibilityLabel={`${title}${attention ? ", ordine in sospeso" : ""}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, primary && s.primary, tone && {backgroundColor:primary ? tone.soft : "#FFFFFF",borderColor:tone.border}, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, primary && !disabled && s.white, tone && !disabled && {color:tone.ink}]}>
        {title}
      </Text>
      <ShopAttentionDot active={attention}/>
    </HapticTouchable>
  );
}
export function ShopField({
  label,
  value,
  onChange,
  numeric = false,
  secure = false,
  disabled = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  secure?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const s = useCustomerShopStyles();
  return (
    <PremiumSearchToolbar enabled={/cerca/i.test(label)}><View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={s.copy.color}
        style={[
          s.input,
          multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
        multiline={multiline}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
        secureTextEntry={secure}
        editable={!disabled}
        autoCapitalize={secure ? "none" : "sentences"}
      />
    </View></PremiumSearchToolbar>
  );
}
export function OrderSummary({
  order: o,
  owner = false,
  children,
}: {
  order: StoreOrder;
  owner?: boolean;
  children?: React.ReactNode;
}) {
  const s = useCustomerShopStyles();
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={[s.label, s.grow]}>
          Ordine {o.id.slice(0, 8).toUpperCase()}
        </Text>
        <Text style={s.badge}>{orderStatus[o.status] || o.status}</Text>
      </View>
      {owner && <Text style={s.label}>{o.customer_name}</Text>}
      <Text style={s.copy}>
        {shopDate(o.created_at)}
        {["pending", "ready"].includes(o.status)
          ? ` · Ritiro entro ${shopDate(o.expires_at)}`
          : ""}
      </Text>
      {o.lines.map((l) => (
        <Text key={l.product_id} style={s.copy}>
          {l.quantity} × {l.name} · {shopMoney(l.quantity * l.unit_price_cents)}
        </Text>
      ))}
      {o.discount_cents > 0 && (
        <Text style={s.copy}>
          {o.reward_name} · −{shopMoney(o.discount_cents)} ({o.reward_points}{" "}
          punti)
        </Text>
      )}
      {o.gift_cents > 0 && (
        <Text style={s.copy}>Gift card · {shopMoney(o.gift_cents)}</Text>
      )}
      {["cancelled", "expired"].includes(o.status) ? (
        <Text style={s.label}>
          Nessun saldo da pagare. Credito e punti riservati sono stati liberati.
        </Text>
      ) : (
        <Text style={s.label}>
          {o.status === "collected" ? "Saldo registrato" : "Saldo al ritiro"}:{" "}
          {shopMoney(o.due_cents)}
        </Text>
      )}
      {(o.refunded_cents > 0 || o.gift_refund_cents > 0) && (
        <Text style={s.copy}>
          Resi: {shopMoney(o.refunded_cents)} rimborsati ·{" "}
          {shopMoney(o.gift_refund_cents)} restituiti sulla gift card.
        </Text>
      )}
      {children}
    </View>
  );
}
