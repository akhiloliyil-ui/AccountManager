import { roundFils, type Fils } from "./money";
import type { Product, Promo, Unit } from "./types";

/** Cost of `quantity` under a promo, or null when the promo cannot apply (e.g. multi-buy on loose kg). */
export function promoCost(quantity: number, regularFils: Fils, promo: Promo): number | null {
  switch (promo.type) {
    case "price_cut":
      return quantity * promo.priceFils;
    case "percent_off":
      return quantity * regularFils * (1 - promo.percent / 100);
    case "multi_buy": {
      if (!Number.isInteger(quantity) || promo.qty < 2) return null;
      const bundles = Math.floor(quantity / promo.qty);
      return bundles * promo.priceFils + (quantity % promo.qty) * regularFils;
    }
    case "bogo":
      if (!Number.isInteger(quantity)) return null;
      return Math.ceil(quantity / 2) * regularFils;
  }
}

/** Line cost: the cheaper of regular price and the promo, rounded half-up once. */
export function lineCost(quantity: number, regularFils: Fils, promo?: Promo): { fils: Fils; promoApplied: boolean } {
  const regular = quantity * regularFils;
  const withPromo = promo ? promoCost(quantity, regularFils, promo) : null;
  if (withPromo !== null && withPromo < regular) {
    return { fils: roundFils(withPromo), promoApplied: true };
  }
  return { fils: roundFils(regular), promoApplied: false };
}

const BASE_UNIT: Record<Unit, { per: "kg" | "L" | "piece"; factor: number }> = {
  kg: { per: "kg", factor: 1 },
  g: { per: "kg", factor: 1000 },
  L: { per: "L", factor: 1 },
  ml: { per: "L", factor: 1000 },
  piece: { per: "piece", factor: 1 },
  pack: { per: "piece", factor: 1 },
};

/** Normalised unit price so different pack sizes compare fairly. */
export function unitPrice(priceFils: Fils, product: Pick<Product, "packSize" | "packUnit" | "soldBy">) {
  if (product.soldBy === "kg") return { fils: priceFils, per: "kg" as const };
  const base = BASE_UNIT[product.packUnit];
  const amount = product.packSize / base.factor;
  return { fils: roundFils(priceFils / amount), per: base.per };
}
