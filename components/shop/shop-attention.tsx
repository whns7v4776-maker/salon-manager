import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type ShopAttention } from "../../src/lib/use-shop-attention";
export function ShopOrderAttention({ value }: { value: ShopAttention | null }) {
  if (!value || !(value.orders_pending || value.orders_ready)) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
    >
      {value.orders_pending > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: "#FFF0F0",
            borderColor: "#F0C8CB",
            borderWidth: 1,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
          }}
        >
          <Ionicons name="notifications" size={14} color="#B23C49" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#A63341" }}>
            {value.orders_pending} da preparare
          </Text>
        </View>
      ) : null}
      {value.orders_ready > 0 ? (
        <View
          style={{
            backgroundColor: "#FFF5E6",
            borderWidth: 1,
            borderColor: "#EFD8AE",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#885414" }}>
            {value.orders_ready} da ritirare
            {value.orders_due > 0 ? ` · ${value.orders_due} da incassare` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function shopSectionHasAttention(value: ShopAttention | null, section: string) {
  if (!value) return false;
  if (section === "orders") return value.orders_pending + value.orders_ready > 0;
  if (section === "supply") return value.purchases_pending > 0;
  if (section === "control") return value.pending + value.expiring > 0;
  return false;
}
export function ShopAttentionDot({ active }: { active: boolean }) {
  return active ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",top:-2,right:-2,width:10,height:10,borderRadius:5,backgroundColor:"#D74650",borderWidth:2,borderColor:"#FFFFFF"}} /> : null;
}
