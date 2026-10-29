import { roundFils, type Fils } from "./money";
import { lineCost } from "./pricing";
import type { BasketItem, StorePrice } from "./types";

export interface BasketLine {
  productId: string;
  quantity: number;
  /** null when the store has no price for this product. */
  fils: Fils | null;
  promoApplied: boolean;
}

export interface StoreTotal {
  storeId: string;
  lines: BasketLine[];
  /** Sum of priced lines only. */
  totalFils: Fils;
  /** totalFils plus the median line cost at other stores for each missing item. */
  estimatedFils: Fils;
  missing: string[];
  coverage: number;
}

export interface SplitResult {
  storeIds: [string, string];
  totalFils: Fils;
  /** productId -> storeId where it is cheapest within the pair. */
  assignment: Record<string, string>;
}

export interface Comparison {
  stores: StoreTotal[];
  cheapest: StoreTotal | null;
  mostExpensive: StoreTotal | null;
  bestSplit: SplitResult | null;
  /** True when the split beats the cheapest single store by the household's threshold. */
  recommendSplit: boolean;
  splitSavingFils: Fils;
}

export interface CompareOptions {
  /** Minimum split saving in fils (default AED 10). */
  splitMinFils?: Fils;
  /** Minimum split saving as a fraction of the single-store total (default 5%). */
  splitMinRatio?: number;
}

function priceIndex(prices: StorePrice[]) {
  const index = new Map<string, StorePrice>();
  for (const p of prices) index.set(`${p.storeId}:${p.productId}`, p);
  return index;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function priceBasket(items: BasketItem[], prices: StorePrice[], storeIds: string[]): StoreTotal[] {
  const index = priceIndex(prices);

  const lineFor = (storeId: string, item: BasketItem): BasketLine => {
    const price = index.get(`${storeId}:${item.productId}`);
    if (!price) return { productId: item.productId, quantity: item.quantity, fils: null, promoApplied: false };
    const { fils, promoApplied } = lineCost(item.quantity, price.priceFils, price.promo);
    return { productId: item.productId, quantity: item.quantity, fils, promoApplied };
  };

  const linesByStore = new Map(storeIds.map((s) => [s, items.map((item) => lineFor(s, item))]));

  return storeIds.map((storeId) => {
    const lines = linesByStore.get(storeId)!;
    let totalFils = 0;
    let estimatedFils = 0;
    const missing: string[] = [];

    lines.forEach((line, i) => {
      if (line.fils !== null) {
        totalFils += line.fils;
        estimatedFils += line.fils;
        return;
      }
      missing.push(line.productId);
      const elsewhere = storeIds
        .filter((s) => s !== storeId)
        .map((s) => linesByStore.get(s)![i]!.fils)
        .filter((f): f is number => f !== null);
      // Never count a missing price as zero; with no price anywhere the item cannot be estimated.
      if (elsewhere.length) estimatedFils += roundFils(median(elsewhere));
    });

    return {
      storeId,
      lines,
      totalFils,
      estimatedFils,
      missing,
      coverage: items.length ? (items.length - missing.length) / items.length : 1,
    };
  });
}

export function bestTwoStoreSplit(stores: StoreTotal[]): SplitResult | null {
  let best: SplitResult | null = null;
  for (let a = 0; a < stores.length; a++) {
    for (let b = a + 1; b < stores.length; b++) {
      const sa = stores[a]!;
      const sb = stores[b]!;
      let total = 0;
      let complete = true;
      const assignment: Record<string, string> = {};
      sa.lines.forEach((la, i) => {
        const lb = sb.lines[i]!;
        if (la.fils === null && lb.fils === null) complete = false;
        else if (lb.fils === null || (la.fils !== null && la.fils <= lb.fils)) {
          total += la.fils!;
          assignment[la.productId] = sa.storeId;
        } else {
          total += lb.fils;
          assignment[la.productId] = sb.storeId;
        }
      });
      if (complete && (!best || total < best.totalFils)) {
        best = { storeIds: [sa.storeId, sb.storeId], totalFils: total, assignment };
      }
    }
  }
  return best;
}

export function compareBasket(
  items: BasketItem[],
  prices: StorePrice[],
  storeIds: string[],
  { splitMinFils = 1000, splitMinRatio = 0.05 }: CompareOptions = {},
): Comparison {
  const stores = priceBasket(items, prices, storeIds).sort(
    (x, y) => y.coverage - x.coverage || x.estimatedFils - y.estimatedFils,
  );
  const cheapest = stores[0] ?? null;
  const mostExpensive = stores.length
    ? stores.reduce((max, s) => (s.estimatedFils > max.estimatedFils ? s : max))
    : null;
  const bestSplit = bestTwoStoreSplit(stores);

  const splitSavingFils = cheapest && bestSplit ? cheapest.estimatedFils - bestSplit.totalFils : 0;
  const threshold = cheapest ? Math.max(splitMinFils, cheapest.estimatedFils * splitMinRatio) : Infinity;

  return {
    stores,
    cheapest,
    mostExpensive,
    bestSplit,
    recommendSplit: splitSavingFils >= threshold,
    splitSavingFils,
  };
}
