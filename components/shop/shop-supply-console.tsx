import { ShopSwitch } from './shop-switch';
import { ShopNavigation } from "./shop-navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useShopRefresh, notifyShopChanged } from "../../src/lib/use-shop-refresh";
import { benefitOperationId } from "../../src/lib/service-packages";
import {
  shopMoney,
  shopNumber,
  type ShopProduct,
} from "../../src/lib/shop-inventory";
import { shopUI as s, shopDate } from "../../src/lib/shop-pickup";
import {
  bucketLabel,
  purchaseDate,
  purchaseStatus,
  stockUnit,
  type Supplier,
  type ReorderItem,
  type SupplyConsole,
  type PurchaseOrder,
} from "../../src/lib/shop-purchasing";
import { ShopButton, ShopField } from "./shop-pickup-ui";
import { NativeDatePickerModal } from "../ui/native-date-picker-modal";
import { PurchaseDocument } from "./purchase-document";

type DraftLine = {
  product: ShopProduct;
  bucket: "retail" | "professional";
  quantity: string;
  cost: string;
};
type Draft = {
  id: string;
  revision: number;
  supplier: Supplier | null;
  expected: string;
  notes: string;
  lines: DraftLine[];
};
type SupplierForm = {
  id: string;
  revision: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
  days: string;
  archived: boolean;
};
const newSupplier = (): SupplierForm => ({
  id: benefitOperationId(),
  revision: 0,
  name: "",
  email: "",
  phone: "",
  notes: "",
  days: "0",
  archived: false,
});

function SupplierPicker({
  workspaceId,
  value,
  onChange,
  disabled,
}: {
  workspaceId: string;
  value: Supplier | null;
  onChange: (s: Supplier) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<Supplier[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const t = setTimeout(() => {
      void supabase
        .from("shop_suppliers")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("archived", false)
        .ilike("name", `%${query.trim()}%`)
        .order("name")
        .limit(15)
        .then((r) => {
          if (stopped) return;
          setError(r.error ? "Ricerca fornitori non disponibile" : "");
          setItems(r.data || []);
        });
    }, 200);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [query, open, workspaceId]);
  return (
    <View style={{ gap: 10 }}>
      <ShopButton
        title={
          value ? `${value.name} · Cambia fornitore` : "Scegli il fornitore"
        }
        disabled={disabled}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <ShopField
            label="Cerca un fornitore"
            value={query}
            onChange={setQuery}
            disabled={disabled}
          />
          {items.map((x) => (
            <ShopButton
              key={x.id}
              title={x.name}
              primary={value?.id === x.id}
              disabled={disabled}
              onPress={() => {
                onChange(x);
                setOpen(false);
              }}
            />
          ))}
          {!items.length && (
            <Text style={s.copy}>
              Nessun fornitore attivo trovato. Puoi crearne uno qui sotto.
            </Text>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}
export function ShopSupplyConsole({
  workspaceId,
  salonName,
  enabled,
  onBusy,
}: {
  workspaceId: string;
  salonName: string;
  enabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"reorder" | "orders" | "suppliers">(
      "reorder",
    ),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [all, setAll] = useState(false);
  const [data, setData] = useState<SupplyConsole | null>(null),
    [reorders, setReorders] = useState<{
      items: ReorderItem[];
      count: number;
    } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [supplierForm, setSupplierForm] = useState<SupplierForm | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [document, setDocument] = useState<PurchaseOrder | null>(null);
  const [rule, setRule] = useState<{
    item: ReorderItem;
    supplier: Supplier | null;
    retail: string;
    professional: string;
  } | null>(null);
  const [picker, setPicker] = useState(false),
    [productQuery, setProductQuery] = useState(""),
    [matches, setMatches] = useState<ReorderItem[]>([]),
    [calendar, setCalendar] = useState(false);
  const [receive, setReceive] = useState<Record<string, string> | null>(null),
    [reference, setReference] = useState(""),
    [confirm, setConfirm] = useState("");
  const alive = useRef(true),
    locked = useRef(false),
    sequence = useRef(0),
    op = useRef({ key: "", id: "" });
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
    const n = ++sequence.current;
    const [a, b] = await Promise.all([
      supabase.rpc("shop_supply_console", {
        p_search: query,
        p_page: page,
        p_status: all ? "all" : "open",
      }),
      supabase.rpc("shop_reorder_suggestions", {
        p_search: query,
        p_page: page,
        p_only_low: !all,
      }),
    ]);
    if (a.error || b.error)
      throw new Error(a.error?.message || b.error?.message);
    if (alive.current && n === sequence.current) {
      setData(a.data);
      setReorders(b.data);
    }
  }, [query, page, all]);
  useEffect(() => {
    void refresh().catch((e) => {
      if (alive.current) setError(e.message);
    });
  }, [refresh]);
  useShopRefresh(workspaceId, async () => {
    if (!locked.current) await refresh();
  });
  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void supabase
        .rpc("shop_reorder_suggestions", {
          p_search: productQuery,
          p_page: 0,
          p_only_low: false,
        })
        .then((r) => {
          if (cancelled) return;
          if (r.error) setError(r.error.message);
          else setMatches(r.data.items);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [picker, productQuery]);
  const task = async <T,>(
    work: () => Promise<T>,
    done: (result: T) => void,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await work();
      notifyShopChanged(workspaceId);
      if (!alive.current) return;
      done(result);
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Operazione non riuscita. Riprova.",
        );
    } finally {
      locked.current = false;
      onBusy(false);
      if (alive.current) setBusy(false);
    }
  };
  const mutate = (
    name: string,
    args: Record<string, unknown>,
    done: (result: any) => void,
    operation = false,
  ) =>
    void task(
      async () => {
        const key = JSON.stringify([name, args]);
        if (operation && op.current.key !== key)
          op.current = { key, id: benefitOperationId() };
        const r = await supabase.rpc(
          name,
          operation ? { ...args, p_operation: op.current.id } : args,
        );
        if (r.error) throw new Error(r.error.message);
        return r.data;
      },
      (result) => {
        op.current = { key: "", id: "" };
        done(result);
        setNotice("Salvato.");
      },
    );
  const loadDocument = (id: string) =>
    void task(
      async () => {
        const r = await supabase.rpc("shop_purchase_document", { p_order: id });
        if (r.error) throw new Error(r.error.message);
        return r.data as PurchaseOrder;
      },
      (r) => {
        setDocument(r);
        setConfirm("");
        setReceive(null);
      },
    );
  const getSupplier = async (id: string | null) => {
    if (!id) return null;
    const r = await supabase
      .from("shop_suppliers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data as Supplier;
  };
  const startDraft = (item?: ReorderItem) =>
    void task(
      async () =>
        item?.supplier_id && !item.supplier_archived
          ? getSupplier(item.supplier_id)
          : null,
      (supplier) => {
        setDraft({
          id: benefitOperationId(),
          revision: 0,
          supplier,
          expected: "",
          notes: "",
          lines: item
            ? [
                {
                  product: item,
                  bucket: item.bucket,
                  quantity: String(Math.max(1, item.suggested_packs)),
                  cost: String(item.cost_cents / 100),
                },
              ]
            : [],
        });
        setDocument(null);
        setPicker(!item);
        setProductQuery("");
      },
    );
  const editDraft = (o: PurchaseOrder) =>
    void task(
      async () => {
        const [supplier, r] = await Promise.all([
          getSupplier(o.supplier_id),
          supabase
            .from("shop_products")
            .select("*")
            .eq("workspace_id", workspaceId)
            .in(
              "id",
              o.lines.map((l) => l.product_id),
            ),
        ]);
        if (r.error) throw new Error(r.error.message);
        const products = r.data as ShopProduct[];
        if (o.lines.some((l) => !products.find((p) => p.id === l.product_id)))
          throw new Error("Un prodotto non è più disponibile.");
        return { supplier, products };
      },
      ({ supplier, products }) => {
        setDraft({
          id: o.id,
          revision: o.revision,
          supplier,
          expected: o.expected_on || "",
          notes: o.notes,
          lines: o.lines.map((l) => ({
            product: products.find((p) => p.id === l.product_id)!,
            bucket: l.bucket,
            quantity: String(l.quantity),
            cost: String(l.unit_cost_cents / 100),
          })),
        });
        setPicker(false);
      },
    );
  const saveDraft = () => {
    if (!draft) return;
    const invalid = draft.lines.some(
      (l) =>
        !Number.isInteger(shopNumber(l.quantity)) ||
        shopNumber(l.quantity) <= 0 ||
        !l.cost.trim() ||
        !Number.isFinite(shopNumber(l.cost)) ||
        shopNumber(l.cost) < 0,
    );
    if (!draft.supplier || !draft.lines.length || invalid) {
      setError(
        "Scegli fornitore e prodotti, poi controlla confezioni e costi.",
      );
      return;
    }
    mutate(
      "shop_purchase_save",
      {
        p_id: draft.id,
        p_revision: draft.revision,
        p_supplier: draft.supplier.id,
        p_expected: draft.expected || null,
        p_notes: draft.notes,
        p_lines: draft.lines.map((l) => ({
          product_id: l.product.id,
          bucket: l.bucket,
          quantity: shopNumber(l.quantity),
          unit_cost_cents: Math.round(shopNumber(l.cost) * 100),
          product_revision: l.product.revision,
        })),
      },
      (r) => {
        setDraft(null);
        setDocument(r);
        setMode("orders");
      },
      true,
    );
  };
  const transition = (status: string) => {
    if (!document) return;
    mutate(
      "shop_purchase_transition",
      { p_order: document.id, p_revision: document.revision, p_status: status },
      (r) => {
        setDocument(r);
        setConfirm("");
      },
    );
  };
  const receiveGoods = () => {
    if (!document || !receive) return;
    const vals = Object.entries(receive).map(([id, value]) => ({
      line_id: id,
      quantity: shopNumber(value || "0"),
    }));
    if (
      vals.some((x) => !Number.isInteger(x.quantity) || x.quantity < 0) ||
      !vals.some((x) => x.quantity > 0) ||
      !reference.trim()
    ) {
      setError(
        "Inserisci quantità intere effettivamente ricevute e un riferimento alla consegna.",
      );
      return;
    }
    mutate(
      "shop_purchase_receive",
      {
        p_order: document.id,
        p_revision: document.revision,
        p_reference: reference.trim(),
        p_lines: vals.filter((l) => l.quantity > 0),
      },
      (r) => {
        setDocument(r);
        setReceive(null);
        setConfirm("");
        setNotice(
          "Merce caricata nelle giacenze. Nessun pagamento registrato.",
        );
      },
      true,
    );
  };
  const heading = (
    <>
      {busy && <ActivityIndicator color="#285B78" />}
      {!!error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {!!notice && (
        <Text style={s.copy} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
    </>
  );
  if (supplierForm) {
    const f = supplierForm;
    return (
      <View style={s.stack}>
        {heading}
        <Text style={s.title}>
          {f.revision ? "Scheda fornitore" : "Il tuo nuovo fornitore"}
        </Text>
        <Text style={s.copy}>
          Contatti e tempi abituali, per preparare riordini senza riscrivere
          tutto.
        </Text>
        <ShopField
          label="Nome fornitore"
          value={f.name}
          onChange={(name) => setSupplierForm({ ...f, name })}
          disabled={busy}
        />
        <ShopField
          label="Email · facoltativa"
          value={f.email}
          onChange={(email) => setSupplierForm({ ...f, email })}
          disabled={busy}
        />
        <ShopField
          label="Telefono · facoltativo"
          value={f.phone}
          onChange={(phone) => setSupplierForm({ ...f, phone })}
          disabled={busy}
        />
        <ShopField
          label="Consegna abituale in giorni · 0 se non nota"
          value={f.days}
          onChange={(days) => setSupplierForm({ ...f, days })}
          numeric
          disabled={busy}
        />
        <ShopField
          multiline
          label="Note e accordi · facoltativi"
          value={f.notes}
          onChange={(notes) => setSupplierForm({ ...f, notes })}
          disabled={busy}
        />
        <View style={s.row}>
          <Text style={[s.label, s.grow]}>Archiviato</Text>
          <ShopSwitch
            disabled={busy}
            value={f.archived}
            onValueChange={(archived) => setSupplierForm({ ...f, archived })}
          />
        </View>
        <Text style={s.copy}>
          Archiviare blocca i nuovi ordini. Quelli già confermati conservano i
          dati originali.
        </Text>
        <ShopButton
          title="Salva fornitore"
          primary
          disabled={
            busy ||
            !f.name.trim() ||
            !Number.isInteger(shopNumber(f.days)) ||
            shopNumber(f.days) < 0 ||
            shopNumber(f.days) > 365
          }
          onPress={() =>
            mutate(
              "shop_supplier_save",
              {
                p_id: f.id,
                p_revision: f.revision,
                p_data: {
                  name: f.name.trim(),
                  email: f.email.trim(),
                  phone: f.phone.trim(),
                  notes: f.notes,
                  lead_days: shopNumber(f.days),
                  archived: f.archived,
                },
              },
              (r) => {
                setSupplierForm(null);
                if (draft) setDraft({ ...draft, supplier: r });
                if (rule) setRule({ ...rule, supplier: r });
              },
            )
          }
        />
        <ShopButton
          title="Annulla"
          disabled={busy}
          onPress={() => setSupplierForm(null)}
        />
      </View>
    );
  }
  if (rule) {
    const r = rule;
    return (
      <View style={s.stack}>
        {heading}
        <Text style={s.title}>Riordino · {r.item.name}</Text>
        <Text style={s.copy}>
          Quando disponibile più merce in arrivo raggiunge la soglia minima,
          proponiamo le confezioni necessarie a ricostituire la scorta
          obiettivo. La proposta resta da confermare.
        </Text>
        <SupplierPicker
          workspaceId={workspaceId}
          value={r.supplier}
          onChange={(supplier) => setRule({ ...r, supplier })}
          disabled={busy}
        />
        <ShopButton
          title="Nuovo fornitore"
          disabled={busy}
          onPress={() => setSupplierForm(newSupplier())}
        />
        {r.item.purpose !== "professional" && (
          <ShopField
            label={`Obiettivo vendita · confezioni (minimo ${r.item.minimum_retail})`}
            value={r.retail}
            onChange={(retail) => setRule({ ...r, retail })}
            numeric
            disabled={busy}
          />
        )}
        {r.item.purpose !== "retail" && (
          <ShopField
            label={`Obiettivo uso in salone · ${stockUnit("professional", r.item.unit)} (minimo ${r.item.minimum_professional})`}
            value={r.professional}
            onChange={(professional) => setRule({ ...r, professional })}
            numeric
            disabled={busy}
          />
        )}
        <Text style={s.copy}>
          Le soglie minime si modificano nella scheda prodotto. Se l’obiettivo
          coincide con la soglia, proponiamo almeno una confezione per
          superarla.
        </Text>
        <ShopButton
          title="Salva regola di riordino"
          primary
          disabled={busy}
          onPress={() => {
            const rt = shopNumber(r.retail),
              pt = shopNumber(r.professional);
            if (
              !Number.isInteger(rt) ||
              !Number.isFinite(pt) ||
              rt < r.item.minimum_retail ||
              pt < r.item.minimum_professional
            ) {
              setError(
                "Controlla gli obiettivi: devono coprire le soglie minime.",
              );
              return;
            }
            mutate(
              "shop_reorder_save",
              {
                p_product: r.item.id,
                p_revision: r.item.rule_revision,
                p_supplier: r.supplier?.id || null,
                p_retail: rt,
                p_professional: pt,
              },
              () => setRule(null),
            );
          }}
        />
        <ShopButton
          title="Annulla"
          disabled={busy}
          onPress={() => setRule(null)}
        />
      </View>
    );
  }
  if (draft) {
    const d = draft;
    return (
      <View style={s.stack}>
        {heading}
        <Text style={s.title}>
          {d.revision ? "Modifica la bozza" : "Prepara un riordino"}
        </Text>
        <Text style={s.copy}>1. Fornitore · 2. Prodotti · 3. Riepilogo</Text>
        <View style={s.card}>
          <Text style={s.label}>A chi ordini?</Text>
          <SupplierPicker
            workspaceId={workspaceId}
            value={d.supplier}
            onChange={(supplier) => setDraft({ ...d, supplier })}
            disabled={busy}
          />
          <ShopButton
            title="Crea un nuovo fornitore"
            disabled={busy}
            onPress={() => setSupplierForm(newSupplier())}
          />
        </View>
        <View style={s.card}>
          <Text style={s.label}>Quali prodotti ti servono?</Text>
          {d.lines.map((l, index) => (
            <View
              key={`${l.product.id}-${l.bucket}`}
              style={{
                gap: 10,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: "#D8E5EE",
              }}
            >
              <Text style={s.label}>{l.product.name}</Text>
              <Text style={s.copy}>
                {bucketLabel(l.bucket)} · {l.product.pack_size}{" "}
                {stockUnit("professional", l.product.unit)} per confezione
              </Text>
              <ShopField
                label="Confezioni da ordinare"
                value={l.quantity}
                numeric
                disabled={busy}
                onChange={(quantity) =>
                  setDraft({
                    ...d,
                    lines: d.lines.map((x, i) =>
                      i === index ? { ...x, quantity } : x,
                    ),
                  })
                }
              />
              <ShopField
                label="Costo concordato per confezione €"
                value={l.cost}
                numeric
                disabled={busy}
                onChange={(cost) =>
                  setDraft({
                    ...d,
                    lines: d.lines.map((x, i) =>
                      i === index ? { ...x, cost } : x,
                    ),
                  })
                }
              />
              <ShopButton
                title="Rimuovi riga"
                disabled={busy}
                onPress={() =>
                  setDraft({
                    ...d,
                    lines: d.lines.filter((_, i) => i !== index),
                  })
                }
              />
            </View>
          ))}
          <ShopButton
            title={picker ? "Chiudi ricerca prodotti" : "Aggiungi prodotti"}
            disabled={busy}
            onPress={() => setPicker(!picker)}
          />
          {picker && (
            <>
              <ShopField
                label="Cerca nome, marca o codice"
                value={productQuery}
                onChange={setProductQuery}
                disabled={busy}
              />
              {matches.map((p) => (
                <ShopButton
                  key={`${p.id}-${p.bucket}`}
                  title={`${p.name} · ${bucketLabel(p.bucket)}`}
                  disabled={
                    busy ||
                    d.lines.length >= 100 ||
                    d.lines.some(
                      (l) => l.product.id === p.id && l.bucket === p.bucket,
                    )
                  }
                  onPress={() => {
                    setDraft({
                      ...d,
                      lines: [
                        ...d.lines,
                        {
                          product: p,
                          bucket: p.bucket,
                          quantity: "1",
                          cost: String(p.cost_cents / 100),
                        },
                      ],
                    });
                    setPicker(false);
                  }}
                />
              ))}
              {!matches.length && (
                <Text style={s.copy}>
                  Nessun prodotto trovato. Crea prima l’articolo dal catalogo.
                </Text>
              )}
            </>
          )}
        </View>
        <View style={s.card}>
          <Text style={s.label}>Quando è prevista la consegna?</Text>
          <ShopButton
            title={
              d.expected
                ? purchaseDate(d.expected)
                : "Scegli data · facoltativa"
            }
            disabled={busy}
            onPress={() => setCalendar(true)}
          />
          {d.expected && (
            <ShopButton
              title="Non indicare una data"
              disabled={busy}
              onPress={() => setDraft({ ...d, expected: "" })}
            />
          )}
          {!!d.supplier?.lead_days && (
            <ShopButton
              title={`Proponi tra ${d.supplier.lead_days} giorni`}
              disabled={busy}
              onPress={() => {
                const date = new Date();
                date.setDate(date.getDate() + d.supplier!.lead_days);
                const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                setDraft({ ...d, expected });
              }}
            />
          )}
          <ShopField
            multiline
            label="Note per il fornitore · facoltative"
            value={d.notes}
            onChange={(notes) => setDraft({ ...d, notes })}
            disabled={busy}
          />
          <Text style={s.label}>
            Totale righe:{" "}
            {shopMoney(
              d.lines.reduce(
                (sum, l) =>
                  sum +
                  (Number.isFinite(shopNumber(l.quantity) * shopNumber(l.cost))
                    ? Math.round(shopNumber(l.cost) * 100) *
                      shopNumber(l.quantity)
                    : 0),
                0,
              ),
            )}
          </Text>
          <Text style={s.copy}>
            Usa gli importi concordati con il fornitore. Costi di spedizione e
            imposte possono essere precisati nelle note. Salvare non invia
            l’ordine e non aggiorna né giacenze né Cassa.
          </Text>
        </View>
        <ShopButton
          title="Salva bozza e controlla riepilogo"
          primary
          disabled={busy || !d.supplier || !d.lines.length}
          onPress={saveDraft}
        />
        <ShopButton
          title="Annulla modifiche"
          disabled={busy}
          onPress={() => {
            setDraft(null);
            setPicker(false);
            setCalendar(false);
          }}
        />
        {calendar && (
          <NativeDatePickerModal
            visible
            title="Consegna prevista"
            initialValue={d.expected || undefined}
            onClose={() => setCalendar(false)}
            onConfirm={(expected) => {
              setDraft({ ...d, expected });
              setCalendar(false);
            }}
          />
        )}
      </View>
    );
  }
  if (document) {
    const o = document;
    return (
      <View style={s.stack}>
        {heading}
        <View style={s.row}>
          <Text style={[s.title, s.grow]}>
            Ordine {o.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text style={s.badge}>{purchaseStatus[o.status]}</Text>
        </View>
        <Text style={s.label}>{o.supplier_name}</Text>
        <Text style={s.copy}>
          Creato {shopDate(o.created_at)}
          {o.expected_on ? ` · Atteso ${purchaseDate(o.expected_on)}` : ""}
        </Text>
        {o.lines.map((l) => (
          <View key={l.id} style={s.card}>
            <Text style={s.label}>{l.name}</Text>
            <Text style={s.copy}>
              {bucketLabel(l.bucket)} · {l.pack_size}{" "}
              {stockUnit("professional", l.unit)} per confezione
            </Text>
            <Text style={s.label}>
              {l.received} / {l.quantity} confezioni ricevute
            </Text>
            <Text style={s.copy}>
              Costo concordato {shopMoney(l.unit_cost_cents)} / confezione
            </Text>
            {receive && l.received < l.quantity && (
              <ShopField
                label={`Ricevute adesso · massimo ${l.quantity - l.received}`}
                value={receive[l.id] || ""}
                onChange={(value) => {
                  setReceive({ ...receive, [l.id]: value });
                  setConfirm("");
                }}
                numeric
                disabled={busy}
              />
            )}
          </View>
        ))}
        {!!o.notes && <Text style={s.copy}>{o.notes}</Text>}
        {receive ? (
          <View style={s.card}>
            <ShopField
              label="Riferimento DDT o consegna"
              value={reference}
              onChange={(v) => {
                setReference(v);
                setConfirm("");
              }}
              disabled={busy}
            />
            <Text style={s.copy}>
              Inserisci soltanto la merce arrivata adesso. Le quantità
              precedenti sono già caricate.
            </Text>
            {confirm === "receive" ? (
              <>
                <Text style={s.label}>
                  Confermi il carico di{" "}
                  {Object.values(receive).reduce(
                    (n, v) => n + shopNumber(v || "0"),
                    0,
                  )}{" "}
                  confezioni?
                </Text>
                <Text style={s.copy}>
                  Aggiornerà subito le giacenze nelle rispettive destinazioni.
                  Non registra un pagamento al fornitore e non cambia i costi
                  del catalogo.
                </Text>
                <ShopButton
                  title="Conferma carico effettivo"
                  primary
                  disabled={busy}
                  onPress={receiveGoods}
                />
              </>
            ) : (
              <ShopButton
                title="Controlla e carica merce"
                primary
                disabled={busy}
                onPress={() => {
                  if (
                    !reference.trim() ||
                    !o.lines.some(
                      (l) => shopNumber(receive[l.id] || "0") > 0,
                    ) ||
                    o.lines.some((l) => {
                      const q = shopNumber(receive[l.id] || "0");
                      return (
                        !Number.isInteger(q) ||
                        q < 0 ||
                        q > l.quantity - l.received
                      );
                    })
                  ) {
                    setError(
                      "Controlla riferimento e quantità: non possono superare il residuo.",
                    );
                    return;
                  }
                  setConfirm("receive");
                  setError("");
                }}
              />
            )}
            <ShopButton
              title="Annulla ricezione"
              disabled={busy}
              onPress={() => {
                setReceive(null);
                setConfirm("");
              }}
            />
          </View>
        ) : (
          <>
            {o.status === "draft" && (
              <>
                <ShopButton
                  title="Modifica bozza"
                  disabled={busy || !enabled}
                  onPress={() => editDraft(o)}
                />
                <ShopButton
                  title="Segna come ordinato"
                  primary
                  disabled={busy || !enabled}
                  onPress={() => setConfirm("ordered")}
                />
              </>
            )}
            {["ordered", "partial"].includes(o.status) && (
              <ShopButton
                title="Registra merce ricevuta"
                primary
                disabled={busy}
                onPress={() => {
                  setReceive(
                    Object.fromEntries(
                      o.lines
                        .filter((l) => l.received < l.quantity)
                        .map((l) => [l.id, ""]),
                    ),
                  );
                  setReference("");
                  setConfirm("");
                }}
              />
            )}
            {["draft", "ordered", "partial"].includes(o.status) && (
              <ShopButton
                title={
                  o.status === "partial"
                    ? "Chiudi il residuo non consegnato"
                    : "Annulla ordine"
                }
                disabled={busy}
                onPress={() =>
                  setConfirm(o.status === "partial" ? "closed" : "cancelled")
                }
              />
            )}
            {confirm && (
              <View style={s.card}>
                <Text style={s.label}>
                  {confirm === "ordered"
                    ? "Hai già inviato o concordato l’ordine con il fornitore?"
                    : confirm === "closed"
                      ? "Non attendi più la merce restante?"
                      : "Confermi l’annullamento?"}
                </Text>
                <Text style={s.copy}>
                  {confirm === "ordered"
                    ? "Da questo momento i prodotti contano come merce in arrivo. Nessuna comunicazione viene inviata automaticamente."
                    : "Le consegne già registrate rimangono in magazzino e nello storico. Il residuo non sarà più conteggiato in arrivo."}
                </Text>
                <ShopButton
                  title="Conferma"
                  primary
                  disabled={busy}
                  onPress={() => transition(confirm)}
                />
                <ShopButton
                  title="Indietro"
                  disabled={busy}
                  onPress={() => setConfirm("")}
                />
              </View>
            )}
            <PurchaseDocument order={o} salonName={salonName} />
            <ShopButton
              title="Ricarica ordine"
              disabled={busy}
              onPress={() => loadDocument(o.id)}
            />
          </>
        )}
        {!!o.receipts.length && (
          <>
            <Text style={s.title}>Consegne registrate</Text>
            {o.receipts.map((r) => (
              <View key={r.id} style={s.card}>
                <Text style={s.label}>{r.reference}</Text>
                <Text style={s.copy}>{shopDate(r.created_at)}</Text>
                {r.lines.map((l, i) => (
                  <Text style={s.copy} key={i}>
                    {l.quantity} confezioni · {l.name} · {bucketLabel(l.bucket)}
                  </Text>
                ))}
              </View>
            ))}
          </>
        )}
        <ShopButton
          title="Torna agli ordini"
          disabled={busy}
          onPress={() => {
            setDocument(null);
            setReceive(null);
            setConfirm("");
            setError("");
            setNotice("");
          }}
        />
      </View>
    );
  }
  if (!data || !reorders)
    return (
      <View style={s.stack}>
        {heading}
        {error ? (
          <ShopButton
            title="Riprova"
            onPress={() => void task(refresh, () => {})}
          />
        ) : (
          <ActivityIndicator color="#285B78" />
        )}
      </View>
    );
  const count =
    mode === "suppliers"
      ? data.supplier_count
      : mode === "orders"
        ? data.order_count
        : reorders.count;
  return (
    <View style={s.stack}>
      {heading}
      <View style={s.card}>
        <Text style={s.title}>Acquisti, senza perdere il conto</Text>
        <Text style={s.copy}>
          Dal riordino alla consegna: fornitori, merce in arrivo e carichi
          tracciati.
        </Text>
        {data.overdue > 0 && (
          <Text style={s.badge}>
            {data.overdue} ordini oltre la data prevista
          </Text>
        )}
      </View>
      <ShopNavigation
        items={[
          ["reorder", "Da riordinare", "refresh-outline"],
          ["orders", "Ordini fornitori", "file-tray-full-outline"],
          ["suppliers", "Fornitori", "business-outline"],
        ] as const}
        value={mode} disabled={busy}
        onChange={(v) => {
          setMode(v);
          setPage(0);
          setSearch("");
          setAll(false);
          setError("");
          setNotice("");
        }}
      />
      <ShopField
        label={
          mode === "suppliers"
            ? "Cerca fornitore"
            : mode === "orders"
              ? "Cerca fornitore o numero ordine"
              : "Cerca prodotto, marca o codice"
        }
        value={search}
        onChange={setSearch}
        disabled={busy}
      />
      {mode !== "suppliers" && (
        <View style={s.row}>
          <Text style={[s.copy, s.grow]}>
            {mode === "reorder"
              ? "Mostra anche prodotti con scorte sufficienti"
              : "Mostra anche ordini chiusi"}
          </Text>
          <ShopSwitch
            value={all}
            onValueChange={(v) => {
              setAll(v);
              setPage(0);
            }}
            disabled={busy}
          />
        </View>
      )}
      {mode === "suppliers" && (
        <>
          <ShopButton
            title="Aggiungi fornitore"
            primary
            disabled={busy || !enabled}
            onPress={() => setSupplierForm(newSupplier())}
          />
          {data.suppliers.map((x) => (
            <View style={s.card} key={x.id}>
              <Text style={s.title}>{x.name}</Text>
              <Text style={s.copy}>
                {x.archived
                  ? "Archiviato"
                  : x.lead_days
                    ? `Consegna abituale: ${x.lead_days} giorni`
                    : "Tempi di consegna da concordare"}
              </Text>
              {!!x.email && <Text style={s.copy}>{x.email}</Text>}
              {!!x.phone && <Text style={s.copy}>{x.phone}</Text>}
              <ShopButton
                title="Modifica fornitore"
                disabled={busy || !enabled}
                onPress={() =>
                  setSupplierForm({ ...x, days: String(x.lead_days) })
                }
              />
            </View>
          ))}
          {!data.suppliers.length && (
            <Text style={s.copy}>
              Aggiungi il primo fornitore per preparare i tuoi ordini.
            </Text>
          )}
        </>
      )}
      {mode === "orders" && (
        <>
          <ShopButton
            title="Prepara un ordine"
            primary
            disabled={busy || !enabled}
            onPress={() => startDraft()}
          />
          {data.orders.map((o) => (
            <View key={o.id} style={s.card}>
              <View style={s.row}>
                <Text style={[s.label, s.grow]}>{o.supplier_name}</Text>
                <Text style={s.badge}>{purchaseStatus[o.status]}</Text>
              </View>
              <Text style={s.copy}>
                {o.id.slice(0, 8).toUpperCase()} · {shopDate(o.created_at)}
                {o.expected_on
                  ? ` · Atteso ${purchaseDate(o.expected_on)}`
                  : ""}
              </Text>
              <Text style={s.label}>
                {o.received_packs || 0} / {o.ordered_packs || 0} confezioni ·{" "}
                {shopMoney(o.total_cents || 0)}
              </Text>
              <ShopButton
                title="Apri ordine"
                disabled={busy}
                onPress={() => loadDocument(o.id)}
              />
            </View>
          ))}
          {!data.orders.length && (
            <Text style={s.copy}>
              Nessun ordine in questa vista. Le bozze non modificano le
              giacenze.
            </Text>
          )}
        </>
      )}
      {mode === "reorder" && (
        <>
          <Text style={s.copy}>
            Le proposte sottraggono i pezzi riservati ai clienti e considerano
            solo il residuo degli ordini già confermati. Nessun acquisto
            automatico.
          </Text>
          {reorders.items.map((x) => (
            <View style={s.card} key={`${x.id}-${x.bucket}`}>
              <Text style={s.title}>{x.name}</Text>
              <Text style={s.badge}>{bucketLabel(x.bucket)}</Text>
              <Text style={s.copy}>
                {x.available} disponibili + {x.incoming} in arrivo · Minimo{" "}
                {x.minimum} {stockUnit(x.bucket, x.unit)}
              </Text>
              <Text style={s.label}>
                {x.suggested_packs > 0
                  ? `Proposta: ${x.suggested_packs} confezioni`
                  : "Scorte coperte"}
              </Text>
              <Text style={s.copy}>
                {x.supplier_name
                  ? `${x.supplier_name}${x.supplier_archived ? " · Archiviato" : ""}`
                  : "Fornitore preferito da collegare"}{" "}
                · Obiettivo {x.target} {stockUnit(x.bucket, x.unit)}
              </Text>
              <View style={s.row}>
                <ShopButton
                  title="Prepara ordine"
                  primary
                  disabled={busy || !enabled}
                  onPress={() => startDraft(x)}
                />
                <ShopButton
                  title="Imposta riordino"
                  disabled={busy || !enabled}
                  onPress={() =>
                    void task(
                      () => getSupplier(x.supplier_id),
                      (supplier) =>
                        setRule({
                          item: x,
                          supplier,
                          retail: String(x.retail_target),
                          professional: String(x.professional_target),
                        }),
                    )
                  }
                />
              </View>
            </View>
          ))}
          {!reorders.items.length && (
            <View style={s.card}>
              <Text style={s.title}>Scorte sotto controllo</Text>
              <Text style={s.copy}>
                Nessun prodotto da riordinare con questi filtri. Attiva “Mostra
                anche prodotti con scorte sufficienti” per configurare gli
                obiettivi.
              </Text>
            </View>
          )}
        </>
      )}
      <View style={s.row}>
        <ShopButton
          title="Precedenti"
          disabled={busy || page === 0}
          onPress={() => setPage(page - 1)}
        />
        <Text style={s.copy}>
          {page + 1} / {Math.max(1, Math.ceil(count / 30))}
        </Text>
        <ShopButton
          title="Successivi"
          disabled={busy || (page + 1) * 30 >= count}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </View>
  );
}
