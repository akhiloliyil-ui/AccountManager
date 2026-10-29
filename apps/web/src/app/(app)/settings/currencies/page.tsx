import type { Metadata } from "next";
import { getCurrencies, getSettings } from "@gpa/db";
import { CurrenciesSettings } from "@/components/screens/settings";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "Currencies" };

export default async function Page() {
  const { db } = await requestAdmin();
  const [{ rows }, { fxAutoUpdate, fxUpdatedAt, fxPublishedAt }] = await Promise.all([getCurrencies(db), getSettings(db)]);
  return <CurrenciesSettings currencies={rows} fx={{ autoUpdate: fxAutoUpdate, updatedAt: fxUpdatedAt, publishedAt: fxPublishedAt }} />;
}
