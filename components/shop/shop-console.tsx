import { PremiumChoiceRow } from '../ui/premium-choice-row';
import { PremiumSectionHeading } from '../ui/premium-section-heading';
import { PremiumSearchToolbar } from '../ui/premium-search-toolbar';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {NativePremiumScope,NativeReadableText as Text} from '../owner-native-premium';
import { useAccessAppearance } from '../access-premium';
import { premiumShopStyles } from '../owner-premium-shop-style';
import { shopSectionTone, ShopSectionToneContext } from './shop-section-tone';
import { useShopAttention } from '../../src/lib/use-shop-attention';
import { ShopOrderAttention, ShopAttentionDot, shopSectionHasAttention } from './shop-attention';
import { ShopNavigation } from "./shop-navigation";
import { ShopStockControl } from "./shop-stock-control";
import { useAppContext } from "../../src/context/AppContext";
import { ShopSupplyConsole } from "./shop-supply-console";
import { ShopOrdersConsole } from "./shop-orders-console";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CreationSheet } from "../creation-sheet";
import { HapticTouchable } from "../ui/haptic-touchable";
import { supabase } from "../../src/lib/supabase";
import { useShopRefresh, notifyShopChanged } from "../../src/lib/use-shop-refresh";
import { benefitOperationId } from "../../src/lib/service-packages";
import {
  parseShopCsv,
  shopMoney,
  shopNumber,
  shopProductDefaults,
  type ShopConsoleData,
  type ShopProduct,
  type ShopSale,
} from "../../src/lib/shop-inventory";

type Mode =
  "overview" | "products" | "stock" | "sales" | "orders" | "supply" | "control";
type Form = {
  product: ShopProduct | null;
  data: typeof shopProductDefaults;
  price: string;
  cost: string;
  pack: string;
  minimum: string;
  professionalMinimum: string;
};
export function ShopConsole({
  workspaceId,
  initialMode = "overview",
  title = "Shop e magazzino",
  onClose,
  premiumNative = false,
}: {
  workspaceId: string;
  premiumNative?: boolean;
  initialMode?: Mode;
  title?: string;
  onClose: () => void;
}) {
  const { palette: premiumPalette } = useAccessAppearance();
  const s = useMemo(() => premiumShopStyles(baseShopStyles, premiumPalette, premiumNative), [premiumPalette, premiumNative]);
  const { salonWorkspace } = useAppContext();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [historyPage, setHistoryPage] = useState(0);
  const orderAttention = useShopAttention(workspaceId);
  const [data, setData] = useState<ShopConsoleData | null>(null);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState<Form | null>(null),
    [stock, setStock] = useState<ShopProduct | null>(null);
  const [bucket, setBucket] = useState<"retail" | "professional">("retail"),
    [action, setAction] = useState<
      "receive" | "consume" | "count" | "transfer"
    >("receive"),
    [quantity, setQuantity] = useState(""),
    [reason, setReason] = useState("");
  const [cart, setCart] = useState<
      { product: ShopProduct; quantity: number }[]
    >([]),
    [checkout, setCheckout] = useState(false),
    [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [customerQuery, setCustomerQuery] = useState(""),
    [customer, setCustomer] = useState<{
      id: string;
      full_name: string;
    } | null>(null),
    [customerMatches, setCustomerMatches] = useState<
      { id: string; full_name: string }[]
    >([]);
  const [returning, setReturning] = useState<{
      sale: ShopSale;
      product: string;
    } | null>(null),
    [restock, setRestock] = useState(true);
  const [returnQuote, setReturnQuote] = useState<{
    cash_cents: number;
    gift_cents: number;
  } | null>(null);
  useEffect(() => {
    setReturnQuote(null);
  }, [returning, quantity]);
  const [csv, setCsv] = useState<string | null>(null),
    [importRows, setImportRows] = useState<ReturnType<
      typeof parseShopCsv
    > | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const locked = useRef(false),
    generation = useRef(0),
    scanLock = useRef(false),
    alive = useRef(true);
  const operation = useRef({ key: "", id: benefitOperationId() });
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
  useEffect(() => {
    let cancelled = false;
    if (!checkout || customerQuery.trim().length < 2) {
      setCustomerMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void supabase
        .from("customers")
        .select("id,full_name")
        .eq("workspace_id", workspaceId)
        .ilike("full_name", `%${customerQuery.trim()}%`)
        .limit(15)
        .then((r) => {
          if (!cancelled) {
            if (r.error) setError("Ricerca clienti non disponibile.");
            else setCustomerMatches(r.data || []);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkout, customerQuery, workspaceId]);
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    const r = await supabase.rpc("shop_console", {
      p_search: query,
      p_page: page,
      p_archived: archived,
      p_history_page: historyPage,
    });
    if (r.error) throw new Error(r.error.message);
    if (alive.current && seq === generation.current) setData(r.data);
  }, [query, page, archived, historyPage]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useShopRefresh(workspaceId, async () => {
    if (!locked.current) await refresh();
  });
  const mutate = async (
    name: string,
    args: Record<string, unknown>,
    success: (result: any) => void,
    message: string,
    withOperation = false,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let payload = args;
      if (withOperation) {
        const key = JSON.stringify([name, args]);
        if (operation.current.key !== key)
          operation.current = { key, id: benefitOperationId() };
        payload = { ...args, p_operation: operation.current.id };
      }
      const r = await supabase.rpc(name, payload);
      if (r.error) throw new Error(r.error.message);
      notifyShopChanged(workspaceId);
      if (alive.current) {
        success(r.data);
        setNotice(message);
        operation.current = { key: "", id: benefitOperationId() };
      }
      await refresh();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const button = (
    label: string,
    press: () => void,
    primary = false,
    disabled = false,
  ) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={press}
      style={[
        s.button,
        primary && {alignSelf:'stretch',alignItems:'center',justifyContent:'center',marginTop:2},
        primary && {backgroundColor:premiumPalette.action,borderColor:premiumPalette.border},
        (busy || disabled) && {backgroundColor:premiumPalette.field,borderWidth:1,borderColor:premiumPalette.border,opacity:.55},
      ]}
    >
      <Text
        style={[
          s.buttonText,
          primary && {color:premiumPalette.actionText},
          (busy || disabled) && {color:premiumPalette.muted},
        ]}
      >
        {label}
      </Text>
    </HapticTouchable>
  );
  const field = (
    label: string,
    value: string,
    change: (v: string) => void,
    numeric = false,
    multiline = false,
  ) => (
    <PremiumSearchToolbar enabled={/cerca/i.test(label)}><View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        editable={!busy}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoCapitalize={numeric ? "none" : "sentences"}
        multiline={multiline}
        placeholderTextColor="#7A8898"
        style={[
          s.input,
          multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
      />
    </View></PremiumSearchToolbar>
  );
  const choices = <T extends string>(
    items: readonly (readonly [T, string])[],
    value: T,
    change: (v: T) => void,
  ) => (
    <PremiumChoiceRow style={s.wrap}>
      {items.map(([id, label]) => (
        <HapticTouchable
          key={id}
          accessibilityRole="button"
          accessibilityState={{ selected: id === value }}
          disabled={busy}
          onPress={() => change(id)}
          style={[s.chip, {flexShrink:0}, id === value && s.chipSelected]}
        >
          <Text
            style={{
              color:id===value?premiumPalette.actionText:premiumPalette.ink,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
        </HapticTouchable>
      ))}
    </PremiumChoiceRow>
  );
  const edit = (p: ShopProduct | null) => {
    setError("");
    setNotice("");
    setAdvanced(false);
    setForm({
      product: p,
      data: p ? { ...p, barcode: p.barcode || "" } : { ...shopProductDefaults },
      price: p ? String(p.price_cents / 100) : "",
      cost: p ? String(p.cost_cents / 100) : "",
      pack: String(p?.pack_size || 1),
      minimum: String(p?.minimum_retail || 0),
      professionalMinimum: String(p?.minimum_professional || 0),
    });
  };
  const saveProduct = () => {
    if (!form) return;
    const values = [
      shopNumber(form.price),
      shopNumber(form.cost || "0"),
      shopNumber(form.pack),
      shopNumber(form.minimum),
      shopNumber(form.professionalMinimum),
    ];
    if (
      !form.data.name.trim() ||
      !form.price.trim() ||
      !values.every(Number.isFinite) ||
      values.some((v) => v < 0) ||
      values[2] <= 0 ||
      !Number.isInteger(values[3])
    ) {
      setError("Controlla nome, importi, formato e scorte minime.");
      return;
    }
    void mutate(
      form.product ? "shop_save_product" : "shop_create_product",
      {
        ...(form.product
          ? { p_id: form.product.id, p_revision: form.product.revision }
          : {}),
        p_data: {
          ...form.data,
          price_cents: Math.round(values[0] * 100),
          cost_cents: Math.round(values[1] * 100),
          pack_size: values[2],
          minimum_retail: values[3],
          minimum_professional: values[4],
        },
      },
      () => setForm(null),
      "Prodotto salvato.",
      !form.product,
    );
  };
  const stockOpen = (p: ShopProduct) => {
    setStock(p);
    setBucket(p.purpose === "professional" ? "professional" : "retail");
    setAction("receive");
    setQuantity("");
    setReason("");
    setError("");
  };
  const add = (p: ShopProduct) => {
    setNotice("");
    setCart((c) => {
      const entry = c.find((x) => x.product.id === p.id);
      return entry
        ? c.map((x) =>
            x.product.id === p.id ? { ...x, quantity: x.quantity + 1 } : x,
          )
        : [...c, { product: p, quantity: 1 }];
    });
  };
  const startScan = async () => {
    setError("");
    if (Platform.OS === "web") {
      setNotice(
        "Usa un lettore barcode nel campo Cerca, oppure digita il codice.",
      );
      return;
    }
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) {
      setError(
        "Abilita la fotocamera nelle impostazioni oppure digita il barcode.",
      );
      return;
    }
    scanLock.current = false;
    setScanning(true);
  };
  const formOpen =
    !!form || !!stock || checkout || !!returning || csv !== null || scanning;
  const cancelForm = () => {
    setForm(null);
    setStock(null);
    setCheckout(false);
    setReturning(null);
    setCsv(null);
    setImportRows(null);
    setScanning(false);
    setError("");
  };
  return (<NativePremiumScope.Provider value={premiumNative}>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      visible
      transparent
      animationType="none"
      onRequestClose={() => {
        if (!busy) {
          if (formOpen) cancelForm();
          else onClose();
        }
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CreationSheet
          premiumWeb
          title={title}
          icon="bag-handle-outline"
          iconTone={shopSectionTone("orders")}
          dismissDisabled={busy}
          onClose={() => {
            if (!busy) {
              if (formOpen) cancelForm();
              else onClose();
            }
          }}
          animatePresentation
          keepFocusedFieldVisible
        >
          <ShopSectionToneContext.Provider value={shopSectionTone(mode,premiumPalette.night)}>
          <View style={s.stack}>
            {error ? (
              <View style={s.error}>
                <Text accessibilityRole="alert" style={{ color: "#A32B37" }}>
                  {error}
                </Text>
                {button(
                  "Ricarica dati",
                  () =>
                    void refresh()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message)),
                )}
              </View>
            ) : null}
            {notice ? (
              <Text accessibilityLiveRegion="polite" style={s.notice}>
                {notice}
              </Text>
            ) : null}
            {busy ? <ActivityIndicator color="#285B78" /> : null}
            {!data && !error ? <ActivityIndicator color="#285B78" /> : null}
            {scanning ? (
              <>
                <Text style={s.title}>Inquadra il barcode</Text>
                <CameraView
                  style={{ height: 300, borderRadius: 18 }}
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                      "code39",
                    ],
                  }}
                  onBarcodeScanned={(e) => {
                    if (scanLock.current) return;
                    scanLock.current = true;
                    setSearch(e.data);
                    setMode("products");
                    setScanning(false);
                  }}
                />
                {button("Inserisci codice a mano", () => {
                  setScanning(false);
                  setMode("products");
                })}
              </>
            ) : null}
            {form ? (
              <>
                <Text style={s.title}>
                  {form.product ? "Modifica prodotto" : "Nuovo prodotto"}
                </Text>
                <Text style={s.copy}>
                  Un articolo per ogni formato o tonalità. Le scorte si caricano
                  dopo il salvataggio.
                </Text>
                <View style={s.formPanel}>
                <PremiumSectionHeading tone={1} style={[s.kicker,{fontSize:14,fontWeight:'500',letterSpacing:0}]}>Identità del prodotto</PremiumSectionHeading>
                {field("Nome prodotto", form.data.name, (v) =>
                  setForm({ ...form, data: { ...form.data, name: v } }),
                )}
                <View style={s.wrap}>
                  <View style={s.column}>
                    {field("Marca", form.data.brand, (v) =>
                      setForm({ ...form, data: { ...form.data, brand: v } }),
                    )}
                  </View>
                  <View style={s.column}>
                    {field("Variante / formato", form.data.variant, (v) =>
                      setForm({ ...form, data: { ...form.data, variant: v } }),
                    )}
                  </View>
                </View>
                {field("Categoria", form.data.category, (v) =>
                  setForm({ ...form, data: { ...form.data, category: v } }),
                )}
                </View>
                <View style={s.formPanel}>
                <PremiumSectionHeading tone={2} style={[s.kicker,{fontSize:14,fontWeight:'500',letterSpacing:0}]}>Utilizzo e prezzi</PremiumSectionHeading>
                <Text style={s.label}>Dove lo utilizzi?</Text>
                {choices(
                  [
                    ["retail", "Vendita"],
                    ["professional", "Uso salone"],
                    ["both", "Entrambi"],
                  ],
                  form.data.purpose,
                  (v) =>
                    setForm({ ...form, data: { ...form.data, purpose: v } }),
                )}
                <View style={s.wrap}>
                  <View style={s.column}>
                    {field(
                      "Prezzo di vendita €",
                      form.price,
                      (v) => setForm({ ...form, price: v }),
                      true,
                    )}
                  </View>
                  <View style={s.column}>
                    {field(
                      "Costo per confezione €",
                      form.cost,
                      (v) => setForm({ ...form, cost: v }),
                      true,
                    )}
                  </View>
                </View>
                </View>
                {button(
                  advanced
                    ? "Nascondi dettagli"
                    : "Formato, scorte minime, codici e fornitore",
                  () => setAdvanced((v) => !v),
                )}
                {advanced ? (
                  <View style={s.formPanel}>
                    <PremiumSectionHeading tone={0} style={[s.kicker,{fontSize:14,fontWeight:'500',letterSpacing:0}]}>Dettagli di magazzino</PremiumSectionHeading>
                    <Text style={s.label}>Unità di consumo professionale</Text>
                    {choices(
                      [
                        ["piece", "Pezzi"],
                        ["ml", "Millilitri"],
                        ["g", "Grammi"],
                      ],
                      form.data.unit,
                      (v) =>
                        setForm({ ...form, data: { ...form.data, unit: v } }),
                    )}
                    {field(
                      "Contenuto di una confezione",
                      form.pack,
                      (v) => setForm({ ...form, pack: v }),
                      true,
                    )}
                    <Text style={s.copy}>
                      La vendita scarica confezioni intere. Il trasferimento al
                      salone converte una confezione in questa quantità.
                    </Text>
                    <View style={s.wrap}>
                      <View style={s.column}>
                        {field(
                          "Scorta minima vendita · confezioni",
                          form.minimum,
                          (v) => setForm({ ...form, minimum: v }),
                          true,
                        )}
                      </View>
                      <View style={s.column}>
                        {field(
                          "Scorta minima uso salone",
                          form.professionalMinimum,
                          (v) => setForm({ ...form, professionalMinimum: v }),
                          true,
                        )}
                      </View>
                    </View>
                    {field(
                      "Codice interno · automatico se vuoto",
                      form.data.sku,
                      (v) =>
                        setForm({ ...form, data: { ...form.data, sku: v } }),
                    )}
                    {field("Barcode", form.data.barcode, (v) =>
                      setForm({ ...form, data: { ...form.data, barcode: v } }),
                    )}
                    {field("Fornitore · nota libera", form.data.supplier, (v) =>
                      setForm({ ...form, data: { ...form.data, supplier: v } }),
                    )}
                    {field(
                      "URL immagine https · facoltativo",
                      form.data.image_url,
                      (v) =>
                        setForm({
                          ...form,
                          data: { ...form.data, image_url: v },
                        }),
                    )}
                  </View>
                ) : null}
                {form.data.purpose !== "professional" && (
                  <View style={s.between}>
                    <Text style={s.copy}>Pubblica nello shop cliente</Text>
                    <Switch
                      value={form.data.published}
                      disabled={busy}
                      onValueChange={(published) =>
                        setForm({ ...form, data: { ...form.data, published } })
                      }
                    />
                  </View>
                )}
                {form.product ? (
                  <View style={s.between}>
                    <Text style={s.copy}>Archiviato · storico conservato</Text>
                    <Switch
                      value={form.data.archived}
                      disabled={busy}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          data: { ...form.data, archived: v },
                        })
                      }
                    />
                  </View>
                ) : null}
                {button("Salva prodotto", saveProduct, true)}
                {button("Annulla", cancelForm)}
              </>
            ) : null}
            {stock ? (
              <>
                <Text style={s.title}>{stock.name}</Text>
                <Text style={s.copy}>
                  Vendita: {stock.retail_qty} confezioni · Salone:{" "}
                  {stock.professional_qty}{" "}
                  {stock.unit === "piece" ? "pezzi" : stock.unit}
                </Text>
                {choices(
                  (stock.purpose === "both"
                    ? [
                        ["retail", "Vendita"],
                        ["professional", "Uso salone"],
                      ]
                    : stock.purpose === "retail"
                      ? [["retail", "Vendita"]]
                      : [["professional", "Uso salone"]]) as [
                    "retail" | "professional",
                    string,
                  ][],
                  bucket,
                  (v) => {
                    setBucket(v);
                    setAction("receive");
                  },
                )}
                {choices(
                  [
                    ["receive", "Carico"],
                    ["consume", "Consumo / scarto"],
                    ["count", "Conteggio"],
                    ...(stock.purpose === "both" && bucket === "retail"
                      ? [["transfer", "Apri per uso salone"] as const]
                      : []),
                  ] as const,
                  action,
                  setAction,
                )}
                {field(
                  action === "count" ? "Quantità contata adesso" : "Quantità",
                  quantity,
                  setQuantity,
                  true,
                )}
                {field("Causale / riferimento documento", reason, setReason)}
                <Text style={s.copy}>
                  {action === "count"
                    ? "Il conteggio viene rifiutato se nel frattempo le scorte sono cambiate."
                    : action === "transfer"
                      ? `Ogni confezione spostata aggiunge ${stock.pack_size} ${stock.unit} alle scorte professionali.`
                      : "Il movimento resta nello storico con data e operatore."}
                </Text>
                {button(
                  "Conferma movimento",
                  () => {
                    const q = shopNumber(quantity);
                    if (
                      !quantity.trim() ||
                      !Number.isFinite(q) ||
                      q < 0 ||
                      reason.trim().length < 3
                    ) {
                      setError(
                        "Inserisci quantità e una causale di almeno 3 caratteri.",
                      );
                      return;
                    }
                    void mutate(
                      "shop_adjust_stock",
                      {
                        p_product: stock.id,
                        p_bucket: bucket,
                        p_action: action,
                        p_quantity: q,
                        p_reason: reason,
                        p_stock_revision: stock.stock_revision,
                      },
                      () => setStock(null),
                      "Scorte aggiornate.",
                      true,
                    );
                  },
                  true,
                )}
                {button("Annulla", cancelForm)}
              </>
            ) : null}
            {checkout ? (
              <>
                <Text style={s.title}>Riepilogo vendita</Text>
                <Text style={s.copy}>
                  Registra un pagamento già ricevuto in salone. Questo pulsante
                  non addebita una carta e non emette un documento fiscale.
                </Text>
                {cart.map((c) => (
                  <View key={c.product.id} style={s.card}>
                    <Text style={s.title}>
                      {c.product.name} {c.product.variant}
                    </Text>
                    <Text style={s.copy}>
                      {shopMoney(c.product.price_cents)} × {c.quantity}
                    </Text>
                    <View style={s.wrap}>
                      {button("−", () =>
                        setCart((items) =>
                          items.flatMap((x) =>
                            x.product.id !== c.product.id
                              ? [x]
                              : x.quantity > 1
                                ? [{ ...x, quantity: x.quantity - 1 }]
                                : [],
                          ),
                        ),
                      )}
                      {button("+", () => add(c.product))}
                    </View>
                  </View>
                ))}
                <Text style={s.total}>
                  {shopMoney(
                    cart.reduce(
                      (sum, c) => sum + c.quantity * c.product.price_cents,
                      0,
                    ),
                  )}
                </Text>
                {customer ? (
                  <View style={s.card}>
                    <Text style={s.label}>Cliente: {customer.full_name}</Text>
                    {button("Rimuovi associazione", () => setCustomer(null))}
                  </View>
                ) : (
                  <>
                    <Text style={s.copy}>
                      Cliente facoltativo · senza selezione la vendita resta
                      anonima.
                    </Text>
                    {field(
                      "Associa cliente · cerca per nome",
                      customerQuery,
                      setCustomerQuery,
                    )}
                    {customerMatches.map((c) => (
                      <View key={c.id}>
                        {button(c.full_name, () => {
                          setCustomer(c);
                          setCustomerQuery("");
                        })}
                      </View>
                    ))}
                  </>
                )}
                {choices(
                  [
                    ["cash", "Contanti"],
                    ["card", "POS già incassato"],
                    ["bank_transfer", "Bonifico ricevuto"],
                  ],
                  method,
                  setMethod,
                )}
                {button(
                  "Conferma pagamento ricevuto",
                  () =>
                    void mutate(
                      "shop_checkout",
                      {
                        p_customer: customer?.id || null,
                        p_method: method,
                        p_lines: cart.map((c) => ({
                          id: c.product.id,
                          quantity: c.quantity,
                          revision: c.product.revision,
                        })),
                      },
                      () => {
                        setCart([]);
                        setCustomer(null);
                        setCustomerQuery("");
                        setCheckout(false);
                        setMode("sales");
                      },
                      "Vendita registrata in Cassa. Scorte aggiornate.",
                      true,
                    ),
                  true,
                  !cart.length,
                )}
                {button("Aggiorna prezzi e disponibilità", () => {
                  void supabase
                    .from("shop_products")
                    .select("*")
                    .eq("workspace_id", workspaceId)
                    .in(
                      "id",
                      cart.map((c) => c.product.id),
                    )
                    .then((r) => {
                      if (r.error) {
                        setError("Aggiornamento carrello non disponibile.");
                        return;
                      }
                      const products = r.data as ShopProduct[];
                      if (products.length !== cart.length) {
                        setError(
                          "Un prodotto non è più disponibile. Rimuovilo dal carrello.",
                        );
                        return;
                      }
                      setCart((current) =>
                        current.map((c) => ({
                          ...c,
                          product: products.find((p) => p.id === c.product.id)!,
                        })),
                      );
                      setNotice(
                        "Prezzi aggiornati: verifica il totale prima di confermare.",
                      );
                    });
                })}
                {button("Torna ai prodotti", () => {
                  setCheckout(false);
                  setMode("products");
                })}
              </>
            ) : null}
            {returning ? (
              <>
                <Text style={s.title}>Registra reso</Text>
                <Text style={s.copy}>
                  {
                    returning.sale.lines.find(
                      (l) => l.product_id === returning.product,
                    )?.name
                  }
                </Text>
                {field("Quantità restituita", quantity, setQuantity, true)}
                {field("Motivo del reso", reason, setReason)}
                <View style={s.between}>
                  <Text style={[s.copy, { flex: 1 }]}>
                    Prodotto integro e nuovamente vendibile
                  </Text>
                  <Switch
                    disabled={busy}
                    value={restock}
                    onValueChange={setRestock}
                  />
                </View>
                <Text style={s.copy}>
                  Il rimborso tiene conto del pagamento originale, degli sconti
                  e del credito usato. La gift card viene ripristinata
                  automaticamente; i punti tornano disponibili soltanto al reso
                  completo.
                </Text>
                {returnQuote && (
                  <View style={s.card}>
                    <Text style={s.label}>
                      Da rimborsare: {shopMoney(returnQuote.cash_cents)}
                    </Text>
                    <Text style={s.copy}>
                      Da ripristinare sulla gift card:{" "}
                      {shopMoney(returnQuote.gift_cents)}
                    </Text>
                  </View>
                )}
                {button(
                  returnQuote
                    ? "Conferma rimborso effettuato"
                    : "Calcola rimborso",
                  () => {
                    const q = shopNumber(quantity);
                    if (
                      !Number.isInteger(q) ||
                      q <= 0 ||
                      reason.trim().length < 3
                    ) {
                      setError("Controlla quantità e motivo.");
                      return;
                    }
                    if (!returnQuote) {
                      void mutate(
                        "shop_return_quote",
                        {
                          p_sale: returning.sale.id,
                          p_product: returning.product,
                          p_quantity: q,
                        },
                        (result) => setReturnQuote(result),
                        "Riepilogo del rimborso aggiornato.",
                      );
                      return;
                    }
                    void mutate(
                      "shop_return",
                      {
                        p_sale: returning.sale.id,
                        p_product: returning.product,
                        p_quantity: q,
                        p_quote: returnQuote,
                        p_restock: restock,
                        p_reason: reason,
                      },
                      () => setReturning(null),
                      "Reso registrato. Storico e scorte aggiornati.",
                      true,
                    );
                  },
                  true,
                )}
                {button("Annulla", cancelForm)}
              </>
            ) : null}
            {csv !== null ? (
              <>
                <Text style={s.title}>Importa catalogo CSV</Text>
                <Text style={s.copy}>
                  Incolla fino a 200 prodotti da vendere. L’importazione crea
                  nuovi articoli e non modifica le scorte; codici già presenti
                  vengono rifiutati.
                </Text>
                <Text selectable style={s.code}>
                  nome;marca;variante;prezzo;costo;sku;barcode;categoria;fornitore;scorta_minima
                  {"\n"}Shampoo;Marca;250
                  ml;20;8;SH250;0123456789012;Capelli;Fornitore;2
                </Text>
                {field(
                  "Contenuto CSV",
                  csv,
                  (v) => {
                    setCsv(v);
                    setImportRows(null);
                  },
                  false,
                  true,
                )}
                {button("Controlla anteprima", () => {
                  try {
                    setImportRows(parseShopCsv(csv));
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })}
                {importRows ? (
                  <>
                    <Text style={s.label}>
                      {importRows.length} prodotti da importare
                    </Text>
                    {importRows.slice(0, 10).map((r, i) => (
                      <Text key={i} style={s.copy}>
                        {r.name} · {r.variant} · {shopMoney(r.price_cents)}
                      </Text>
                    ))}
                    {importRows.length > 10 ? (
                      <Text style={s.copy}>
                        …e altri {importRows.length - 10} prodotti.
                      </Text>
                    ) : null}
                    {button(
                      "Importa prodotti",
                      () =>
                        void mutate(
                          "shop_import_products",
                          { p_rows: importRows },
                          () => {
                            setCsv(null);
                            setImportRows(null);
                            setMode("products");
                          },
                          "Catalogo importato.",
                          true,
                        ),
                      true,
                    )}
                  </>
                ) : null}
                {button("Annulla", cancelForm)}
              </>
            ) : null}
            {!formOpen && data ? (
              <>
                <View
                  style={[
                    s.hero,
                    mode !== "overview" && {
                      paddingVertical: 10,
                    },
                  ]}
                >
                  {mode === "overview" && (
                    <>
                      <View style={s.between}>
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text style={s.kicker}>
                            IL TUO NEGOZIO, SOTTO CONTROLLO
                          </Text>
                          <Text style={s.title}>Prodotti e scorte</Text>
                        </View>
                        <Ionicons
                          name="cube-outline"
                          size={30}
                          color="#285B78"
                        />
                      </View>
                      <Text style={s.copy}>
                        Vendite in salone, consumi e movimenti in un unico
                        posto.
                      </Text>
                    </>
                  )}
                  <View style={s.between}>
                    <Text style={s.label}>
                      {data.settings.enabled
                        ? "Modulo attivo"
                        : "Modulo disattivato"}
                    </Text>
                    <Switch
                      accessibilityLabel="Attiva Shop e magazzino"
                      disabled={busy}
                      value={data.settings.enabled}
                      onValueChange={(v) =>
                        void mutate(
                          "shop_set_enabled",
                          { p_enabled: v, p_revision: data.settings.revision },
                          () => {},
                          v
                            ? "Shop e magazzino attivato."
                            : "Nuove operazioni sospese. Storico e resi restano disponibili.",
                        )
                      }
                    />
                  </View>
                </View>
                <ShopNavigation<Mode>
                  badges={{orders:(orderAttention?.orders_pending ?? 0)+(orderAttention?.orders_ready ?? 0),supply:orderAttention?.purchases_pending ?? 0,control:(orderAttention?.pending ?? 0)+(orderAttention?.expiring ?? 0)}}
                  items={[
                    ["overview", "Panoramica", "grid-outline"],
                    ["products", "Prodotti", "pricetag-outline"],
                    ["stock", "Movimenti", "swap-horizontal-outline"],
                    ["sales", "Vendite", "receipt-outline"],
                    ["orders", "Shop e ritiri", "bag-handle-outline"],
                    ["supply", "Acquisti e fornitori", "business-outline"],
                    ["control", "Controllo magazzino", "cube-outline"],
                  ]}
                  value={mode}
                  disabled={busy}
                  onChange={(v) => {
                    setMode(v);
                    setHistoryPage(0);
                    setNotice("");
                    setError("");
                  }}
                />
                {mode === "orders" ? (
                  <ShopOrdersConsole
                    workspaceId={workspaceId}
                    onBusy={setBusy}
                  />
                ) : null}
                {mode === "supply" ? (
                  <ShopSupplyConsole
                    workspaceId={workspaceId}
                    salonName={salonWorkspace.salonName}
                    enabled={data.settings.enabled}
                    onBusy={setBusy}
                  />
                ) : null}
                {mode === "control" ? (
                  <ShopStockControl
                    workspaceId={workspaceId}
                    onBusy={setBusy}
                  />
                ) : null}
                {mode === "overview" ? (
                  <>
                    <View style={s.wrap}>
                      {[
                        [data.summary.products, "Prodotti attivi"],
                        [data.summary.low, "Da controllare"],
                      ].map(([value, label]) => (
                        <View key={label} style={[s.card, s.column]}>
                          <Text style={s.total}>{value}</Text>
                          <Text style={s.copy}>{label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={s.card}>
                      <Text style={s.label}>Costo delle scorte da vendere</Text>
                      <Text style={s.total}>
                        {shopMoney(data.summary.retail_cost_cents)}
                      </Text>
                      <Text style={s.copy}>
                        Stima al costo attuale del catalogo. Non è una
                        valorizzazione fiscale del magazzino.
                      </Text>
                    </View>
                    <View style={s.quickGrid}>
                      {([
                        ["products", "pricetag-outline", "Catalogo", "Prodotti, prezzi e disponibilità"],
                        ["orders", "bag-handle-outline", "Shop e ritiri", "Prepara gli ordini dei clienti"],
                        ["supply", "business-outline", "Acquisti", "Fornitori, riordini e consegne"],
                        ["control", "cube-outline", "Magazzino", "Inventario, consumi e scadenze"],
                      ] as const).map(([destination, icon, label, description]) => (
                        <HapticTouchable key={destination} accessibilityRole="button"
                          accessibilityLabel={`${label}${shopSectionHasAttention(orderAttention, destination) ? ", attività da gestire" : ""}`} onPress={() => setMode(destination)} style={s.quickCard}>
                          <View style={[s.quickIcon,{backgroundColor:shopSectionTone(destination).soft}]}><Ionicons name={icon} size={22} color={shopSectionTone(destination).ink} /><ShopAttentionDot active={shopSectionHasAttention(orderAttention, destination)}/></View>
                          <Text style={s.label}>{label}</Text>
                          <Text style={s.meta}>{description}</Text>
                          {destination === "orders" ? <ShopOrderAttention value={orderAttention}/> : null}
                          <Ionicons name="arrow-forward" size={18} color="#285B78" />
                        </HapticTouchable>
                      ))}
                    </View>
                    {button(
                      data.summary.products
                        ? "Nuovo prodotto"
                        : "Aggiungi il primo prodotto",
                      () => edit(null),
                      true,
                      !data.settings.enabled,
                    )}
                    {button(
                      "Importa da CSV",
                      () => setCsv(""),
                      false,
                      !data.settings.enabled,
                    )}
                    {button("Cerca o scansiona un prodotto", () =>
                      setMode("products"),
                    )}
                    <Text style={s.copy}>
                      Per mostrare i prodotti ai clienti, pubblicali dalla loro
                      scheda e attiva la vetrina in Shop e ritiri.
                    </Text>
                  </>
                ) : null}
                {mode === "products" ? (
                  <>
                    {field(
                      "Cerca nome, marca, codice o barcode",
                      search,
                      setSearch,
                    )}
                    <View style={{gap:12}}>
                      <View style={{alignItems:'stretch'}}>{button('Nuovo prodotto',()=>edit(null),true,!data.settings.enabled)}</View>
                      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{button('Scansiona',()=>void startScan())}{button('Importa CSV',()=>setCsv(''),false,!data.settings.enabled)}</View>
                    </View>
                    <View style={s.between}>
                      <Text style={s.copy}>Mostra archivio</Text>
                      <Switch
                        value={archived}
                        onValueChange={(v) => {
                          setArchived(v);
                          setPage(0);
                        }}
                      />
                    </View>
                    {cart.length
                      ? button(
                          `Apri carrello · ${cart.reduce((n, c) => n + c.quantity, 0)} prodotti`,
                          () => setCheckout(true),
                          true,
                          !data.settings.enabled,
                        )
                      : null}
                    {!data.products.length ? (
                      <View style={s.card}>
                        <Text style={s.title}>Nessun prodotto trovato</Text>
                        <Text style={s.copy}>
                          Aggiungi un articolo oppure modifica la ricerca.
                        </Text>
                      </View>
                    ) : null}
                    {data.products.map((p) => (
                      <View key={p.id} style={s.card}>
                        <View style={s.between}>
                          {p.image_url.startsWith("https://") ? (
                            <Image
                              source={{ uri: p.image_url }}
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 12,
                              }}
                              resizeMode="contain"
                            />
                          ) : null}
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={s.title}>{p.name}</Text>
                            <Text style={s.copy}>
                              {[p.brand, p.variant]
                                .filter(Boolean)
                                .join(" · ") || p.sku}
                            </Text>
                          </View>
                          <Text style={s.price}>
                            {shopMoney(p.price_cents)}
                          </Text>
                        </View>
                        <View style={s.wrap}>
                          {p.purpose !== "professional" ? (
                            <Text
                              style={[
                                s.badge,
                                p.retail_qty <= p.minimum_retail && s.low,
                              ]}
                            >
                              Disponibili:{" "}
                              {p.retail_qty - (p.reserved_qty || 0)} ·
                              Riservati: {p.reserved_qty || 0}
                            </Text>
                          ) : null}
                          {p.purpose !== "retail" ? (
                            <Text
                              style={[
                                s.badge,
                                p.professional_qty <= p.minimum_professional &&
                                  s.low,
                              ]}
                            >
                              Salone: {p.professional_qty}{" "}
                              {p.unit === "piece" ? "pezzi" : p.unit}
                            </Text>
                          ) : null}
                        </View>
                        <View style={s.wrap}>
                          {button(
                            "Modifica",
                            () => edit(p),
                            false,
                            !data.settings.enabled,
                          )}
                          {button(
                            "Scorte",
                            () => stockOpen(p),
                            false,
                            p.archived || !data.settings.enabled,
                          )}
                          {p.purpose !== "professional"
                            ? button(
                                "Aggiungi alla vendita",
                                () => add(p),
                                true,
                                p.archived ||
                                  p.retail_qty - (p.reserved_qty || 0) <= 0 ||
                                  !data.settings.enabled,
                              )
                            : null}
                        </View>
                      </View>
                    ))}
                    <View style={s.between}>
                      {button(
                        "Precedenti",
                        () => setPage((p) => p - 1),
                        false,
                        page === 0,
                      )}
                      <Text style={s.copy}>
                        {page + 1} / {Math.max(1, Math.ceil(data.count / 30))}
                      </Text>
                      {button(
                        "Successivi",
                        () => setPage((p) => p + 1),
                        false,
                        (page + 1) * 30 >= data.count,
                      )}
                    </View>
                  </>
                ) : null}
                {mode === "stock" ? (
                  <>
                    <Text style={s.title}>Storico movimenti</Text>
                    <Text style={s.copy}>
                      Carichi, consumi, trasferimenti, vendite e resi. Ogni
                      rettifica lascia una traccia.
                    </Text>
                    {!data.movements.length ? (
                      <Text style={s.copy}>Nessun movimento registrato.</Text>
                    ) : null}
                    {data.movements.map((m) => (
                      <View key={m.id} style={s.card}>
                        <View style={s.between}>
                          <Text style={[s.title, { flex: 1 }]}>{m.name}</Text>
                          <Text style={s.price}>
                            {m.delta > 0 ? "+" : ""}
                            {m.delta}
                          </Text>
                        </View>
                        <Text style={s.copy}>
                          {m.bucket === "retail"
                            ? "Vendita · confezioni"
                            : `Salone · ${m.unit}`}{" "}
                          · {m.reason}
                        </Text>
                        <Text style={s.meta}>
                          {new Date(m.created_at).toLocaleString("it-IT")}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}
                {mode === "sales" ? (
                  <>
                    <Text style={s.title}>Storico vendite</Text>
                    <Text style={s.copy}>
                      Importi originali e resi restano consultabili. Vendite e
                      rimborsi sono registrati in Cassa alla loro data.
                    </Text>
                    {!data.sales.length ? (
                      <Text style={s.copy}>Nessuna vendita registrata.</Text>
                    ) : null}
                    {data.sales.map((sale) => (
                      <View key={sale.id} style={s.card}>
                        <Text style={s.title}>
                          {shopMoney(sale.total_cents - sale.refunded_cents)} ·
                          netto
                        </Text>
                        <Text style={s.copy}>
                          {sale.customer_name ||
                            "Vendita senza cliente associato"}
                        </Text>
                        <Text style={s.meta}>
                          {new Date(sale.created_at).toLocaleString("it-IT")} ·{" "}
                          {sale.payment_method === "cash"
                            ? "Contanti"
                            : sale.payment_method === "card"
                              ? "POS"
                              : "Bonifico"}
                        </Text>
                        {sale.refunded_cents > 0 ? (
                          <Text style={s.copy}>
                            Originale {shopMoney(sale.total_cents)} · rimborsato{" "}
                            {shopMoney(sale.refunded_cents)}
                          </Text>
                        ) : null}
                        {sale.lines.map((l) => (
                          <View key={l.product_id} style={{ gap: 6 }}>
                            <Text style={s.copy}>
                              {l.name} × {l.quantity} ·{" "}
                              {shopMoney(l.unit_price_cents)}
                            </Text>
                            {button(
                              l.returned >= l.quantity
                                ? "Restituito"
                                : "Registra reso",
                              () => {
                                setReturning({ sale, product: l.product_id });
                                setQuantity("1");
                                setReason("");
                                setRestock(true);
                              },
                              false,
                              l.returned >= l.quantity,
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </>
                ) : null}
                {mode === "stock" || mode === "sales" ? (
                  <View style={s.between}>
                    {button(
                      "Precedenti",
                      () => setHistoryPage((p) => p - 1),
                      false,
                      historyPage === 0,
                    )}
                    <Text style={s.copy}>
                      {historyPage + 1} /{" "}
                      {Math.max(
                        1,
                        Math.ceil(
                          (mode === "stock"
                            ? data.movement_count
                            : data.sale_count) / 30,
                        ),
                      )}
                    </Text>
                    {button(
                      "Successivi",
                      () => setHistoryPage((p) => p + 1),
                      false,
                      (historyPage + 1) * 30 >=
                        (mode === "stock"
                          ? data.movement_count
                          : data.sale_count),
                    )}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
          </ShopSectionToneContext.Provider>
        </CreationSheet>
      </GestureHandlerRootView>
    </Modal></NativePremiumScope.Provider>
  );
}
const baseShopStyles = StyleSheet.create({
  stack: { gap: 16 },
  formPanel: { padding: 16, gap: 14, borderRadius: 20, backgroundColor: "#F6F9FB", borderWidth: 1, borderColor: "#E0E9F0" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: { flexGrow: 1, flexBasis: 140, minWidth: 0, padding: 16, gap: 9, borderRadius: 20, borderWidth: 1, borderColor: "#DDE7EE", backgroundColor: "#F7FAFC" },
  quickIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#E8F0F6", alignItems: "center", justifyContent: "center" },
  hero: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#EAF3F9",
    gap: 14,
    borderWidth: 1,
    borderColor: "#D5E4EF",
  },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DFE6EF",
    gap: 12,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
    color: "#20384D",
    flexShrink: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#54758C",
  },
  copy: { fontSize: 14, lineHeight: 21, color: "#627487", flexShrink: 1 },
  label: { fontSize: 14, color: "#314D63", fontWeight: "600" },
  meta: { fontSize: 12, lineHeight: 18, color: "#718094" },
  input: {
    minHeight: 48,
    padding: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD8E5",
    backgroundColor: "#FFF",
    color: "#20384D",
    fontSize: 16,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  between: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  column: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  button: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#EDF3F8",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  primary: { backgroundColor: "#285B78" },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#285B78",
    textAlign: "center",
  },
  chip: { padding: 12, borderRadius: 14, backgroundColor: "#EDF3F8" },
  chipSelected: { backgroundColor: "#285B78" },
  total: { fontSize: 29, fontWeight: "800", color: "#285B78" },
  price: { fontWeight: "800", fontSize: 17, color: "#285B78" },
  badge: {
    fontSize: 12,
    color: "#3E6179",
    padding: 8,
    backgroundColor: "#EDF4F8",
    borderRadius: 10,
    overflow: "hidden",
  },
  low: { color: "#9B5619", backgroundColor: "#FFF2DD" },
  error: { padding: 14, borderRadius: 14, backgroundColor: "#FFF0F1", gap: 8 },
  notice: {
    padding: 12,
    borderRadius: 12,
    color: "#236650",
    backgroundColor: "#EAF8F1",
    lineHeight: 21,
  },
  code: {
    padding: 12,
    backgroundColor: "#EDF3F8",
    fontSize: 12,
    lineHeight: 18,
    color: "#3B5269",
    borderRadius: 12,
  },
});
