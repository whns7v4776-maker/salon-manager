import { StyleSheet } from "react-native";
export type StoreSettings = {
  enabled: boolean;
  storefront_enabled: boolean;
  pickup_enabled: boolean;
  gift_enabled: boolean;
  rewards_enabled: boolean;
  hold_hours: number;
  storefront_revision: number;
};
export type StoreProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  variant: string;
  image_url: string;
  price_cents: number;
  available: number;
  revision: number;
};
export type StoreReward = {
  id: string;
  name: string;
  points_cost: number;
  kind: "fixed" | "percent" | "product";
  value: number;
  product_id: string | null;
  expires_on: string | null;
  archived: boolean;
  revision: number;
};
export type StoreOrder = {
  id: string;
  status: string;
  total_cents: number;
  discount_cents: number;
  gift_cents: number;
  due_cents: number;
  reward_name: string | null;
  reward_points: number;
  refunded_cents: number;
  gift_refund_cents: number;
  expires_at: string;
  created_at: string;
  revision: number;
  customer_name: string;
  lines: {
    product_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
  }[];
};
export type StoreCatalog = {
  visible: boolean;
  orders_supported?: boolean;
  pickup_enabled: boolean;
  hold_hours: number;
  count: number;
  products: StoreProduct[];
};
export type CustomerStore = {
  orders: StoreOrder[];
  points: number;
  rewards: StoreReward[];
  gifts: {
    id: string;
    code: string;
    expires_on: string | null;
    available_cents: number;
  }[];
};
export const orderStatus: Record<string, string> = {
  pending: "In attesa del salone",
  ready: "Pronto al ritiro",
  collected: "Ritirato",
  cancelled: "Annullato",
  expired: "Scaduto",
};
export const shopDate = (value: string) =>
  new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function rewardDiscount(
  reward: StoreReward | undefined,
  lines: { product: StoreProduct; quantity: number }[],
) {
  const total = lines.reduce(
    (v, l) => v + l.product.price_cents * l.quantity,
    0,
  );
  if (!reward) return 0;
  if (reward.kind === "percent")
    return Math.floor((total * reward.value) / 100);
  if (reward.kind === "fixed") return Math.min(total, reward.value);
  return (
    lines.find((l) => l.product.id === reward.product_id)?.product
      .price_cents || 0
  );
}
export const shopUI = StyleSheet.create({
  stack: { gap: 16 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  grow: { flex: 1, minWidth: 160 },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D8E5EE",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  title: { fontSize: 20, lineHeight: 27, fontWeight: "700", color: "#20384D", flexShrink: 1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#20384D", flexShrink: 1 },
  copy: { fontSize: 14, lineHeight: 21, color: "#627487", flexShrink: 1 },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D5E1EB",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    color: "#20384D",
    fontSize: 16,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: "#F0F5F9",
    borderWidth: 1,
    borderColor: "#DDE7EF",
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: "#285B78", borderColor: "#285B78" },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#285B78", textAlign: "center", flexShrink: 1 },
  white: { color: "#FFFFFF" },
  disabled: { backgroundColor: "#E8EDF1" },
  error: { color: "#A53240", fontSize: 14, lineHeight: 21 },
  selected: {
    borderColor: "#285B78",
    borderWidth: 2,
    backgroundColor: "#E8F3FA",
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#285B78",
    backgroundColor: "#DAEAF5",
    borderRadius: 10,
    padding: 7,
    alignSelf: "flex-start",
  },
});

// Reading/opening an order never acknowledges collection.
export function hasCustomerShopAttention(orders: StoreOrder[], now = Date.now()) {
  return orders.some(order => (order.status === "pending" || order.status === "ready") && Date.parse(order.expires_at) > now);
}
