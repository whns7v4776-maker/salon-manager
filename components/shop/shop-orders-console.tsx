import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { benefitOperationId } from "../../src/lib/service-packages";
import { supabase } from "../../src/lib/supabase";
import { useShopRefresh, notifyShopChanged } from "../../src/lib/use-shop-refresh";
import { shopNumber } from "../../src/lib/shop-inventory";
import {
  shopUI as s,
  type StoreSettings,
  type StoreOrder,
  type StoreReward,
} from "../../src/lib/shop-pickup";
import { ShopButton, ShopField, OrderSummary } from "./shop-pickup-ui";
type Console = {
  settings: StoreSettings;
  orders: StoreOrder[];
  count: number;
  pending: number;
  rewards: StoreReward[];
};
export function ShopOrdersConsole({
  workspaceId,
  onBusy,
}: {
  workspaceId: string;
  onBusy: (v: boolean) => void;
}) {
  const [data, setData] = useState<Console | null>(null),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [settings, setSettings] = useState<StoreSettings | null>(null),
    [hours, setHours] = useState("48");
  const [collect, setCollect] = useState<StoreOrder | null>(null),
    [cancel, setCancel] = useState<StoreOrder | null>(null),
    [method, setMethod] = useState("cash");
  const [reward, setReward] = useState<Partial<StoreReward> | null>(null),
    [points, setPoints] = useState(""),
    [value, setValue] = useState(""),
    [productSearch, setProductSearch] = useState(""),
    [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const alive = useRef(true),
    locked = useRef(false),
    seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const n = ++seq.current;
    const r = await supabase.rpc("shop_orders_console", { p_page: page });
    if (r.error) throw new Error(r.error.message);
    if (alive.current && n === seq.current) setData(r.data);
  }, [page]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useShopRefresh(workspaceId, async () => {
    if (!locked.current) await refresh();
  });
  useEffect(() => {
    let stopped = false;
    const t = setTimeout(() => {
      if (reward?.kind !== "product") return;
      void supabase
        .from("shop_products")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .neq("purpose", "professional")
        .eq("archived", false)
        .ilike("name", `%${productSearch}%`)
        .limit(20)
        .then((r) => {
          if (!stopped) {
            if (r.error) setError(r.error.message);
            else setProducts(r.data || []);
          }
        });
    }, 250);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [productSearch, reward?.kind, workspaceId]);
  const run = async (
    name: string,
    args: Record<string, unknown>,
    done: () => void = () => {},
  ) => {
    if (locked.current) return;
    locked.current = true;
    onBusy(true);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase.rpc(name, args);
      if (r.error) throw new Error(r.error.message);
      notifyShopChanged(workspaceId);
      if (alive.current) {
        done();
        setNotice("Salvato.");
        await refresh();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      locked.current = false;
      onBusy(false);
      if (alive.current) setBusy(false);
    }
  };
  const manage = (o: StoreOrder, action: string) =>
    void run(
      "shop_manage_order",
      {
        p_order: o.id,
        p_revision: o.revision,
        p_action: action,
        p_method: action === "collected" ? method : null,
      },
      () => {
        setCollect(null);
        setCancel(null);
      },
    );
  if (!data)
    return error ? (
      <View style={s.card}>
        <Text style={s.error}>{error}</Text>
        <ShopButton
          title="Riprova"
          onPress={() => {
            setError("");
            void refresh().catch((e) => setError(e.message));
          }}
        />
      </View>
    ) : (
      <ActivityIndicator color="#285B78" />
    );
  return (
    <View style={s.stack}>
      {!!error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {!!notice && <Text style={s.copy}>{notice}</Text>}
      {busy && <ActivityIndicator color="#285B78" />}
      <View style={s.card}>
        <Text style={s.title}>La vetrina dei tuoi prodotti</Text>
        <Text style={s.copy}>
          Pubblica i prodotti scelti e prepara i ritiri. Il saldo viene
          registrato soltanto quando consegni l’ordine.
        </Text>
        <View style={s.row}>
          <Text style={[s.badge, s.grow]}>
            {data.settings.enabled && data.settings.storefront_enabled
              ? "Visibile ai clienti"
              : "Vetrina non visibile"}
          </Text>
          <ShopButton
            title="Impostazioni shop"
            disabled={busy}
            onPress={() => {
              setSettings({ ...data.settings });
              setHours(String(data.settings.hold_hours));
            }}
          />
        </View>
      </View>
      {settings && (
        <View style={s.card}>
          <Text style={s.title}>Attivazione e condizioni</Text>
          {(
            [
              ["storefront_enabled", "Mostra lo shop ai clienti"],
              ["pickup_enabled", "Accetta ordini con ritiro"],
              ["gift_enabled", "Consenti credito gift card"],
              ["rewards_enabled", "Consenti premi sui prodotti"],
            ] as const
          ).map(([key, label]) => (
            <View style={s.row} key={key}>
              <Text style={[s.label, s.grow]}>{label}</Text>
              <Switch
                accessibilityLabel={label}
                value={settings[key]}
                disabled={busy}
                onValueChange={(v) => setSettings({ ...settings, [key]: v })}
              />
            </View>
          ))}
          <ShopField
            label="Ore disponibili per il ritiro · da 1 a 168"
            value={hours}
            onChange={setHours}
            numeric
            disabled={busy}
          />
          <Text style={s.copy}>
            Alla scadenza prodotti, credito e punti vengono liberati.
            Disattivare nuovi ordini non elimina quelli già ricevuti. Ogni
            prodotto va pubblicato dalla sua scheda.
          </Text>
          <ShopButton
            title="Salva impostazioni"
            primary
            disabled={
              busy ||
              !Number.isInteger(shopNumber(hours)) ||
              shopNumber(hours) < 1 ||
              shopNumber(hours) > 168
            }
            onPress={() =>
              void run(
                "shop_store_settings",
                {
                  p_revision: settings.storefront_revision,
                  p_visible: settings.storefront_enabled,
                  p_pickup: settings.pickup_enabled,
                  p_gift: settings.gift_enabled,
                  p_rewards: settings.rewards_enabled,
                  p_hours: shopNumber(hours),
                },
                () => setSettings(null),
              )
            }
          />
          <ShopButton
            title="Annulla"
            disabled={busy}
            onPress={() => setSettings(null)}
          />
        </View>
      )}
      <View style={s.row}>
        <Text style={[s.title, s.grow]}>Premi sui prodotti</Text>
        <ShopButton
          title="Crea premio"
          disabled={busy || !data.settings.enabled}
          onPress={() => {
            setReward({
              id: benefitOperationId(),
              revision: 0,
              kind: "fixed",
              archived: false,
            });
            setPoints("");
            setValue("");
            setProductSearch("");
          }}
        />
      </View>
      <Text style={s.copy}>
        Usa gli stessi punti fedeltà del cliente. I premi prodotti sono scelti
        nel carrello e possono essere abbinati al credito gift card.
      </Text>
      {data.rewards.map((r) => (
        <View style={s.card} key={r.id}>
          <View style={s.row}>
            <View style={s.grow}>
              <Text style={s.label}>{r.name}</Text>
              <Text style={s.copy}>
                {r.points_cost} punti · {r.archived ? "Sospeso" : "Disponibile"}
                {r.expires_on ? ` · Fino al ${r.expires_on}` : ""}
              </Text>
            </View>
            <ShopButton
              title="Modifica"
              disabled={busy}
              onPress={() => {
                setReward(r);
                setPoints(String(r.points_cost));
                setValue(String(r.kind === "fixed" ? r.value / 100 : r.value));
                setProductSearch("");
              }}
            />
          </View>
        </View>
      ))}
      {reward && (
        <View style={s.card}>
          <Text style={s.title}>
            {reward.revision ? "Modifica premio" : "Un nuovo vantaggio"}
          </Text>
          <ShopField
            label="Nome del premio"
            value={reward.name || ""}
            onChange={(name) => setReward({ ...reward, name })}
            disabled={busy}
          />
          <ShopField
            label="Punti necessari"
            value={points}
            onChange={setPoints}
            numeric
            disabled={busy}
          />
          <View style={s.row}>
            {(
              [
                ["fixed", "Sconto €"],
                ["percent", "Sconto %"],
                ["product", "Un prodotto omaggio"],
              ] as const
            ).map(([kind, title]) => (
              <ShopButton
                key={kind}
                title={title}
                primary={reward.kind === kind}
                disabled={busy}
                onPress={() => setReward({ ...reward, kind })}
              />
            ))}
          </View>
          {reward.kind !== "product" ? (
            <ShopField
              label={
                reward.kind === "fixed"
                  ? "Sconto in euro"
                  : "Percentuale di sconto"
              }
              value={value}
              onChange={setValue}
              numeric
              disabled={busy}
            />
          ) : (
            <>
              <ShopField
                label="Cerca il prodotto omaggio"
                value={productSearch}
                onChange={setProductSearch}
              />
              {products.map((p) => (
                <ShopButton
                  key={p.id}
                  title={p.name}
                  primary={reward.product_id === p.id}
                  disabled={busy}
                  onPress={() => setReward({ ...reward, product_id: p.id })}
                />
              ))}
              <Text style={s.copy}>
                Copre una sola unità del prodotto scelto, se presente nel
                carrello.
              </Text>
            </>
          )}
          <ShopField
            label="Scadenza facoltativa · AAAA-MM-GG"
            value={reward.expires_on || ""}
            onChange={(expires_on) => setReward({ ...reward, expires_on })}
            disabled={busy}
          />
          <View style={s.row}>
            <Text style={[s.label, s.grow]}>Sospendi nuove assegnazioni</Text>
            <Switch
              value={!!reward.archived}
              disabled={busy}
              onValueChange={(archived) => setReward({ ...reward, archived })}
            />
          </View>
          <Text style={s.copy}>
            Le modifiche non cambiano gli ordini già confermati.
          </Text>
          <ShopButton
            title="Salva premio"
            primary
            disabled={
              busy ||
              !reward.name?.trim() ||
              !Number.isInteger(shopNumber(points)) ||
              shopNumber(points) < 1 ||
              (reward.kind === "product"
                ? !reward.product_id
                : !(shopNumber(value) > 0))
            }
            onPress={() =>
              void run(
                "shop_save_reward",
                {
                  p_id: reward.id || null,
                  p_revision: reward.revision || 0,
                  p_name: reward.name?.trim(),
                  p_points: shopNumber(points),
                  p_kind: reward.kind,
                  p_value:
                    reward.kind === "product"
                      ? 1
                      : reward.kind === "fixed"
                        ? Math.round(shopNumber(value) * 100)
                        : shopNumber(value),
                  p_product:
                    reward.kind === "product" ? reward.product_id : null,
                  p_expires: reward.expires_on || null,
                  p_archived: !!reward.archived,
                },
                () => setReward(null),
              )
            }
          />
          <ShopButton
            title="Annulla"
            disabled={busy}
            onPress={() => setReward(null)}
          />
        </View>
      )}
      <Text style={s.title}>Ordini e ritiri · {data.pending} da preparare</Text>
      {!data.orders.length && (
        <View style={s.card}>
          <Text style={s.label}>Tutto pronto per il primo ordine</Text>
          <Text style={s.copy}>
            Pubblica almeno un prodotto disponibile e attiva la vetrina. Qui
            vedrai chi ha ordinato e cosa preparare.
          </Text>
        </View>
      )}
      {data.orders.map((o) => (
        <OrderSummary key={o.id} order={o} owner>
          {o.status === "pending" && (
            <ShopButton
              title="Segna pronto e avvisa il cliente"
              primary
              disabled={busy}
              onPress={() => manage(o, "ready")}
            />
          )}
          {o.status === "ready" && (
            <ShopButton
              title="Consegna e registra saldo"
              primary
              disabled={busy}
              onPress={() => {
                setCollect(o);
                setCancel(null);
              }}
            />
          )}
          {["pending", "ready"].includes(o.status) && (
            <ShopButton
              title="Annulla ordine"
              disabled={busy}
              onPress={() => {
                setCancel(o);
                setCollect(null);
              }}
            />
          )}
          {collect?.id === o.id && (
            <View style={s.stack}>
              <Text style={s.label}>Conferma soltanto dopo la consegna</Text>
              {o.due_cents > 0 ? (
                <>
                  <Text style={s.copy}>
                    Seleziona il pagamento già ricevuto. Questa azione registra
                    l’incasso, non addebita carte.
                  </Text>
                  <View style={s.row}>
                    {[
                      ["cash", "Contanti"],
                      ["card", "POS"],
                      ["bank_transfer", "Bonifico"],
                    ].map(([v, label]) => (
                      <ShopButton
                        key={v}
                        title={label}
                        primary={method === v}
                        disabled={busy}
                        onPress={() => setMethod(v)}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <Text style={s.copy}>
                  Ordine coperto dai vantaggi. Nessun saldo da incassare.
                </Text>
              )}
              <ShopButton
                title="Conferma ritiro"
                primary
                disabled={busy}
                onPress={() => manage(o, "collected")}
              />
              <ShopButton
                title="Indietro"
                disabled={busy}
                onPress={() => setCollect(null)}
              />
            </View>
          )}
          {cancel?.id === o.id && (
            <>
              <Text style={s.copy}>
                Libera le scorte, restituisce credito e punti riservati e avvisa
                il cliente.
              </Text>
              <ShopButton
                title="Conferma annullamento"
                disabled={busy}
                onPress={() => manage(o, "cancelled")}
              />
              <ShopButton
                title="Mantieni ordine"
                disabled={busy}
                onPress={() => setCancel(null)}
              />
            </>
          )}
        </OrderSummary>
      ))}
      <View style={s.row}>
        <ShopButton
          title="Precedenti"
          disabled={busy || page === 0}
          onPress={() => setPage(page - 1)}
        />
        <Text style={s.copy}>
          {page + 1} / {Math.max(1, Math.ceil(data.count / 30))}
        </Text>
        <ShopButton
          title="Successivi"
          disabled={busy || (page + 1) * 30 >= data.count}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}
