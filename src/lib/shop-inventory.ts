export type ShopProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  variant: string;
  sku: string;
  barcode: string | null;
  image_url: string;
  supplier: string;
  purpose: "retail" | "professional" | "both";
  unit: "piece" | "ml" | "g";
  pack_size: number;
  price_cents: number;
  cost_cents: number;
  minimum_retail: number;
  minimum_professional: number;
  retail_qty: number;
  reserved_qty: number;
  published: boolean;
  professional_qty: number;
  revision: number;
  stock_revision: number;
  archived: boolean;
};
export type ShopSale = {
  id: string;
  customer_name: string;
  total_cents: number;
  refunded_cents: number;
  created_at: string;
  payment_method: string;
  lines: {
    product_id: string;
    name: string;
    quantity: number;
    returned: number;
    unit_price_cents: number;
  }[];
};
export type ShopConsoleData = {
  settings: { enabled: boolean; revision: number };
  products: ShopProduct[];
  count: number;
  movement_count: number;
  sale_count: number;
  summary: { products: number; low: number; retail_cost_cents: number };
  movements: {
    id: string;
    name: string;
    bucket: string;
    delta: number;
    reason: string;
    created_at: string;
    unit: string;
  }[];
  sales: ShopSale[];
};
export const shopMoney = (cents: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const shopNumber = (value: string) =>
  Number(value.trim().replace(",", "."));
export const shopProductDefaults = {
  name: "",
  brand: "",
  category: "",
  variant: "",
  sku: "",
  barcode: "",
  image_url: "",
  supplier: "",
  purpose: "retail",
  unit: "piece",
  pack_size: 1,
  price_cents: 0,
  cost_cents: 0,
  minimum_retail: 0,
  minimum_professional: 0,
  archived: false,
  published: false,
};
// Quoted CSV fields may contain separators and newlines. Barcode strings stay strings.
export function parseShopCsv(source: string) {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0] || "";
  const separator = firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (quoted) throw new Error("Virgolette non chiuse nel CSV.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((h) => h.toLowerCase()) || [];
  if (!headers.includes("nome") || !headers.includes("prezzo"))
    throw new Error(
      "Servono le colonne nome e prezzo. Usa il modello indicato.",
    );
  if (rows.length < 1 || rows.length > 200)
    throw new Error("Importa da 1 a 200 prodotti alla volta.");
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const get = (key: string) => r[headers.indexOf(key)] || "";
    const price = shopNumber(get("prezzo"));
    const cost = shopNumber(get("costo") || "0");
    const minimum = shopNumber(get("scorta_minima") || "0");
    if (
      !get("nome") ||
      !get("prezzo") ||
      ![price, cost, minimum].every(Number.isFinite) ||
      price < 0 ||
      cost < 0 ||
      minimum < 0 ||
      !Number.isInteger(minimum)
    )
      throw new Error(`Riga ${i + 2}: controlla nome, prezzi e scorta minima.`);
    for (const key of ["sku", "barcode"]) {
      const v = get(key);
      if (v) {
        const token = key + ":" + v;
        if (seen.has(token))
          throw new Error(`Riga ${i + 2}: ${key} duplicato.`);
        seen.add(token);
      }
    }
    return {
      ...shopProductDefaults,
      name: get("nome"),
      brand: get("marca"),
      category: get("categoria"),
      variant: get("variante"),
      sku: get("sku"),
      barcode: get("barcode"),
      supplier: get("fornitore"),
      price_cents: Math.round(price * 100),
      cost_cents: Math.round(cost * 100),
      minimum_retail: minimum,
    };
  });
}
