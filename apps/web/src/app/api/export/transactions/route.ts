import { todayIso } from "@gpa/core";
import { listAccounts, listCategories, listTransactions } from "@gpa/db";
import { requestSession } from "@/lib/server/db";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every transaction as CSV (amounts in major units of each account's currency). */
export async function GET() {
  const { db, scope } = await requestSession();
  const [txs, accounts, categories] = await Promise.all([listTransactions(db, { accountIds: scope, limit: 1_000_000 }), listAccounts(db, { includeArchived: true, accountIds: scope }), listCategories(db, { includeArchived: true })]);
  const account = new Map(accounts.map((a) => [a.id, a.name]));
  const category = new Map(categories.map((c) => [c.id, c]));
  const categoryPath = (id: string | null) => {
    const c = id ? category.get(id) : undefined;
    if (!c) return "";
    const p = c.parentId ? category.get(c.parentId) : undefined;
    return p ? `${p.name} / ${c.name}` : c.name;
  };
  const header = ["date", "type", "account", "to_account", "amount", "currency", "to_amount", "to_currency", "category", "note", "description", "source", "installment"];
  const rows = txs.map((t) => [
    t.date,
    t.type,
    account.get(t.accountId),
    t.toAccountId ? account.get(t.toAccountId) : "",
    (t.amount / 100).toFixed(2),
    t.currency,
    t.toAmount != null ? (t.toAmount / 100).toFixed(2) : "",
    t.toCurrency ?? "",
    categoryPath(t.categoryId),
    t.note,
    t.description,
    t.source,
    t.scheduleNo ? `${t.scheduleNo}/${t.scheduleCount}` : "",
  ]);
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(`﻿${body}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gpa-transactions-${todayIso()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
