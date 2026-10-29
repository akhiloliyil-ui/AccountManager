import type { Metadata } from "next";
import { todayIso } from "@gpa/core";
import { getDebts, listTransactions } from "@gpa/db";
import { DebtsScreen } from "@/components/screens/debts";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Debts" };

export default async function Page() {
  const { db, scope } = await requestSession();
  const debts = await getDebts(db, todayIso(), scope);
  const ids = new Set(debts.upcoming.map((t) => t.id));
  const views = debts.upcoming.length
    ? (await listTransactions(db, { accountIds: scope, from: debts.upcoming[0]!.date, to: debts.upcoming.at(-1)!.date })).filter((t) => ids.has(t.id)).reverse()
    : [];
  return <DebtsScreen owed={debts.owed} receivable={debts.receivable} upcoming={views} />;
}
