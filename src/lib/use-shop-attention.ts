import { useState } from "react";
import { supabase } from "./supabase";
import { useShopRefresh } from "./use-shop-refresh";
export type ShopAttention = {
  pending: number;
  expiring: number;
  orders_pending: number;
  orders_ready: number;
  orders_due: number;
  purchases_pending: number;
};
const reads = new Map<string, Promise<ShopAttention>>();
export function useShopAttention(workspaceId: string, active = true) {
  const [state, setState] = useState<{
    workspaceId: string;
    value: ShopAttention;
  } | null>(null);
  useShopRefresh(workspaceId, async (isCurrent) => {
    let read = reads.get(workspaceId);
    if (!read) {
      read = (async () => {
        const r = await supabase.rpc("shop_control_alerts");
        if (r.error) throw r.error;
        return r.data as ShopAttention;
      })();
      reads.set(workspaceId, read);
      read.finally(() => reads.delete(workspaceId)).catch(() => {});
    }
    const value = await read;
    if (isCurrent()) setState({ workspaceId, value });
  }, active);
  return state?.workspaceId === workspaceId ? state.value : null;
}
