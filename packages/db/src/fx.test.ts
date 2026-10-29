import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "./index";
import { getCurrencies, setBaseCurrency } from "./services/money";
import { refreshRatesIfStale, updateRatesOnline } from "./services/fx";
import { getSettings, setSettings } from "./settings";
import { testDb } from "./test-utils";

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(() => h.close());

const published = 1793232151;
function fakeFetch(rates: Record<string, Record<string, number>>, calls: string[] = []): typeof fetch {
  return (async (url: string) => {
    calls.push(url);
    const base = url.split("/").pop()!;
    if (!rates[base]) return new Response(JSON.stringify({ result: "error", "error-type": "unsupported-code" }));
    return new Response(JSON.stringify({ result: "success", base_code: base, time_last_update_unix: published, rates: rates[base] }));
  }) as typeof fetch;
}
const offline = (async () => {
  throw new TypeError("fetch failed");
}) as typeof fetch;

describe("online exchange rates", () => {
  it("updates every known currency, keeps unknown ones and records when", async () => {
    const before = await getCurrencies(h.db);
    const sar = before.byCode.get("SAR")!.perBase;
    const result = await updateRatesOnline(h.db, fakeFetch({ AED: { AED: 1, INR: 24.37, USD: 0.2723, EUR: 0.2345, GBP: 0.2041 } }));
    expect(result.updated.sort()).toEqual(["EUR", "GBP", "INR", "USD"]);
    expect(result.publishedAt).toBe(new Date(published * 1000).toISOString());

    const after = await getCurrencies(h.db);
    expect(after.byCode.get("INR")!.perBase).toBe(24.37);
    expect(after.byCode.get("AED")!.perBase).toBe(1);
    expect(after.byCode.get("SAR")!.perBase).toBe(sar);
    const s = await getSettings(h.db);
    expect(s.fxUpdatedAt).toBeTruthy();
    expect(s.fxPublishedAt).toBe(result.publishedAt);
  });

  it("asks for rates in the current base currency", async () => {
    await setBaseCurrency(h.db, "INR");
    const calls: string[] = [];
    await updateRatesOnline(h.db, fakeFetch({ INR: { INR: 1, AED: 0.041, USD: 0.0112 } }, calls));
    expect(calls[0]).toMatch(/\/INR$/);
    expect((await getCurrencies(h.db)).byCode.get("AED")!.perBase).toBe(0.041);
    await setBaseCurrency(h.db, "AED");
  });

  it("leaves rates untouched and explains when the service can't be reached", async () => {
    const before = (await getCurrencies(h.db)).byCode.get("INR")!.perBase;
    await expect(updateRatesOnline(h.db, offline)).rejects.toThrow(/Couldn't reach the exchange-rate service/);
    await expect(updateRatesOnline(h.db, fakeFetch({}))).rejects.toThrow(/no rates for AED/);
    expect((await getCurrencies(h.db)).byCode.get("INR")!.perBase).toBe(before);
  });

  it("refreshes automatically only when switched on and stale, and backs off when offline", async () => {
    await setSettings(h.db, { fxAutoUpdate: false, fxCheckedAt: null });
    const calls: string[] = [];
    const fx = fakeFetch({ AED: { INR: 25 } }, calls);
    expect(await refreshRatesIfStale(h.db, { fetchImpl: fx })).toBeNull();
    expect(calls).toHaveLength(0);

    await setSettings(h.db, { fxAutoUpdate: true });
    expect((await refreshRatesIfStale(h.db, { fetchImpl: fx }))?.updated).toEqual(["INR"]);
    expect(await refreshRatesIfStale(h.db, { fetchImpl: fx })).toBeNull();
    expect(calls).toHaveLength(1);

    const later = Date.now() + 13 * 60 * 60 * 1000;
    expect(await refreshRatesIfStale(h.db, { fetchImpl: offline, now: later })).toBeNull();
    const s = await getSettings(h.db);
    expect(Date.parse(s.fxCheckedAt!)).toBe(later);
    expect(Date.parse(s.fxUpdatedAt!)).toBeLessThan(later);
    expect(await refreshRatesIfStale(h.db, { fetchImpl: fx, now: later + 1000 })).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
