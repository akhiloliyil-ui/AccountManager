import type { Metadata } from "next";
import { todayIso } from "@gpa/core";
import { getDebts, listTransactions } from "@gpa/db";
import { DebtsScreen } from "@/components/screens/debts";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Debts" };

export default async function Page() {
  const db = await requestDb();
  const debts = await getDebts(db, todayIso());
  const ids = new Set(debts.upcoming.map((t) => t.id));
  const views = debts.upcoming.length
    ? (await listTransactions(db, { from: debts.upcoming[0]!.date, to: debts.upcoming.at(-1)!.date })).filter((t) => ids.has(t.id)).reverse()
    : [];
  return <DebtsScreen owed={debts.owed} receivable={debts.receivable} upcoming={views} />;
}
