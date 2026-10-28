import {useNativePremium} from '../owner-native-premium';
import {shopSectionTone} from './shop-section-tone';
import { useShopAttention } from '../../src/lib/use-shop-attention';
import { ShopOrderAttention, ShopAttentionDot, shopSectionHasAttention } from './shop-attention';
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HapticTouchable } from "../ui/haptic-touchable";
import { ShopConsole } from "./shop-console";
export function ShopEntry({
  workspaceId,
  compact = false,
  entryPoint = "management",
  renderTrigger,
  premiumNative = false,
  followOrderLinks = true,
  attentionActive = true,
}: {
  workspaceId: string;
  premiumNative?: boolean;
  followOrderLinks?: boolean;
  attentionActive?: boolean;
  compact?: boolean;
  entryPoint?: "management" | "checkout";
  renderTrigger?: (onPress: () => void, needsAttention: boolean) => React.ReactNode;
}) {
  const nativeScope=useNativePremium();
  const checkout = entryPoint === "checkout";
  const title = checkout ? "Vendite prodotti e ritiri" : "Shop e magazzino";
  const { shopOrderId } = useLocalSearchParams<{ shopOrderId?: string }>();
  useEffect(() => {
    if (followOrderLinks && shopOrderId) setOpen(true);
  }, [followOrderLinks, shopOrderId]);
  const [open, setOpen] = useState(false);
  const alerts = useShopAttention(workspaceId, attentionActive || open);
  const orderAttention = (alerts?.orders_pending ?? 0) + (alerts?.orders_ready ?? 0);
  const needsAttention = shopSectionHasAttention(alerts, "orders") || (!checkout && (shopSectionHasAttention(alerts, "supply") || shopSectionHasAttention(alerts, "control")));
  return (
    <>
      {renderTrigger ? renderTrigger(() => setOpen(true), needsAttention) : <HapticTouchable
        accessibilityRole="button"
        accessibilityLabel={`Apri ${title}${needsAttention ? ", attività da gestire" : ""}`}
        onPress={() => setOpen(true)}
        pressScale={0.985}
        style={[styles.card, compact && styles.compact]}
      >
        <View style={styles.heading}>
          <View {...(Platform.OS === "web" ? {dataSet:{premiumShopIcon:"true"}} : {})} style={[styles.icon,{backgroundColor:shopSectionTone(checkout ? "orders" : "overview").soft}]}>
            <Ionicons name={checkout ? "cart-outline" : "bag-handle-outline"} size={24} color={shopSectionTone(checkout ? "orders" : "overview").ink} />
            <ShopAttentionDot active={needsAttention}/>
          </View>
          <View style={styles.content}>
            {!compact && (
              <Text style={styles.eyebrow}>IL NEGOZIO DEL SALONE</Text>
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>
              {checkout
                ? "Vendi un prodotto o gestisci un ordine da ritirare"
                : compact
                ? "Prodotti, vendite, ordini e scorte"
                : "Dalla vetrina al magazzino, ogni prodotto al suo posto."}
            </Text>
          </View>
          <View style={[styles.arrow, !compact && styles.actionArrow]}>
            <Ionicons name={compact ? "chevron-forward" : "arrow-forward"} size={19} color="#31576B" />
          </View>
        </View>
        <ShopOrderAttention value={alerts}/>
        {!compact && (
          <View style={styles.shortcuts}>
            {(
              [
                ["storefront-outline", "Vendite e ritiri"],
                ["cube-outline", "Scorte e fornitori"],
              ] as const
            ).map(([icon, label]) => (
              <View key={label} style={styles.shortcut}>
                <Ionicons name={icon} size={16} color="#567080" />
                <Text style={styles.shortcutText}>{label}</Text>
              </View>
            ))}
          </View>
        )}
        {!!alerts && (alerts.pending > 0 || alerts.expiring > 0) && (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: "#9B4D22",
              fontWeight: "600",
            }}
          >
            {[
              alerts.pending > 0
                ? `${alerts.pending} ${alerts.pending === 1 ? "consumo da verificare" : "consumi da verificare"}`
                : "",
              alerts.expiring > 0
                ? `${alerts.expiring} ${alerts.expiring === 1 ? "lotto da controllare" : "lotti da controllare"}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </HapticTouchable>}
      {open ? (
        <ShopConsole
          key={workspaceId}
          workspaceId={workspaceId}
          premiumNative={premiumNative||nativeScope}
          title={title}
          initialMode={shopOrderId || orderAttention > 0 ? "orders" : checkout ? "products" : "overview"}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 12,
    padding: 20,
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D4E3EC",
    backgroundColor: "#F8FBFD",
    shadowColor: "#234356",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  compact: { padding: 16, borderRadius: 22, marginVertical: 10 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#EAF1F5",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: {
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.3,
    fontWeight: "700",
    color: "#69808E",
  },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700", color: "#213746" },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: "#6A7D89",
    flexShrink: 1,
  },
  actionArrow: { borderRadius: 15, backgroundColor: "#E4EFF5", width: 42, height: 42 },
  arrow: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcuts: {
    borderTopWidth: 1,
    borderColor: "#E8EEF2",
    paddingTop: 13,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 7 },
  shortcutText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#567080",
    fontWeight: "600",
  },
});
