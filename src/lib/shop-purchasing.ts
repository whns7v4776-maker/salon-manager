import type { ShopProduct } from "./shop-inventory";
export type Supplier = {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  lead_days: number;
  archived: boolean;
  revision: number;
};
export type ReorderItem = ShopProduct & {
  bucket: "retail" | "professional";
  rule_revision: number;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_archived: boolean;
  retail_target: number;
  professional_target: number;
  available: number;
  minimum: number;
  target: number;
  incoming: number;
  suggested_packs: number;
};
export type PurchaseLine = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  bucket: "retail" | "professional";
  unit: string;
  pack_size: number;
  quantity: number;
  received: number;
  unit_cost_cents: number;
};
export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_email: string;
  status: "draft" | "ordered" | "partial" | "received" | "closed" | "cancelled";
  expected_on: string | null;
  notes: string;
  revision: number;
  created_at: string;
  total_cents?: number;
  received_packs?: number;
  ordered_packs?: number;
  lines: PurchaseLine[];
  receipts: {
    id: string;
    reference: string;
    created_at: string;
    lines: {
      name: string;
      bucket: string;
      quantity: number;
      unit: string;
      pack_size: number;
    }[];
  }[];
};
export type SupplyConsole = {
  suppliers: Supplier[];
  supplier_count: number;
  orders: PurchaseOrder[];
  order_count: number;
  overdue: number;
};
export const purchaseStatus: Record<string, string> = {
  draft: "Bozza",
  ordered: "Ordinato",
  partial: "Ricevuto in parte",
  received: "Ricevuto",
  closed: "Residuo chiuso",
  cancelled: "Annullato",
};
export const bucketLabel = (bucket: string) =>
  bucket === "retail" ? "Vendita" : "Uso in salone";
export const stockUnit = (bucket: string, unit: string) =>
  bucket === "retail" ? "confezioni" : unit === "piece" ? "pezzi" : unit;
export const purchaseDate = (s: string) => s.split("-").reverse().join("/");
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function purchaseDocumentHtml(order: PurchaseOrder, salonName: string) {
  const money = (n: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(n / 100);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ordine ${escape(order.id.slice(0, 8).toUpperCase())}</title><style>body{font-family:Arial,sans-serif;color:#20384d;margin:0;padding:32px}main{max-width:850px;margin:auto}header{border-bottom:3px solid #285b78;padding-bottom:20px}h1{font-size:30px;margin:12px 0}p{line-height:1.5}small{color:#627487}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #d8e5ee}th{background:#eef5fa}.total{text-align:right;font-size:23px;font-weight:bold}.notes{white-space:pre-wrap;padding:20px;background:#f3f8fb;border-radius:14px}@media print{body{padding:12mm}tr{break-inside:avoid}.actions{display:none}}@media(max-width:500px){body{padding:14px}th,td{padding:8px 3px;font-size:12px}}</style></head><body><main><header><small>SalonPro · ${escape(salonName)}</small><h1>Ordine di acquisto</h1><p>N. ${escape(order.id.slice(0, 8).toUpperCase())} · ${escape(purchaseStatus[order.status])}<br>Fornitore: <strong>${escape(order.supplier_name)}</strong>${order.supplier_email ? `<br>${escape(order.supplier_email)}` : ""}${order.expected_on ? `<br>Consegna prevista: ${escape(purchaseDate(order.expected_on))}` : ""}</p></header><table><thead><tr><th>Prodotto / codice</th><th>Confezioni</th><th>Costo concordato</th><th>Totale</th></tr></thead><tbody>${order.lines.map((l) => `<tr><td>${escape(l.name)}<br><small>${escape(l.sku)} · ${escape(bucketLabel(l.bucket))}<br>${l.pack_size} ${escape(l.unit === "piece" ? "pezzi" : l.unit)} / confezione</small></td><td>${l.quantity}</td><td>${escape(money(l.unit_cost_cents))}</td><td>${escape(money(l.quantity * l.unit_cost_cents))}</td></tr>`).join("")}</tbody></table><p class="total">Totale righe ${escape(money(order.lines.reduce((s, l) => s + l.quantity * l.unit_cost_cents, 0)))}</p>${order.notes ? `<div class="notes">${escape(order.notes)}</div>` : ""}<p><small>Riepilogo dei costi inseriti dal salone. Non è una fattura, una ricevuta o una conferma di pagamento. Eventuali imposte e spese seguono gli accordi con il fornitore. Il documento non viene inviato automaticamente.</small></p></main></body></html>`;
}
