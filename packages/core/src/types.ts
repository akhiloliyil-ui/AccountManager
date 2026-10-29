import type { Fils } from "./money";

export type Unit = "piece" | "kg" | "g" | "L" | "ml" | "pack";

export type Promo =
  | { type: "price_cut"; priceFils: Fils }
  | { type: "percent_off"; percent: number }
  | { type: "multi_buy"; qty: number; priceFils: Fils }
  | { type: "bogo" };

export interface Store {
  id: string;
  name: string;
  /** Brand-neutral dot colour, CSS value. */
  color: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  categoryId: string;
  packSize: number;
  packUnit: Unit;
  /** Unit the shopper buys in: per pack/piece, or per kg for loose produce. */
  soldBy: "each" | "kg";
}

export interface StorePrice {
  productId: string;
  storeId: string;
  /** Regular price per pack, or per kg when the product is sold by kg. */
  priceFils: Fils;
  promo?: Promo;
  promoValidTo?: string;
  source: "pdf" | "manual" | "receipt" | "feed";
  observedAt: string;
}

export interface BasketItem {
  productId: string;
  quantity: number;
}
