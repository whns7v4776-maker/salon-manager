import type { ShopProduct } from "./shop-inventory";
export type StockProduct = ShopProduct & {
  retail_assigned: number;
  professional_assigned: number;
};
export type Dose = {
  product_id: string;
  name: string;
  quantity: number;
  unit: string;
  pack_size: number;
  cost_cents?: number;
};
export type ServiceRecipe = {
  id: string;
  name: string;
  revision: number;
  lines: Dose[];
};
export type StockLot = {
  id: string;
  product_id: string;
  name: string;
  bucket: "retail" | "professional";
  unit: string;
  code: string;
  expires_on: string;
  quantity: number;
  revision: number;
};
export type Consumption = {
  id: string;
  service_name: string;
  appointment_date: string;
  state: "pending" | "applied" | "dismissed";
  issue: string;
  resolution: string;
  identity_review_required?: boolean;
  revision: number;
  lines: Dose[];
};
export type StockControl = {
  settings: {
    enabled: boolean;
    consumption_enabled: boolean;
    revision: number;
  };
  products: StockProduct[];
  product_count: number;
  lots: StockLot[];
  lot_count: number;
  services: ServiceRecipe[];
  service_count: number;
  consumptions: Consumption[];
  consumption_count: number;
  pending: number;
  expiring: number;
  report: {
    days: number;
    revenue_cents: number;
    cost_cents: number;
    margin_cents: number;
    sales: number;
    consumption_cents: number;
    retail_value_cents: number;
    professional_value_cents: number;
    top: { product_id: string; name: string; quantity: number }[];
  };
};
export const bucketName = (b: string) =>
  b === "retail" ? "Vendita" : "Uso interno";
export const quantityUnit = (b: string, unit: string) =>
  b === "retail" ? "confezioni" : unit === "piece" ? "pezzi" : unit;
export const romanToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );
