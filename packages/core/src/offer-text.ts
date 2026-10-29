import { aedToFils, type Fils } from "./money";
import type { Product, Promo } from "./types";

/**
 * Reads offers out of the text layer of a supermarket promotion PDF. Flyers are noisy, so
 * this only proposes candidates; every line goes through the review screen before going live.
 */

export interface OfferCandidate {
  /** 1-based line in the extracted text. */
  line: number;
  text: string;
  name: string;
  /** Price the shopper pays per unit under the offer (or the shelf price when no promo). */
  priceFils: Fils;
  /** Struck-through "was" price when the flyer shows one. */
  regularFils?: Fils;
  promo?: Promo;
}

const PRICE = /(?:aed|dhs?|dh|د\.إ)?\s*(\d{1,4}(?:[.,]\d{2})|\d{1,4}(?=\s*(?:aed|dhs?|dh)\b))\s*(?:aed|dhs?|dh)?/gi;
const NOISE =
  /\b(aed|dhs?|dh|only|now|was|save|offer|special|price|each|per|pc|pcs|piece|promo|valid|until|till|from|to|off|deal|new|best)\b/gi;

function pricesIn(text: string): number[] {
  const values: number[] = [];
  for (const m of text.matchAll(PRICE)) {
    const value = Number(m[1]!.replace(",", "."));
    if (value >= 0.25 && value <= 5000) values.push(value);
  }
  return values;
}

function cleanName(text: string): string {
  return text
    .replace(PRICE, " ")
    .replace(/\b\d+\s*%\s*(off)?/gi, " ")
    .replace(/\b(buy\s*\d+\s*get\s*\d+(\s*free)?|\d+\s*for\b|bogo)/gi, " ")
    .replace(NOISE, " ")
    .replace(/[|•·*_~@#=<>[\]{}()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–:,.\s]+|[-–:,.\s]+$/g, "");
}

const hasWords = (s: string) => /[a-z؀-ۿ]{3,}/i.test(s);

export function parseOfferText(text: string): OfferCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const out: OfferCandidate[] = [];

  lines.forEach((raw, i) => {
    const values = pricesIn(raw);
    if (!values.length) return;

    let name = cleanName(raw);
    // Flyers often put the product name on the line above its price.
    if (!hasWords(name) || name.length < 4) {
      const prev = lines[i - 1] ?? "";
      if (!pricesIn(prev).length && hasWords(prev)) name = cleanName(prev);
    }
    if (!hasWords(name) || name.length < 4) return;

    const multi = raw.match(/\b(\d+)\s*(?:for|x)\s*(?:aed|dhs?|dh)?\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
    const percent = raw.match(/\b(\d{1,2})\s*%\s*off\b/i);
    const bogo = /buy\s*1\s*get\s*1|bogo|1\s*\+\s*1\s*free/i.test(raw);

    let promo: Promo | undefined;
    let priceFils: Fils;
    let regularFils: Fils | undefined;

    if (multi && +multi[1]! >= 2) {
      const qty = +multi[1]!;
      const bundle = aedToFils(Number(multi[2]!.replace(",", ".")));
      promo = { type: "multi_buy", qty, priceFils: bundle };
      priceFils = Math.round(bundle / qty);
      const other = values.filter((v) => aedToFils(v) !== bundle);
      if (other.length) regularFils = aedToFils(Math.max(...other));
    } else if (bogo) {
      priceFils = aedToFils(Math.min(...values));
      regularFils = priceFils;
      promo = { type: "bogo" };
    } else if (values.length >= 2) {
      const low = Math.min(...values);
      const high = Math.max(...values);
      priceFils = aedToFils(low);
      if (high > low) {
        regularFils = aedToFils(high);
        promo = { type: "price_cut", priceFils };
      }
    } else {
      priceFils = aedToFils(values[0]!);
      if (percent) promo = { type: "percent_off", percent: +percent[1]! };
    }

    out.push({ line: i + 1, text: raw, name, priceFils, regularFils, promo });
  });

  return out;
}

const STOP = new Set(["the", "and", "with", "of", "fresh", "pack", "x"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|litre|liter|pcs|pc)\b/g, " ")
      .split(/[^a-z0-9]+/)
      .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t))
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Best catalogue match for a flyer line by word overlap with name + brand, or null below `threshold`. */
export function matchProduct(
  name: string,
  products: Pick<Product, "id" | "name" | "brand">[],
  threshold = 0.34,
): { productId: string; score: number } | null {
  const want = tokens(name);
  if (!want.size) return null;
  let best: { productId: string; score: number } | null = null;
  for (const p of products) {
    const have = tokens(`${p.name} ${p.brand ?? ""}`);
    let shared = 0;
    for (const t of want) if (have.has(t)) shared++;
    const score = shared / Math.min(want.size, have.size || 1) / (1 + Math.abs(want.size - have.size) * 0.1);
    if (shared && (!best || score > best.score)) best = { productId: p.id, score };
  }
  return best && best.score >= threshold ? best : null;
}
