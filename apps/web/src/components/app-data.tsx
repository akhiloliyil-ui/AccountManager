import type { ReactNode } from "react";
import { after } from "next/server";
import { todayIso } from "@gpa/core";
import { getCatalog, getCurrencies, getSettings, listCategories, refreshRatesIfStale } from "@gpa/db";
import { requestDb } from "@/lib/server/db";
import { AppDataProvider } from "./providers";

/** Loads what every screen shares (currencies, categories, grocery catalogue, settings) once per request. */
export async function AppData({ children }: { children: ReactNode }) {
  const db = await requestDb();
  const today = todayIso();
  const [{ rows: currencies }, catalog, categories, settings] = await Promise.all([
    getCurrencies(db),
    getCatalog(db, today),
    listCategories(db),
    getSettings(db),
  ]);
  const { groceryBudgetFils, preferredStoreIds, groceryCategoryId, defaultAccountId, fxAutoUpdate } = settings;
  // Automatic exchange rates update after the response, so a slow or offline rate service never delays a page.
  if (fxAutoUpdate) after(() => refreshRatesIfStale(db));
  return (
    <AppDataProvider
      value={{
        today,
        currencies,
        catalog,
        categories,
        settings: { groceryBudgetFils, preferredStoreIds, groceryCategoryId, defaultAccountId },
      }}
    >
      {children}
    </AppDataProvider>
  );
}
