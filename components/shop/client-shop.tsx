import { CustomerShopThemeContext, useCustomerShopStyles } from "./customer-shop-theme";
import { useAccessAppearance } from "../access-premium";
import { ShopAttentionDot } from "./shop-attention";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CreationSheet } from "../creation-sheet";
import { HapticTouchable } from "../ui/haptic-touchable";
import { publicSupabase } from "../../src/lib/supabase";
import {
  authenticateCustomerPayment,
  customerPaymentToken,
  type PaymentIdentity,
} from "../../src/lib/client-payment-session";
import {
  benefitOperationId,
  refreshServicePackages,
  subscribePackageChanges,
} from "../../src/lib/service-packages";
import { shopMoney } from "../../src/lib/shop-inventory";
import {
  rewardDiscount,
  hasCustomerShopAttention,
  type StoreProduct,
  type StoreCatalog,
  type CustomerStore,
} from "../../src/lib/shop-pickup";
import { ShopButton, ShopField, OrderSummary } from "./shop-pickup-ui";

export function ClientShop({ identity, compactEntry = false, headerEntry = false }: { identity: PaymentIdentity; compactEntry?: boolean; headerEntry?: boolean }) {
  const { palette: customerPalette } = useAccessAppearance();
  const s = useCustomerShopStyles(true);
  const {width:entryViewportWidth}=useWindowDimensions();
  const largeHeaderEntry=headerEntry&&Platform.OS==="web"&&entryViewportWidth>=1000;
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"products" | "cart" | "orders">("products");
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null),
    [state, setState] = useState<CustomerStore | null>(null);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [password, setPassword] = useState("");
  const [cart, setCart] = useState<
      { product: StoreProduct; quantity: number }[]
    >([]),
    [reward, setReward] = useState(""),
    [gift, setGift] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [authRequired, setAuthRequired] = useState(false),
    [cancel, setCancel] = useState("");
  const alive = useRef(true),
    locked = useRef(false),
    generation = useRef(0),
    operation = useRef({ key: "", id: "" });
  const { salonCode, email, phone } = identity;
  useEffect(() => {
    generation.current++;
    setState(null);
    setCatalog(null);
  }, [salonCode, email, phone]);
  const credentials = useCallback(
    async () => ({
      p_salon_code: salonCode,
      p_email: email,
      p_phone: phone,
      p_token: await customerPaymentToken({ salonCode, email, phone }),
    }),
    [salonCode, email, phone],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    const result = await publicSupabase.rpc("public_shop_catalog", {
      p_salon_code: salonCode,
      p_search: query,
      p_page: page,
    });
    if (result.error) throw new Error(result.error.message);
    if (alive.current && seq === generation.current) setCatalog(result.data);
    try {
      const args = await credentials();
      const r = await publicSupabase.rpc("customer_shop_state", args);
      if (r.error) throw new Error(r.error.message);
      if (alive.current && seq === generation.current) {
        setState(r.data);
        setAuthRequired(false);
      }
    } catch (e) {
      if (alive.current && seq === generation.current) {
        if (/password|session|token/i.test(String(e))) {
          setAuthRequired(true);
          setState(null);
        } else throw e;
      }
    }
  }, [salonCode, query, page, credentials]);
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    void refresh().catch((e) => {
      if (alive.current) setError(e.message);
    });
  }, [refresh, open]);
  useEffect(() => {
    let running = false;
    const run = () => {
      if (
        running ||
        locked.current ||
        AppState.currentState === "background" ||
        (Platform.OS === "web" && document.visibilityState === "hidden")
      )
        return;
      running = true;
      void latest
        .current()
        .catch(() => {})
        .finally(() => {
          running = false;
        });
    };
    const push = Notifications.addNotificationReceivedListener((n) => {
      if (n.request.content.data?.benefitEventId) run();
    });
    const timer = setInterval(run, open ? 15000 : 60000),
      app = AppState.addEventListener("change", (v) => {
        if (v === "active") run();
      }),
      unsubscribe = subscribePackageChanges(run);
    if (Platform.OS === "web") window.addEventListener("online", run);
    return () => {
      push.remove();
      clearInterval(timer);
      app.remove();
      unsubscribe();
      if (Platform.OS === "web") window.removeEventListener("online", run);
    };
  }, [open]);
  const run = async (task: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await refresh();
      refreshServicePackages();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Operazione non riuscita. Riprova.",
        );
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const add = (p: StoreProduct) => {
    setCart((items) => {
      const old = items.find((l) => l.product.id === p.id);
      if ((old?.quantity || 0) >= Math.min(p.available, 100)) return items;
      if (!old && items.length >= 40) return items;
      return old
        ? items.map((l) =>
            l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...items, { product: p, quantity: 1 }];
    });
    setNotice("Aggiunto al carrello.");
  };
  const total = cart.reduce(
      (v, l) => v + l.product.price_cents * l.quantity,
      0,
    ),
    selectedReward = state?.rewards.find((r) => r.id === reward),
    discount = rewardDiscount(selectedReward, cart);
  const selectedGift = state?.gifts.find((g) => g.id === gift),
    credit = Math.min(selectedGift?.available_cents || 0, total - discount),
    due = total - discount - credit;
  const order = () =>
    void run(async () => {
      const args = await credentials(),
        payload = {
          lines: cart.map((l) => ({
            id: l.product.id,
            quantity: l.quantity,
            revision: l.product.revision,
          })),
          reward_id: reward || null,
          reward_revision: selectedReward?.revision || null,
          gift_id: gift || null,
          expected_due: due,
        };
      const key = JSON.stringify(payload);
      if (operation.current.key !== key)
        operation.current = { key, id: benefitOperationId() };
      const r = await publicSupabase.rpc("customer_shop_order", {
        ...args,
        p_operation: operation.current.id,
        p_payload: payload,
      });
      if (r.error) throw new Error(r.error.message);
      if (!alive.current) return;
      operation.current = { key: "", id: "" };
      setCart([]);
      setGift("");
      setReward("");
      setTab("orders");
      setNotice(
        "Ordine ricevuto. Nessun pagamento online: attenderai la conferma del salone per il ritiro.",
      );
    });
  const updateCart = () =>
    void run(async () => {
      const r = await publicSupabase.rpc("public_shop_cart", {
        p_salon_code: salonCode,
        p_ids: cart.map((l) => l.product.id),
      });
      if (r.error) throw new Error(r.error.message);
      const next = r.data as StoreProduct[];
      const missing = cart.filter(
        (l) =>
          !next.some((p) => p.id === l.product.id && p.available >= l.quantity),
      );
      if (missing.length)
        throw new Error(
          "Riduci o rimuovi i prodotti non disponibili: " +
            missing.map((l) => l.product.name).join(", "),
        );
      setCart(
        cart.map((l) => ({
          ...l,
          product: next.find((p) => p.id === l.product.id)!,
        })),
      );
      setNotice(
        "Prezzi e disponibilità aggiornati. Controlla il totale prima di confermare.",
      );
    });
  const needsAttention = hasCustomerShopAttention(state?.orders ?? []);
  if (
    !catalog ||
    (!catalog.visible && !catalog.orders_supported && !state?.orders.length)
  )
    return null;
  return (
    <CustomerShopThemeContext.Provider value={true}>
      <HapticTouchable
        accessibilityRole="button"
        accessibilityLabel={`Apri lo shop del salone${needsAttention ? ", ordine in sospeso" : ""}`}
        onPress={() => {
          if (!catalog.visible || needsAttention) setTab("orders");
          setOpen(true);
        }}
        style={[
          s.card,
          { marginTop: compactEntry ? 0 : 10, marginBottom: compactEntry ? 14 : 10, flexDirection: "row", alignItems: "center" },
          compactEntry && { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 7, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: customerPalette.border, backgroundColor: customerPalette.field, shadowOpacity: 0, elevation: 0, gap: 8 },
          headerEntry && { marginBottom: 0, alignSelf: "center", minHeight: largeHeaderEntry ? 48 : 44, paddingHorizontal: largeHeaderEntry ? 13 : 10, borderRadius: 14, backgroundColor: customerPalette.surface, gap: 6 },
        ]}
      >
        <View style={{position:"relative"}}><Ionicons name="bag-handle-outline" size={largeHeaderEntry ? 21 : compactEntry ? 17 : 28} color={compactEntry ? customerPalette.ink : "#285B78"} /><ShopAttentionDot active={needsAttention}/></View>
        <View style={{ flex: compactEntry ? undefined : 1, minWidth: 0, gap: 4 }}>
          <Text style={[s.title, compactEntry && { color: customerPalette.ink, fontSize: largeHeaderEntry ? 14 : 12, lineHeight: 20, fontWeight: "600" }]}>
            {headerEntry ? "Shop" : catalog.visible ? compactEntry ? "Shop del salone" : "Lo shop del salone" : "I tuoi ordini shop"}
          </Text>
          {!compactEntry ? <>
          <Text style={[s.copy, compactEntry && { color: customerPalette.muted, fontSize: 12, lineHeight: 18 }]}>
            {catalog.visible
              ? "Scegli i prodotti, ritira in salone."
              : "Consulta lo storico dei tuoi ritiri."}
          </Text>
          </> : null}
        </View>
        {!headerEntry ? <Ionicons name="chevron-forward" size={compactEntry ? 15 : 21} color={compactEntry ? customerPalette.muted : "#285B78"} /> : null}
      </HapticTouchable>
      {open && (
        <Modal
          transparent
          animationType="none"
          onRequestClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <CreationSheet premiumWeb premiumKind="shop"
              dismissDisabled={busy}
              title="Lo shop del salone"
              icon="bag-handle-outline"
              onClose={() => {
                if (!busy) setOpen(false);
              }}
              animatePresentation
              keepFocusedFieldVisible
            >
              <View style={s.stack}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
                  {(
                    [
                      ["products", "Prodotti"],
                      [
                        "cart",
                        `Carrello · ${cart.reduce((n, l) => n + l.quantity, 0)}`,
                      ],
                      ["orders", "I tuoi ordini"],
                    ] as const
                  ).map(([v, label]) => (
                    <ShopButton
                      key={v}
                      title={label}
                      primary={tab === v}
                      attention={v === "orders" && needsAttention}
                      disabled={busy}
                      onPress={() => {
                        setTab(v);
                        setError("");
                        setNotice("");
                      }}
                    />
                  ))}
                </ScrollView>
                {busy && <ActivityIndicator color={customerPalette.ink} />}
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                {!!notice && (
                  <Text accessibilityLiveRegion="polite" style={s.copy}>
                    {notice}
                  </Text>
                )}
                {authRequired && tab !== "products" && (
                  <View style={s.card}>
                    <Text style={s.label}>
                      Accedi ai tuoi ordini e vantaggi
                    </Text>
                    <Text style={s.copy}>
                      Conferma la password del tuo account cliente.
                    </Text>
                    <ShopField
                      label="Password"
                      value={password}
                      onChange={setPassword}
                      secure
                      disabled={busy}
                    />
                    <ShopButton
                      title="Accedi"
                      disabled={busy || !password}
                      primary
                      onPress={() =>
                        void run(async () => {
                          await authenticateCustomerPayment(identity, password);
                          setPassword("");
                        })
                      }
                    />
                  </View>
                )}
                {tab === "products" && (
                  <>
                    <Text style={s.copy}>
                      {catalog.visible
                        ? catalog.pickup_enabled
                          ? `Prenota qui, paga l’eventuale saldo al ritiro. I prodotti restano riservati fino a ${catalog.hold_hours} ore.`
                          : "Il catalogo è consultabile. Per acquistare contatta il salone."
                        : "Il catalogo è momentaneamente chiuso. I tuoi ordini restano disponibili."}
                    </Text>
                    <ShopField
                      label="Cerca prodotto o marca"
                      value={search}
                      onChange={setSearch}
                    />
                    {catalog.products.map((p) => (
                      <View key={p.id} style={s.card}>
                        <View style={s.row}>
                          {!!p.image_url && (
                            <Image
                              source={{ uri: p.image_url }}
                              style={{
                                width: 76,
                                height: 76,
                                borderRadius: 14,
                              }}
                              resizeMode="contain"
                            />
                          )}
                          <View style={s.grow}>
                            {!!p.brand && <Text style={s.copy}>{p.brand}</Text>}
                            <Text style={s.title}>{p.name}</Text>
                            {!!p.variant && (
                              <Text style={s.copy}>{p.variant}</Text>
                            )}
                            <Text style={s.label}>
                              {shopMoney(p.price_cents)}
                            </Text>
                          </View>
                        </View>
                        <View style={s.row}>
                          <Text style={[s.copy, s.grow]}>
                            {p.available > 0
                              ? "Disponibile in salone"
                              : "Esaurito"}
                          </Text>
                          <ShopButton
                            title="Aggiungi"
                            primary
                            disabled={
                              busy ||
                              !catalog.pickup_enabled ||
                              p.available <= 0 ||
                              (cart.find((l) => l.product.id === p.id)
                                ?.quantity || 0) >= p.available
                            }
                            onPress={() => add(p)}
                          />
                        </View>
                      </View>
                    ))}
                    {!catalog.products.length && (
                      <Text style={s.copy}>
                        Nessun prodotto disponibile con questa ricerca.
                      </Text>
                    )}
                    <View style={s.row}>
                      <ShopButton
                        title="Precedenti"
                        disabled={busy || page === 0}
                        onPress={() => setPage(page - 1)}
                      />
                      <Text style={s.copy}>
                        {page + 1} /{" "}
                        {Math.max(1, Math.ceil(catalog.count / 24))}
                      </Text>
                      <ShopButton
                        title="Successivi"
                        disabled={busy || (page + 1) * 24 >= catalog.count}
                        onPress={() => setPage(page + 1)}
                      />
                    </View>
                  </>
                )}
                {tab === "cart" && (
                  <>
                    {!cart.length ? (
                      <View style={s.card}>
                        <Text style={s.title}>Il carrello ti aspetta</Text>
                        <Text style={s.copy}>
                          Scegli i prodotti consigliati dal tuo salone.
                        </Text>
                        <ShopButton
                          title="Scopri i prodotti"
                          onPress={() => setTab("products")}
                        />
                      </View>
                    ) : (
                      <>
                        {cart.map((l) => (
                          <View style={s.card} key={l.product.id}>
                            <Text style={s.label}>{l.product.name}</Text>
                            <View style={s.row}>
                              <ShopButton
                                title="−"
                                disabled={busy}
                                onPress={() =>
                                  setCart(
                                    cart.flatMap((x) =>
                                      x.product.id !== l.product.id
                                        ? [x]
                                        : x.quantity > 1
                                          ? [{ ...x, quantity: x.quantity - 1 }]
                                          : [],
                                    ),
                                  )
                                }
                              />
                              <Text style={s.label}>{l.quantity}</Text>
                              <ShopButton
                                title="+"
                                disabled={
                                  busy ||
                                  l.quantity >= l.product.available ||
                                  l.quantity >= 100
                                }
                                onPress={() => add(l.product)}
                              />
                              <Text style={s.label}>
                                {shopMoney(l.product.price_cents * l.quantity)}
                              </Text>
                            </View>
                          </View>
                        ))}
                        <ShopButton
                          title="Aggiorna prezzi e disponibilità"
                          disabled={busy}
                          onPress={updateCart}
                        />
                        {!!state && (
                          <>
                            {state.rewards.length > 0 && (
                              <View style={s.card}>
                                <Text style={s.title}>
                                  Usa i tuoi punti · {state.points}
                                </Text>
                                <ShopButton
                                  title="Conserva i punti"
                                  primary={!reward}
                                  disabled={busy}
                                  onPress={() => setReward("")}
                                />
                                {state.rewards.map((r) => (
                                  <ShopButton
                                    key={r.id}
                                    title={`${r.name} · ${r.points_cost} punti`}
                                    primary={reward === r.id}
                                    disabled={
                                      busy ||
                                      state.points < r.points_cost ||
                                      rewardDiscount(r, cart) <= 0
                                    }
                                    onPress={() => setReward(r.id)}
                                  />
                                ))}
                              </View>
                            )}
                            {state.gifts.some((g) => g.available_cents > 0) && (
                              <View style={s.card}>
                                <Text style={s.title}>Credito gift card</Text>
                                <ShopButton
                                  title="Conserva il credito"
                                  primary={!gift}
                                  disabled={busy}
                                  onPress={() => setGift("")}
                                />
                                {state.gifts
                                  .filter((g) => g.available_cents > 0)
                                  .map((g) => (
                                    <ShopButton
                                      key={g.id}
                                      title={`•••• ${g.code.slice(-4)} · ${shopMoney(g.available_cents)}`}
                                      primary={gift === g.id}
                                      disabled={busy || total - discount <= 0}
                                      onPress={() => setGift(g.id)}
                                    />
                                  ))}
                              </View>
                            )}
                          </>
                        )}
                        <View style={s.card}>
                          <Text style={s.copy}>
                            Prodotti {shopMoney(total)}
                            {discount > 0
                              ? ` · Premio −${shopMoney(discount)}`
                              : ""}
                            {credit > 0
                              ? ` · Gift card −${shopMoney(credit)}`
                              : ""}
                          </Text>
                          <Text style={s.title}>
                            Al ritiro {shopMoney(due)}
                          </Text>
                          <Text style={s.copy}>
                            Nessun addebito online. Credito e punti scelti
                            vengono riservati e saranno liberati se annulli o
                            l’ordine scade.
                          </Text>
                          <ShopButton
                            title="Conferma ordine con ritiro"
                            primary
                            disabled={
                              busy ||
                              !state ||
                              authRequired ||
                              !catalog.pickup_enabled
                            }
                            onPress={order}
                          />
                        </View>
                      </>
                    )}
                  </>
                )}
                {tab === "orders" && state && (
                  <>
                    {!state.orders.length && (
                      <View style={s.card}>
                        <Text style={s.title}>Ancora nessun ordine</Text>
                        <Text style={s.copy}>
                          Troverai qui gli aggiornamenti e il riepilogo dei tuoi
                          ritiri.
                        </Text>
                      </View>
                    )}
                    {state.orders.map((o) => (
                      <OrderSummary key={o.id} order={o}>
                        {["pending", "ready"].includes(o.status) &&
                          (cancel === o.id ? (
                            <>
                              <Text style={s.copy}>
                                Annullare l’ordine e liberare prodotti, credito
                                e punti?
                              </Text>
                              <ShopButton
                                title="Conferma annullamento"
                                disabled={busy}
                                onPress={() =>
                                  void run(async () => {
                                    const r = await publicSupabase.rpc(
                                      "customer_shop_cancel",
                                      {
                                        ...(await credentials()),
                                        p_order: o.id,
                                      },
                                    );
                                    if (r.error)
                                      throw new Error(r.error.message);
                                    setCancel("");
                                  })
                                }
                              />
                              <ShopButton
                                title="Mantieni ordine"
                                disabled={busy}
                                onPress={() => setCancel("")}
                              />
                            </>
                          ) : (
                            <ShopButton
                              title="Annulla ordine"
                              disabled={busy}
                              onPress={() => setCancel(o.id)}
                            />
                          ))}
                      </OrderSummary>
                    ))}
                  </>
                )}
              </View>
            </CreationSheet>
          </GestureHandlerRootView>
        </Modal>
      )}
    </CustomerShopThemeContext.Provider>
  );
}
