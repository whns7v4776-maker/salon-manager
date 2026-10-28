export type LoyaltyEarningRule = {
  loyalty_package_services: boolean;
  points_per_service: number;
  loyalty_earning_mode: "service" | "spend";
  loyalty_spend_step_cents: number;
  loyalty_spend_points: number;
  loyalty_spend_carry: boolean;
  loyalty_spend_services: boolean;
  loyalty_spend_products: boolean;
  loyalty_minimum_cents: number;
  loyalty_rule_description: string;
};
export const defaultLoyaltyEarning: LoyaltyEarningRule = {
  loyalty_package_services: false,
  points_per_service: 1,
  loyalty_earning_mode: "service",
  loyalty_spend_step_cents: 500,
  loyalty_spend_points: 1,
  loyalty_spend_carry: true,
  loyalty_spend_services: true,
  loyalty_spend_products: false,
  loyalty_minimum_cents: 0,
  loyalty_rule_description: "",
};
export function loyaltyMoney(cents: number) {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}
export function loyaltyRuleSummary(value: Partial<LoyaltyEarningRule>) {
  const r = { ...defaultLoyaltyEarning, ...value };
  const points =
    r.loyalty_earning_mode === "spend"
      ? r.loyalty_spend_points
      : r.points_per_service;
  return `${points} ${points === 1 ? "punto" : "punti"} ${r.loyalty_earning_mode === "spend" ? `ogni ${loyaltyMoney(r.loyalty_spend_step_cents)}` : "per servizio effettuato"}`;
}
export function parseLoyaltyCents(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value.trim().replace(",", ".")) * 100);
}
export function validateLoyaltyRule(r: LoyaltyEarningRule) {
  if (!["service", "spend"].includes(r.loyalty_earning_mode))
    return "Scegli come accumulare i punti.";
  if (
    ![r.points_per_service, r.loyalty_spend_points].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 10000,
    )
  )
    return "Inserisci da 1 a 10.000 punti interi.";
  if (
    !Number.isInteger(r.loyalty_spend_step_cents) ||
    r.loyalty_spend_step_cents < 1 ||
    r.loyalty_spend_step_cents > 100000000
  )
    return "Inserisci un importo valido, da 0,01 € a 1.000.000 €.";
  if (
    !Number.isInteger(r.loyalty_minimum_cents) ||
    r.loyalty_minimum_cents < 0 ||
    r.loyalty_minimum_cents > 100000000
  )
    return "Controlla la spesa minima.";
  if (
    r.loyalty_earning_mode === "spend" &&
    !r.loyalty_spend_services &&
    !r.loyalty_spend_products
  )
    return "Scegli almeno servizi o prodotti.";
  if (r.loyalty_rule_description.length > 180)
    return "La descrizione può contenere al massimo 180 caratteri.";
  return null;
}
