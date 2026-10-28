import { ShopSwitch } from './shop-switch';
import { ShopNavigation } from "./shop-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Switch, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useShopRefresh, notifyShopChanged } from "../../src/lib/use-shop-refresh";
import { benefitOperationId } from "../../src/lib/service-packages";
import { shopMoney, shopNumber } from "../../src/lib/shop-inventory";
import { shopUI as s } from "../../src/lib/shop-pickup";
import {
  bucketName,
  quantityUnit,
  romanToday,
  type StockControl,
  type StockProduct,
  type StockLot,
  type ServiceRecipe,
  type Consumption,
} from "../../src/lib/shop-stock-control";
import { purchaseDate } from "../../src/lib/shop-purchasing";
import { ShopButton, ShopField } from "./shop-pickup-ui";
import { NativeDatePickerModal } from "../ui/native-date-picker-modal";

type Mode = "count" | "consumption" | "lots" | "reports";
type Count = {
  product: StockProduct;
  bucket: "retail" | "professional";
  quantity: string;
};
export function ShopStockControl({
  workspaceId,
  onBusy,
}: {
  workspaceId: string;
  onBusy: (value: boolean) => void;
}) {
  const [doseInputs, setDoseInputs] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("count");
  const [data, setData] = useState<StockControl | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [days, setDays] = useState(30),
    [history, setHistory] = useState(false);
  const [counts, setCounts] = useState<Count[]>([]),
    [reason, setReason] = useState("Inventario fisico"),
    [review, setReview] = useState(false);
  const [recipe, setRecipe] = useState<ServiceRecipe | null>(null),
    [picking, setPicking] = useState(false),
    [activity, setActivity] = useState(false);
  const [lot, setLot] = useState<{
    product: StockProduct;
    bucket: "retail" | "professional";
    code: string;
    quantity: string;
    expires: string;
  } | null>(null);
  const [discard, setDiscard] = useState<StockLot | null>(null),
    [discardQty, setDiscardQty] = useState(""),
    [discardReason, setDiscardReason] = useState("");
  const [dismiss, setDismiss] = useState<Consumption | null>(null),
    [dismissReason, setDismissReason] = useState(""),
    [calendar, setCalendar] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const alive = useRef(true),
    locked = useRef(false),
    sequence = useRef(0),
    scanLock = useRef(false),
    operation = useRef({ key: "", id: benefitOperationId() });
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
    const seq = ++sequence.current;
    const r = await supabase.rpc("shop_control_console", {
      p_search: query,
      p_page: page,
      p_days: days,
      p_history: history,
    });
    if (r.error) throw new Error(r.error.message);
    if (alive.current && sequence.current === seq) setData(r.data);
  }, [query, page, days, history]);
  useEffect(() => {
    void refresh().catch((e) => {
      if (alive.current) setError(e.message);
    });
  }, [refresh]);
  useShopRefresh(workspaceId, async () => {
    if (!locked.current) await refresh();
  });
  const mutate = async (
    name: string,
    args: Record<string, unknown>,
    message: string,
    done = () => {},
    idempotent = false,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      let payload = args;
      if (idempotent) {
        const key = JSON.stringify([name, args]);
        if (operation.current.key !== key)
          operation.current = { key, id: benefitOperationId() };
        payload = { ...args, p_operation: operation.current.id };
      }
      const r = await supabase.rpc(name, payload);
      if (r.error) throw new Error(r.error.message);
      notifyShopChanged(workspaceId);
      if (alive.current) {
        done();
        setNotice(message);
        operation.current = { key: "", id: benefitOperationId() };
      }
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const button = (
    title: string,
    onPress: () => void,
    primary = false,
    disabled = false,
  ) => (
    <ShopButton
      title={title}
      onPress={onPress}
      primary={primary}
      disabled={busy || disabled}
    />
  );
  const clearSearch = () => {
    setSearch("");
    setQuery("");
    setPage(0);
  };
  const changeMode = (next: Mode) => {
    setMode(next);
    clearSearch();
    setNotice("");
    setError("");
    setHistory(false);
    setReview(false);
  };
  const scan = async () => {
    if (Platform.OS === "web") {
      setNotice(
        "Clicca nella ricerca e leggi il codice con il lettore barcode, oppure scrivilo.",
      );
      return;
    }
    try {
      const p = permission?.granted ? permission : await requestPermission();
      if (p.granted) {
        scanLock.current = false;
        setScanning(true);
      } else
        setError(
          "Fotocamera non autorizzata. Puoi inserire il codice nella ricerca.",
        );
    } catch {
      setError(
        "Fotocamera non disponibile. Inserisci il codice nella ricerca.",
      );
    }
  };
  const pager = (total: number) => (
    <View style={s.row}>
      {button("Precedenti", () => setPage((v) => v - 1), false, page === 0)}
      <Text style={s.copy}>
        {page + 1} / {Math.max(1, Math.ceil(total / 20))}
      </Text>
      {button(
        "Successivi",
        () => setPage((v) => v + 1),
        false,
        (page + 1) * 20 >= total,
      )}
    </View>
  );
  const searchBox = (label = "Cerca nome, marca o barcode") => (
    <View style={{ gap: 10 }}>
      <ShopField
        label={label}
        value={search}
        onChange={setSearch}
        disabled={busy}
      />
      {(mode === "count" || mode === "lots" || picking) &&
        button("Leggi barcode", () => void scan())}
    </View>
  );
  const status = (
    <>
      {busy && <ActivityIndicator color="#285B78" />}
      {!!error && (
        <View style={s.card}>
          <Text accessibilityRole="alert" style={s.error}>
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
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.copy}>
          {notice}
        </Text>
      )}
    </>
  );
  if (!data)
    return (
      <View style={s.stack}>
        {status}
        {!error && <ActivityIndicator color="#285B78" />}
      </View>
    );
  const enabled = data.settings.enabled;
  if (scanning)
    return (
      <View style={s.stack}>
        <Text style={s.title}>Inquadra il codice prodotto</Text>
        <CameraView
          style={{ height: 280, borderRadius: 18 }}
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
            setScanning(false);
          }}
        />
        {button("Torna alla ricerca", () => setScanning(false))}
      </View>
    );
  if (lot)
    return (
      <View style={s.stack}>
        {status}
        <Text style={s.title}>Identifica il lotto</Text>
        <Text style={s.copy}>
          {lot.product.name} · {bucketName(lot.bucket)}
        </Text>
        <View style={s.card}>
          <Text style={s.label}>Merce già presente in magazzino</Text>
          <Text style={s.copy}>
            Questa operazione assegna lotto e scadenza alle scorte esistenti.
            Non carica altre confezioni. Dopo una consegna, registra prima la
            merce ricevuta.
          </Text>
          <Text style={s.label}>
            Senza lotto:{" "}
            {lot.bucket === "retail"
              ? lot.product.retail_qty - lot.product.retail_assigned
              : lot.product.professional_qty -
                lot.product.professional_assigned}{" "}
            {quantityUnit(lot.bucket, lot.product.unit)}
          </Text>
        </View>
        <ShopField
          label="Codice lotto sulla confezione"
          value={lot.code}
          onChange={(code) => setLot({ ...lot, code })}
          disabled={busy}
        />
        <ShopField
          label={`Quantità · ${quantityUnit(lot.bucket, lot.product.unit)}`}
          value={lot.quantity}
          onChange={(quantity) => setLot({ ...lot, quantity })}
          numeric
          disabled={busy}
        />
        {button(
          lot.expires
            ? `Scadenza · ${purchaseDate(lot.expires)}`
            : "Scegli la scadenza",
          () => setCalendar(true),
        )}
        <Text style={s.copy}>
          Alla vendita o al consumo, il sistema utilizza prima i lotti con la
          scadenza più vicina. Ritira fisicamente la merce seguendo lo stesso
          ordine.
        </Text>
        {button(
          "Associa lotto alle scorte",
          () =>
            void mutate(
              "shop_register_lot",
              {
                p_product: lot.product.id,
                p_bucket: lot.bucket,
                p_code: lot.code,
                p_expires: lot.expires,
                p_quantity: shopNumber(lot.quantity),
                p_stock_revision: lot.product.stock_revision,
              },
              "Lotto registrato.",
              () => setLot(null),
              true,
            ),
          true,
          !enabled ||
            !lot.code.trim() ||
            !lot.expires ||
            !Number.isFinite(shopNumber(lot.quantity)) ||
            shopNumber(lot.quantity) <= 0,
        )}
        {button("Annulla", () => setLot(null))}
        {calendar && (
          <NativeDatePickerModal
            visible
            title="Scadenza del lotto"
            initialValue={lot.expires || undefined}
            onClose={() => setCalendar(false)}
            onConfirm={(expires) => {
              setLot({ ...lot, expires });
              setCalendar(false);
            }}
          />
        )}
      </View>
    );
  if (discard)
    return (
      <View style={s.stack}>
        {status}
        <Text style={s.title}>Scarta merce dal lotto</Text>
        <Text style={s.copy}>
          {discard.name} · {discard.code} · {purchaseDate(discard.expires_on)}
        </Text>
        <Text style={s.copy}>
          La quantità verrà sottratta dal lotto e dal magazzino. Lo scarto
          rimane nello storico.
        </Text>
        <ShopField
          label={`Quantità da scartare · massimo ${discard.quantity} ${quantityUnit(discard.bucket, discard.unit)}`}
          numeric
          value={discardQty}
          onChange={setDiscardQty}
          disabled={busy}
        />
        <ShopField
          label="Motivo dello scarto"
          value={discardReason}
          onChange={setDiscardReason}
          disabled={busy}
        />
        {button(
          "Conferma scarto e aggiorna scorte",
          () =>
            void mutate(
              "shop_discard_lot",
              {
                p_lot: discard.id,
                p_revision: discard.revision,
                p_quantity: shopNumber(discardQty),
                p_reason: discardReason,
              },
              "Scarto registrato.",
              () => setDiscard(null),
              true,
            ),
          true,
          !enabled ||
            discardReason.trim().length < 3 ||
            !Number.isFinite(shopNumber(discardQty)) ||
            shopNumber(discardQty) <= 0 ||
            shopNumber(discardQty) > discard.quantity,
        )}
        {button("Annulla", () => setDiscard(null))}
      </View>
    );
  if (dismiss)
    return (
      <View style={s.stack}>
        {status}
        <Text style={s.title}>Chiudi il consumo da verificare</Text>
        <Text style={s.copy}>
          {dismiss.service_name} · {purchaseDate(dismiss.appointment_date)}
        </Text>
        <Text style={s.copy}>
          Usa questa opzione se il consumo è già stato registrato manualmente o
          non è avvenuto. Non modifica le scorte.
        </Text>
        <ShopField
          label="Motivazione"
          value={dismissReason}
          onChange={setDismissReason}
          disabled={busy}
        />
        {button(
          "Archivia con motivazione",
          () =>
            void mutate(
              "shop_resolve_consumption",
              {
                p_id: dismiss.id,
                p_revision: dismiss.revision,
                p_action: "dismiss",
                p_reason: dismissReason,
              },
              "Verifica archiviata.",
              () => setDismiss(null),
            ),
          true,
          dismissReason.trim().length < 3,
        )}
        {button("Indietro", () => setDismiss(null))}
      </View>
    );
  if (recipe)
    return (
      <View style={s.stack}>
        {status}
        <Text style={s.title}>Prodotti usati per il servizio</Text>
        <Text style={s.label}>{recipe.name}</Text>
        <Text style={s.copy}>
          Imposta la dose per una prestazione. Verrà scaricata dalla scorta a
          uso interno quando segni il servizio come completato, se l’automatismo
          è attivo.
        </Text>
        {recipe.lines.map((l, i) => (
          <View style={s.card} key={l.product_id}>
            <Text style={s.label}>{l.name}</Text>
            <ShopField
              label={`Dose per servizio · ${quantityUnit("professional", l.unit)}`}
              value={doseInputs[l.product_id] ?? String(l.quantity)}
              onChange={(v) => {
                setDoseInputs((previous) => ({
                  ...previous,
                  [l.product_id]: v,
                }));
                setRecipe({
                  ...recipe,
                  lines: recipe.lines.map((x, j) =>
                    j === i ? { ...x, quantity: shopNumber(v) } : x,
                  ),
                });
              }}
              numeric
              disabled={busy}
            />
            {button("Rimuovi dalla ricetta", () =>
              setRecipe({
                ...recipe,
                lines: recipe.lines.filter(
                  (x) => x.product_id !== l.product_id,
                ),
              }),
            )}
          </View>
        ))}
        {button(
          picking
            ? "Chiudi elenco prodotti"
            : "Aggiungi prodotto a uso interno",
          () => {
            setPicking(!picking);
            clearSearch();
          },
        )}
        {picking && (
          <>
            {searchBox()}
            <Text style={s.copy}>
              Sono selezionabili i prodotti destinati all’uso interno.
            </Text>
            {data.products
              .filter(
                (p) =>
                  p.purpose !== "retail" &&
                  !recipe.lines.some((l) => l.product_id === p.id),
              )
              .map((p) => (
                <View key={p.id} style={s.card}>
                  <Text style={s.label}>{p.name}</Text>
                  <Text style={s.copy}>
                    {p.pack_size} {quantityUnit("professional", p.unit)} per
                    confezione
                  </Text>
                  {button(
                    "Aggiungi",
                    () => {
                      setDoseInputs((previous) => ({
                        ...previous,
                        [p.id]: "1",
                      }));
                      setRecipe({
                        ...recipe,
                        lines: [
                          ...recipe.lines,
                          {
                            product_id: p.id,
                            name: p.name,
                            quantity: 1,
                            unit: p.unit,
                            pack_size: p.pack_size,
                          },
                        ],
                      });
                      setPicking(false);
                      clearSearch();
                    },
                    false,
                    recipe.lines.length >= 30,
                  )}
                </View>
              ))}
            {pager(data.product_count)}
          </>
        )}
        {button(
          recipe.lines.length || !recipe.revision
            ? "Salva ricetta del servizio"
            : "Rimuovi la ricetta",
          () =>
            void mutate(
              "shop_recipe_save",
              {
                p_service: recipe.id,
                p_revision: recipe.revision,
                p_lines: recipe.lines.map((l) => ({
                  product_id: l.product_id,
                  quantity: l.quantity,
                  unit: l.unit,
                  pack_size: l.pack_size,
                })),
              },
              "Ricetta salvata. I consumi già registrati conservano le dosi originali.",
              () => {
                setRecipe(null);
                setPicking(false);
                clearSearch();
              },
            ),
          true,
          !enabled ||
            (!recipe.revision && !recipe.lines.length) ||
            recipe.lines.some(
              (l) => !Number.isFinite(l.quantity) || l.quantity <= 0,
            ),
        )}
        {button("Annulla modifiche", () => {
          setRecipe(null);
          setPicking(false);
          clearSearch();
        })}
      </View>
    );
  return (
    <View style={s.stack}>
      {status}
      <View style={s.card}>
        <View style={s.row}>
          <Ionicons name="shield-checkmark-outline" size={28} color="#285B78" />
          <Text style={[s.title, s.grow]}>Ogni scorta, sotto controllo</Text>
        </View>
        <Text style={s.copy}>
          Conteggi, dosi dei servizi e scadenze. Un unico magazzino per app e
          web.
        </Text>
        <View style={s.row}>
          <Text style={s.label}>
            {data.pending}{" "}
            {data.pending === 1
              ? "consumo da verificare"
              : "consumi da verificare"}
          </Text>
          <Text style={s.label}>
            {data.expiring}{" "}
            {data.expiring === 1
              ? "lotto da controllare"
              : "lotti da controllare"}
          </Text>
        </View>
      </View>
      <ShopNavigation<Mode>
        items={[
          ["count", "Inventario", "clipboard-outline"],
          ["consumption", "Consumi servizi", "water-outline"],
          ["lots", "Lotti e scadenze", "calendar-outline"],
          ["reports", "Report", "stats-chart-outline"],
        ]}
        value={mode} onChange={changeMode} disabled={busy}
      />
      {!enabled && (
        <Text style={s.copy}>
          Attiva Shop e magazzino per nuove registrazioni. Lo storico e i
          consumi da verificare restano accessibili.
        </Text>
      )}
      {mode === "count" && (
        <>
          <Text style={s.title}>
            {review ? "Controlla le differenze" : "Conta le scorte reali"}
          </Text>
          <Text style={s.copy}>
            Conta tutte le confezioni presenti, comprese quelle riservate ai
            clienti. Per l’uso interno inserisci la quantità residua in ml, g o
            pezzi. Le righe non selezionate restano invariate.
          </Text>
          {counts.map((c, i) => {
            const previous =
              c.bucket === "retail"
                ? c.product.retail_qty
                : c.product.professional_qty;
            return (
              <View key={c.product.id} style={s.card}>
                <Text style={s.label}>
                  {c.product.name} · {bucketName(c.bucket)}
                </Text>
                <Text style={s.copy}>
                  Registrati: {previous}{" "}
                  {quantityUnit(c.bucket, c.product.unit)} ·{" "}
                  {c.bucket === "retail"
                    ? `${c.product.reserved_qty} riservati`
                    : "Uso professionale"}
                </Text>
                {review ? (
                  <Text style={s.label}>
                    Contati: {c.quantity} · Differenza:{" "}
                    {shopNumber(c.quantity) - previous}
                  </Text>
                ) : (
                  <ShopField
                    label={`Quantità contata · ${quantityUnit(c.bucket, c.product.unit)}`}
                    numeric
                    value={c.quantity}
                    onChange={(quantity) =>
                      setCounts(
                        counts.map((x, j) =>
                          i === j ? { ...x, quantity } : x,
                        ),
                      )
                    }
                    disabled={busy}
                  />
                )}
                {!review &&
                  button("Rimuovi dal conteggio", () =>
                    setCounts(
                      counts.filter((x) => x.product.id !== c.product.id),
                    ),
                  )}
              </View>
            );
          })}
          {!!counts.length && (
            <>
              <ShopField
                label="Causale del conteggio"
                value={reason}
                onChange={setReason}
                disabled={busy || review}
              />
              {review
                ? button(
                    "Conferma inventario",
                    () =>
                      void mutate(
                        "shop_inventory_count",
                        {
                          p_lines: counts.map((c) => ({
                            product_id: c.product.id,
                            bucket: c.bucket,
                            quantity: shopNumber(c.quantity),
                            stock_revision: c.product.stock_revision,
                          })),
                          p_reason: reason,
                        },
                        "Inventario registrato e sincronizzato.",
                        () => {
                          setCounts([]);
                          setReview(false);
                        },
                        true,
                      ),
                    true,
                    !enabled,
                  )
                : button(
                    "Controlla differenze",
                    () => setReview(true),
                    true,
                    !enabled ||
                      reason.trim().length < 3 ||
                      counts.some(
                        (c) =>
                          !c.quantity.trim() ||
                          !Number.isFinite(shopNumber(c.quantity)) ||
                          shopNumber(c.quantity) < 0,
                      ),
                  )}
              {review && button("Torna al conteggio", () => setReview(false))}
              {button("Scarta questo conteggio", () => {
                setCounts([]);
                setReview(false);
              })}
            </>
          )}
          {!review && (
            <>
              {searchBox()}
              <Text style={s.copy}>
                Se le scorte cambiano durante il conteggio, ti chiederemo di
                ricontare. Per un prodotto con due destinazioni, conferma prima
                una destinazione e poi l’altra.
              </Text>
              {data.products
                .filter((p) => !counts.some((c) => c.product.id === p.id))
                .map((p) => (
                  <View key={p.id} style={s.card}>
                    <Text style={s.label}>{p.name}</Text>
                    <Text style={s.copy}>
                      {p.sku}
                      {p.barcode ? ` · ${p.barcode}` : ""}
                    </Text>
                    <View style={s.row}>
                      {p.purpose !== "professional" &&
                        button(
                          "Conta vendita",
                          () =>
                            setCounts([
                              ...counts,
                              { product: p, bucket: "retail", quantity: "" },
                            ]),
                          false,
                          !enabled || counts.length >= 100,
                        )}
                      {p.purpose !== "retail" &&
                        button(
                          "Conta uso interno",
                          () =>
                            setCounts([
                              ...counts,
                              {
                                product: p,
                                bucket: "professional",
                                quantity: "",
                              },
                            ]),
                          false,
                          !enabled || counts.length >= 100,
                        )}
                    </View>
                  </View>
                ))}
              {!data.products.length && (
                <Text style={s.copy}>
                  Nessun prodotto trovato. Aggiungi prima gli articoli nella
                  sezione Prodotti.
                </Text>
              )}
              {pager(data.product_count)}
            </>
          )}
        </>
      )}
      {mode === "consumption" && (
        <>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={[s.label, s.grow]}>
                Scarico automatico dei servizi
              </Text>
              <ShopSwitch
                accessibilityLabel="Scarico automatico dei prodotti usati nei servizi"
                value={data.settings.consumption_enabled}
                disabled={busy || !enabled}
                onValueChange={(p_enabled) =>
                  void mutate(
                    "shop_consumption_settings",
                    { p_enabled, p_revision: data.settings.revision },
                    p_enabled
                      ? "Automatismo attivo sui prossimi servizi completati."
                      : "Scarico automatico sospeso.",
                  )
                }
              />
            </View>
            <Text style={s.copy}>
              Vale per i servizi collegati a una ricetta. Nessuno scarico per
              prenotazioni, assenze o appuntamenti già completati. Riaprire un
              servizio non rimette prodotto in magazzino e non genera un secondo
              consumo.
            </Text>
            <Text style={s.copy}>
              Una scorta insufficiente crea una verifica da gestire qui, senza
              bloccare l’agenda.
            </Text>
          </View>
          <View style={s.row}>
            {button(
              "Ricette dei servizi",
              () => {
                setActivity(false);
                clearSearch();
              },
              !activity,
            )}
            {button(
              `Consumi da verificare · ${data.pending}`,
              () => {
                setActivity(true);
                clearSearch();
              },
              activity,
            )}
          </View>
          {searchBox("Cerca servizio")}
          {activity ? (
            <>
              <View style={s.row}>
                <Text style={[s.copy, s.grow]}>
                  Mostra anche consumi già gestiti
                </Text>
                <ShopSwitch
                  accessibilityLabel="Mostra storico consumi"
                  value={history}
                  onValueChange={(v) => {
                    setHistory(v);
                    setPage(0);
                  }}
                />
              </View>
              {data.consumptions.map((c) => (
                <View style={s.card} key={c.id}>
                  <Text style={s.label}>
                    {c.service_name} · {purchaseDate(c.appointment_date)}
                  </Text>
                  <Text style={s.copy}>
                    {c.state === "applied"
                      ? "Scaricato"
                      : c.state === "dismissed"
                        ? "Archiviato"
                        : "Da verificare"}
                  </Text>
                  {c.lines.map((l) => (
                    <Text style={s.copy} key={l.product_id}>
                      {l.name} · {l.quantity}{" "}
                      {quantityUnit("professional", l.unit)}
                    </Text>
                  ))}
                  {!!c.issue && c.state === "pending" && (
                    <Text style={s.error}>{c.issue}</Text>
                  )}
                  {!!c.resolution && <Text style={s.copy}>{c.resolution}</Text>}
                  {c.state === "pending" && (
                    <>
                      {!c.identity_review_required && button(
                        "Riprova lo scarico",
                        () =>
                          void mutate(
                            "shop_resolve_consumption",
                            {
                              p_id: c.id,
                              p_revision: c.revision,
                              p_action: "retry",
                            },
                            "Consumo registrato.",
                          ),
                        true,
                      )}
                      {button("Già gestito o non avvenuto", () => {
                        setDismiss(c);
                        setDismissReason("");
                      })}
                    </>
                  )}
                </View>
              ))}
              {!data.consumptions.length && (
                <Text style={s.copy}>
                  Nessun consumo da mostrare con questi filtri.
                </Text>
              )}
              {pager(data.consumption_count)}
            </>
          ) : (
            <>
              {data.services.map((service) => (
                <View style={s.card} key={service.id}>
                  <Text style={s.label}>{service.name}</Text>
                  <Text style={s.copy}>
                    {service.lines.length
                      ? `${service.lines.length} prodotti nella ricetta`
                      : "Nessuno scarico configurato"}
                  </Text>
                  {button(
                    service.lines.length
                      ? "Modifica dosi"
                      : "Imposta prodotti e dosi",
                    () => {
                      setDoseInputs(
                        Object.fromEntries(
                          service.lines.map((l) => [
                            l.product_id,
                            String(l.quantity),
                          ]),
                        ),
                      );
                      setRecipe(service);
                      clearSearch();
                    },
                    false,
                    !enabled,
                  )}
                </View>
              ))}
              {!data.services.length && (
                <Text style={s.copy}>Nessun servizio trovato.</Text>
              )}
              {pager(data.service_count)}
            </>
          )}
        </>
      )}
      {mode === "lots" && (
        <>
          <Text style={s.title}>Scadenze visibili, merce tracciata</Text>
          <Text style={s.copy}>
            Le scorte senza lotto rimangono utilizzabili. I lotti scaduti sono
            esclusi da vendite, prenotazioni Shop e consumi automatici. I resi
            rientrano senza lotto: identifica nuovamente la confezione prima di
            riutilizzarla.
          </Text>
          {searchBox("Cerca prodotto, barcode o lotto")}
          <View style={s.row}>
            <Text style={[s.copy, s.grow]}>Mostra anche lotti esauriti</Text>
            <ShopSwitch
              accessibilityLabel="Mostra lotti esauriti"
              value={history}
              onValueChange={(v) => {
                setHistory(v);
                setPage(0);
              }}
            />
          </View>
          {data.lots.map((l) => (
            <View style={s.card} key={l.id}>
              <Text style={s.label}>
                {l.name} · {l.code}
              </Text>
              <Text style={l.expires_on < romanToday() ? s.error : s.copy}>
                {l.expires_on < romanToday() ? "Scaduto" : "Scadenza"} ·{" "}
                {purchaseDate(l.expires_on)}
              </Text>
              <Text style={s.label}>
                {l.quantity} {quantityUnit(l.bucket, l.unit)} ·{" "}
                {bucketName(l.bucket)}
              </Text>
              {l.quantity > 0 &&
                button(
                  "Registra scarto",
                  () => {
                    setDiscard(l);
                    setDiscardQty("");
                    setDiscardReason("");
                  },
                  false,
                  !enabled,
                )}
            </View>
          ))}
          {!data.lots.length && (
            <Text style={s.copy}>
              Nessun lotto registrato con questi filtri.
            </Text>
          )}
          {pager(data.lot_count)}
          <Text style={s.title}>Associa un lotto alle scorte</Text>
          {data.products.map((p) => (
            <View style={s.card} key={p.id}>
              <Text style={s.label}>{p.name}</Text>
              <View style={s.row}>
                {p.purpose !== "professional" &&
                  button(
                    `Vendita · ${p.retail_qty - p.retail_assigned} senza lotto`,
                    () =>
                      setLot({
                        product: p,
                        bucket: "retail",
                        code: "",
                        quantity: "",
                        expires: "",
                      }),
                    false,
                    !enabled || p.retail_qty <= p.retail_assigned,
                  )}
                {p.purpose !== "retail" &&
                  button(
                    `Uso interno · ${p.professional_qty - p.professional_assigned} ${quantityUnit("professional", p.unit)} senza lotto`,
                    () =>
                      setLot({
                        product: p,
                        bucket: "professional",
                        code: "",
                        quantity: "",
                        expires: "",
                      }),
                    false,
                    !enabled || p.professional_qty <= p.professional_assigned,
                  )}
              </View>
            </View>
          ))}
          {pager(data.product_count)}
        </>
      )}
      {mode === "reports" && (
        <>
          <Text style={s.title}>Il valore del tuo magazzino</Text>
          <View style={s.row}>
            {[7, 30, 90].map((d) => (
              <ShopButton
                key={d}
                title={`${d} giorni`}
                primary={days === d}
                onPress={() => setDays(d)}
                disabled={busy}
              />
            ))}
          </View>
          <Text style={s.copy}>
            Vendite del periodo, con tutti i relativi resi registrati fino a
            oggi. Le gift card utilizzate sono incluse nel valore venduto; gli
            sconti sono già sottratti.
          </Text>
          <View style={s.row}>
            {[
              [data.report.revenue_cents, "Vendite nette"],
              [data.report.cost_cents, "Costo merce venduta"],
              [data.report.margin_cents, "Margine commerciale"],
              [data.report.consumption_cents, "Consumi dei servizi"],
              [data.report.retail_value_cents, "Scorte vendita · oggi"],
              [
                data.report.professional_value_cents,
                "Scorte uso interno · oggi",
              ],
            ].map(([v, label]) => (
              <View
                key={label}
                style={[s.card, { flexGrow: 1, flexBasis: 240, minWidth: 0 }]}
              >
                <Text style={s.copy}>{label}</Text>
                <Text style={s.title}>{shopMoney(Number(v))}</Text>
              </View>
            ))}
          </View>
          <Text style={s.copy}>
            Margine prima di imposte e altri costi. I resi non rimessi in
            vendita mantengono il costo sostenuto. Le scorte sono stimate al
            costo corrente del catalogo, comprese quelle scadute ancora
            presenti; non è una valorizzazione fiscale.
          </Text>
          <Text style={s.title}>Prodotti più venduti</Text>
          {data.report.top
            .filter((p) => p.quantity > 0)
            .map((p, i) => (
              <View key={p.product_id} style={s.card}>
                <Text style={s.label}>
                  {i + 1}. {p.name}
                </Text>
                <Text style={s.copy}>
                  {p.quantity} confezioni · resi sottratti
                </Text>
              </View>
            ))}
          {!data.report.sales && (
            <Text style={s.copy}>Nessuna vendita nel periodo selezionato.</Text>
          )}
        </>
      )}
    </View>
  );
}
