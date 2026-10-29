import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { currencies } from "../schema";
import { getSettings, setSettings } from "../settings";
import { getCurrencies, ValidationError } from "./money";

/** Free, keyless daily rates (ExchangeRate-API open access). Covers AED and INR, unlike ECB-based sources. */
export const FX_SOURCE_URL = "https://open.er-api.com/v6/latest";
export const FX_SOURCE_NAME = "ExchangeRate-API";
/** The source publishes once a day; checking more often than this only repeats the same numbers. */
export const FX_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface FxResult {
  updated: string[];
  /** When the provider says these rates were published. */
  publishedAt: string;
}

/** Fetches rates as units per 1 base, the same convention as currencies.perBase. */
export async function fetchRates(base: string, fetchImpl: typeof fetch = fetch): Promise<{ rates: Record<string, number>; publishedAt: string }> {
  let body: { result?: string; base_code?: string; rates?: Record<string, number>; time_last_update_unix?: number };
  try {
    const res = await fetchImpl(`${FX_SOURCE_URL}/${encodeURIComponent(base)}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (error) {
    throw new ValidationError(`Couldn't reach the exchange-rate service (${error instanceof Error ? error.message : "network error"}). Rates are unchanged.`);
  }
  if (body.result !== "success" || body.base_code !== base || !body.rates) {
    throw new ValidationError(`The exchange-rate service has no rates for ${base}. Rates are unchanged.`);
  }
  const publishedAt = new Date((body.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString();
  return { rates: body.rates, publishedAt };
}

/** Updates every non-base currency the source knows; currencies it doesn't list keep their manual rate. */
export async function updateRatesOnline(db: Db, fetchImpl: typeof fetch = fetch): Promise<FxResult> {
  const { base, rows } = await getCurrencies(db);
  const { rates, publishedAt } = await fetchRates(base.code, fetchImpl);
  const updated: string[] = [];
  await db.transaction(async (tx) => {
    for (const c of rows) {
      const rate = rates[c.code];
      if (c.isBase || !(typeof rate === "number" && rate > 0 && Number.isFinite(rate))) continue;
      await tx.update(currencies).set({ perBase: rate, updatedAt: new Date() }).where(eq(currencies.code, c.code));
      updated.push(c.code);
    }
  });
  const at = new Date().toISOString();
  await setSettings(db, { fxUpdatedAt: at, fxCheckedAt: at, fxPublishedAt: publishedAt });
  return { updated, publishedAt };
}

/** With automatic updates on, refreshes rates when the last update is older than FX_MAX_AGE_MS. Never throws. */
export async function refreshRatesIfStale(db: Db, options: { now?: number; fetchImpl?: typeof fetch } = {}): Promise<FxResult | null> {
  const { fxAutoUpdate, fxCheckedAt } = await getSettings(db);
  const now = options.now ?? Date.now();
  if (!fxAutoUpdate || (fxCheckedAt && now - Date.parse(fxCheckedAt) < FX_MAX_AGE_MS)) return null;
  try {
    return await updateRatesOnline(db, options.fetchImpl);
  } catch (error) {
    // Record the attempt so an offline machine doesn't retry on every page view.
    await setSettings(db, { fxCheckedAt: new Date(now).toISOString() });
    console.warn("[gpa] exchange-rate refresh skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}
