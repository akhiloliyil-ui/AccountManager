import type { Minor } from "./currency";

/** A transaction already converted to the base currency, for reporting. */
export interface StatTx {
  type: "income" | "expense" | "transfer" | "adjustment";
  date: string;
  amountBase: Minor;
  categoryId: string | null;
  /** Top-level category; equals categoryId for top-level categories. */
  parentCategoryId: string | null;
}

export interface Totals {
  income: Minor;
  expense: Minor;
  /** income - expense. Transfers and adjustments are excluded, as in Money Manager. */
  net: Minor;
}

export function totals(txs: StatTx[]): Totals {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (tx.type === "income") income += tx.amountBase;
    else if (tx.type === "expense") expense += tx.amountBase;
  }
  return { income, expense, net: income - expense };
}

export interface CategoryShare {
  /** null groups uncategorised transactions. */
  categoryId: string | null;
  total: Minor;
  /** 0..1 of the kind's total. */
  share: number;
  count: number;
}

/**
 * Totals per category for one kind, largest first. With `parentId` it breaks one top-level
 * category down into its subcategories (transactions on the parent itself keep the parent id).
 */
export function categoryBreakdown(
  txs: StatTx[],
  kind: "income" | "expense",
  parentId?: string,
): CategoryShare[] {
  const sums = new Map<string | null, { total: number; count: number }>();
  let all = 0;
  for (const tx of txs) {
    if (tx.type !== kind) continue;
    if (parentId !== undefined && tx.parentCategoryId !== parentId) continue;
    const key = parentId !== undefined ? tx.categoryId : tx.parentCategoryId;
    const entry = sums.get(key) ?? { total: 0, count: 0 };
    entry.total += tx.amountBase;
    entry.count += 1;
    sums.set(key, entry);
    all += tx.amountBase;
  }
  return [...sums.entries()]
    .map(([categoryId, { total, count }]) => ({ categoryId, total, count, share: all ? total / all : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Income and expense per bucket (e.g. "2026-10" for months), in the order of `buckets`. */
export function trendBy(
  txs: StatTx[],
  buckets: string[],
  bucketOf: (date: string) => string,
): { bucket: string; totals: Totals }[] {
  const grouped = new Map<string, StatTx[]>(buckets.map((b) => [b, []]));
  for (const tx of txs) grouped.get(bucketOf(tx.date))?.push(tx);
  return buckets.map((bucket) => ({ bucket, totals: totals(grouped.get(bucket)!) }));
}
