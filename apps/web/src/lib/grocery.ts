import {
  compareBasket,
  lineCost,
  summarizeBudget,
  type BasketItem,
  type Comparison,
  type Fils,
  type Promo,
  type StorePrice,
} from "@gpa/core";
import type { Catalog, GroceryList } from "./types";

export function describePromo(promo: Promo): string {
  switch (promo.type) {
    case "price_cut":
      return `Now AED ${(promo.priceFils / 100).toFixed(2)}`;
    case "percent_off":
      return `${promo.percent}% off`;
    case "multi_buy":
      return `${promo.qty} for AED ${(promo.priceFils / 100).toFixed(2)}`;
    case "bogo":
      return "Buy 1 get 1 free";
  }
}

export interface ListQuote {
  comparison: Comparison;
  /** Free-text items GPA cannot price. */
  unpricedCount: number;
  /** Cost per item id at the cheapest store (null when that store has no price). */
  itemFils: Map<string, Fils | null>;
  /** Cheapest store per product, for the per-item badge. */
  cheapestStoreByProduct: Map<string, { storeId: string; fils: Fils }>;
}

type Items = Pick<GroceryList, "items">;

export function quoteList(list: Items, storeIds: string[], prices: StorePrice[]): ListQuote {
  const basket: BasketItem[] = list.items
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId!, quantity: i.quantity }));
  const comparison = compareBasket(basket, prices, storeIds);

  const cheapestStoreByProduct = new Map<string, { storeId: string; fils: Fils }>();
  for (const store of comparison.stores) {
    for (const line of store.lines) {
      if (line.fils === null) continue;
      const best = cheapestStoreByProduct.get(line.productId);
      if (!best || line.fils < best.fils) cheapestStoreByProduct.set(line.productId, { storeId: store.storeId, fils: line.fils });
    }
  }

  const cheapestLines = new Map(comparison.cheapest?.lines.map((l) => [l.productId, l.fils]) ?? []);
  const itemFils = new Map(list.items.map((i) => [i.id, i.productId ? (cheapestLines.get(i.productId) ?? null) : null] as const));

  return {
    comparison,
    unpricedCount: list.items.filter((i) => !i.productId).length,
    itemFils,
    cheapestStoreByProduct,
  };
}

/** Planned total of a list at its cheapest store (estimates fill missing prices). */
export function listTotal(list: Items, storeIds: string[], prices: StorePrice[]): Fils {
  return quoteList(list, storeIds, prices).comparison.cheapest?.estimatedFils ?? 0;
}

/** Ticked items not yet confirmed as a purchase. */
export function pendingBasket(list: GroceryList) {
  return list.items.filter((i) => i.checked && !i.purchaseId);
}

/** Cost of one quantity of a product at a store, promos applied. */
export function priceAt(prices: StorePrice[], productId: string, storeId: string, quantity = 1) {
  const p = prices.find((x) => x.productId === productId && x.storeId === storeId);
  if (!p) return null;
  return { ...lineCost(quantity, p.priceFils, p.promo), regularFils: p.priceFils, price: p };
}

/**
 * Month budget: spent is what was actually paid (grocery expenses in the ledger, including
 * confirmed baskets); planned is the estimate of items on this month's lists not bought yet.
 */
export function monthBudget(
  lists: GroceryList[],
  catalog: Catalog,
  storeIds: string[],
  budgetFils: Fils,
  spentFils: Fils,
  today: string,
) {
  const month = today.slice(0, 7);
  const inMonth = lists.filter((l) => l.type !== "saved" && l.periodStart?.startsWith(month));
  const productById = new Map(catalog.products.map((p) => [p.id, p]));

  let plannedRemainingFils = 0;
  const byCategory = new Map<string, Fils>();
  const byList: { list: GroceryList; boughtCount: number; remainingFils: Fils; paidMinor: { amount: number; currency: string }[] }[] = [];

  for (const list of inMonth) {
    const open = { items: list.items.filter((i) => !i.purchaseId) };
    const quote = quoteList(list, storeIds, catalog.prices);
    let remaining = 0;
    for (const item of list.items) {
      const fils = quote.itemFils.get(item.id) ?? 0;
      if (!item.purchaseId) remaining += fils;
      const categoryId = item.productId ? (productById.get(item.productId)?.categoryId ?? "other") : "other";
      byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + fils);
    }
    plannedRemainingFils += remaining;
    byList.push({
      list,
      boughtCount: list.items.length - open.items.length,
      remainingFils: remaining,
      paidMinor: list.purchases.map((p) => ({ amount: p.amount, currency: p.currency })),
    });
  }

  const [y, m, d] = today.split("-").map(Number);
  return {
    summary: summarizeBudget({ budgetFils, spentFils, plannedRemainingFils, date: new Date(y!, m! - 1, d!) }),
    byList,
    byCategory,
  };
}

export function periodLabel(list: Pick<GroceryList, "periodStart" | "type">) {
  if (!list.periodStart) return "Template";
  const start = new Date(`${list.periodStart}T00:00:00`);
  if (list.type === "monthly") return start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}
