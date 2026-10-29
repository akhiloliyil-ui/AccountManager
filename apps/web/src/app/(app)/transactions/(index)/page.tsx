import type { Metadata } from "next";
import { addMonths, monthEndOf, todayIso } from "@gpa/core";
import { listAccounts, listTransactions } from "@gpa/db";
import { TransactionsScreen, type TxViewMode } from "@/components/screens/transactions";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Transactions" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: PageProps<"/transactions">) {
  const { db, scope } = await requestSession();
  const sp = await searchParams;
  const view: TxViewMode = one(sp.view) === "calendar" ? "calendar" : one(sp.view) === "monthly" ? "monthly" : "daily";
  const m = one(sp.m);
  const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : `${todayIso().slice(0, 7)}-01`;
  const anchor = view === "monthly" ? `${month.slice(0, 4)}-01-01` : month;
  const to = view === "monthly" ? monthEndOf(addMonths(anchor, 11)) : monthEndOf(anchor);
  const filters = { account: one(sp.account), category: one(sp.category), q: one(sp.q) };

  const [txs, accounts] = await Promise.all([
    listTransactions(db, { accountIds: scope, from: anchor, to, accountId: filters.account, categoryId: filters.category, q: filters.q }),
    listAccounts(db, { includeArchived: true, accountIds: scope }),
  ]);
  return <TransactionsScreen data={{ view, anchor, txs, accounts, filters }} />;
}
