import { matchProduct } from "./offer-text";
import type { Product, Store } from "./types";

/** What a receipt reader returns: amounts in major units (e.g. 12.50) as printed. */
export interface ReceiptReading {
  store: string | null;
  /** ISO date, when legible. */
  date: string | null;
  /** Three-letter currency code, when printed. */
  currency: string | null;
  total: number | null;
  items: { name: string; quantity: number; unitPrice: number | null; lineTotal: number }[];
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  /** Price per unit in minor units. */
  unitMinor: number;
  lineMinor: number;
  /** Catalogue product it most likely is. */
  productId: string | null;
}

export interface ReceiptMatch {
  storeId: string | null;
  storeName: string | null;
  date: string | null;
  currency: string | null;
  totalMinor: number | null;
  lines: ReceiptLine[];
}

const minor = (major: number, decimals: number) => Math.round(major * 10 ** decimals);
const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Matches a reading to the catalogue: which store it's from, and which product each line is. */
export function matchReceipt(reading: ReceiptReading, catalog: { stores: Store[]; products: Pick<Product, "id" | "name" | "brand">[] }, decimals = 2): ReceiptMatch {
  const printed = reading.store ? simplify(reading.store) : "";
  // "LULU HYPERMARKET LLC" → Lulu; "Carrefour MOE" → Carrefour.
  const store = printed ? catalog.stores.find((s) => printed.includes(simplify(s.name)) || simplify(s.name).includes(printed.split(" ")[0] ?? "")) : undefined;
  const lines = reading.items
    .filter((i) => i.name.trim() && Number.isFinite(i.lineTotal) && i.lineTotal > 0)
    .map((i) => {
      const quantity = i.quantity > 0 ? i.quantity : 1;
      const lineMinor = minor(i.lineTotal, decimals);
      return {
        name: i.name.trim(),
        quantity,
        lineMinor,
        unitMinor: i.unitPrice && i.unitPrice > 0 ? minor(i.unitPrice, decimals) : Math.round(lineMinor / quantity),
        productId: matchProduct(i.name, catalog.products)?.productId ?? null,
      };
    });
  const date = reading.date && /^\d{4}-\d{2}-\d{2}$/.test(reading.date) ? reading.date : null;
  return {
    storeId: store?.id ?? null,
    storeName: reading.store,
    date,
    currency: reading.currency && /^[A-Z]{3}$/.test(reading.currency) ? reading.currency : null,
    totalMinor: reading.total && reading.total > 0 ? minor(reading.total, decimals) : lines.reduce((s, l) => s + l.lineMinor, 0) || null,
    lines,
  };
}
