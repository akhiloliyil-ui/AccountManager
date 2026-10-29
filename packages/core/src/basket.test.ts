import { describe, expect, it } from "vitest";
import { compareBasket, lineCost, aedToFils, summarizeBudget, unitPrice, formatMoney } from "./index";
import type { BasketItem, StorePrice } from "./types";

const at = "2026-10-29";
const price = (storeId: string, productId: string, aed: number, extra: Partial<StorePrice> = {}): StorePrice => ({
  storeId,
  productId,
  priceFils: aedToFils(aed),
  source: "manual",
  observedAt: at,
  ...extra,
});

// Worked example from the spec (illustrative prices).
const prices: StorePrice[] = [
  price("carrefour", "milk", 10.5),
  price("lulu", "milk", 9.75),
  price("union", "milk", 10.25),
  price("carrefour", "eggs", 19.95),
  price("lulu", "eggs", 18.5),
  price("union", "eggs", 21),
  price("carrefour", "rice", 42, { promo: { type: "price_cut", priceFils: 3600 } }),
  price("lulu", "rice", 39.95),
  price("union", "rice", 44.5),
  price("carrefour", "chicken", 28),
  price("lulu", "chicken", 27.5, { promo: { type: "multi_buy", qty: 2, priceFils: 5000 } }),
  price("union", "chicken", 26),
  price("carrefour", "tomato", 4.5),
  price("lulu", "tomato", 3.95),
  price("union", "tomato", 4.25),
];

const basket: BasketItem[] = [
  { productId: "milk", quantity: 2 },
  { productId: "eggs", quantity: 1 },
  { productId: "rice", quantity: 1 },
  { productId: "chicken", quantity: 2 },
  { productId: "tomato", quantity: 1.5 },
];

describe("lineCost", () => {
  it("applies multi-buy only to full bundles", () => {
    expect(lineCost(3, 2750, { type: "multi_buy", qty: 2, priceFils: 5000 }).fils).toBe(7750);
  });
  it("buy one get one charges every second item free", () => {
    expect(lineCost(3, 1000, { type: "bogo" }).fils).toBe(2000);
  });
  it("ignores a promo that is more expensive than the regular price", () => {
    expect(lineCost(1, 1000, { type: "price_cut", priceFils: 1200 })).toEqual({ fils: 1000, promoApplied: false });
  });
  it("rounds weighed items half-up", () => {
    expect(lineCost(1.5, 425).fils).toBe(638);
  });
});

describe("compareBasket — spec worked example", () => {
  const result = compareBasket(basket, prices, ["carrefour", "lulu", "union"]);
  const total = (id: string) => result.stores.find((s) => s.storeId === id)!.totalFils;

  it("totals each store", () => {
    expect(total("carrefour")).toBe(13970);
    expect(total("lulu")).toBe(13388);
    expect(total("union")).toBe(14438);
  });

  it("ranks Lulu cheapest and Union most expensive", () => {
    expect(result.cheapest?.storeId).toBe("lulu");
    expect(result.mostExpensive?.storeId).toBe("union");
  });

  it("finds the Carrefour + Lulu split but does not recommend it", () => {
    expect(result.bestSplit?.totalFils).toBe(12993);
    expect(result.bestSplit?.assignment.rice).toBe("carrefour");
    expect(result.splitSavingFils).toBe(395);
    expect(result.recommendSplit).toBe(false);
  });
});

describe("missing prices", () => {
  it("never counts a missing price as zero", () => {
    const partial = prices.filter((p) => !(p.storeId === "union" && p.productId === "eggs"));
    const union = compareBasket(basket, partial, ["carrefour", "lulu", "union"]).stores.find(
      (s) => s.storeId === "union",
    )!;
    expect(union.missing).toEqual(["eggs"]);
    expect(union.coverage).toBe(0.8);
    // median of 19.95 and 18.50 = 19.225 -> 19.23
    expect(union.estimatedFils - union.totalFils).toBe(1923);
  });
});

describe("unitPrice and budget", () => {
  it("normalises pack sizes", () => {
    expect(unitPrice(1050, { packSize: 2, packUnit: "L", soldBy: "each" })).toEqual({ fils: 525, per: "L" });
    expect(unitPrice(499, { packSize: 500, packUnit: "g", soldBy: "each" })).toEqual({ fils: 998, per: "kg" });
  });

  it("flags budget status from the projected total", () => {
    const s = summarizeBudget({
      budgetFils: 300000,
      spentFils: 150000,
      plannedRemainingFils: 100000,
      date: new Date(2026, 9, 15),
    });
    expect(s.status).toBe("warning");
    expect(s.remainingFils).toBe(150000);
    expect(s.paceFils).toBe(145161);
  });

  it("formats money", () => {
    expect(formatMoney(13388)).toBe("AED 133.88");
  });
});
