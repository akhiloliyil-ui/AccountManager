import type { Metadata } from "next";
import { todayIso } from "@gpa/core";
import { listAccounts } from "@gpa/db";
import { TransactionForm } from "@/components/screens/transaction-form";
import { requestDb } from "@/lib/server/db";
import type { TxType } from "@/lib/types";

export const metadata: Metadata = { title: "New transaction" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const TYPES: TxType[] = ["income", "expense", "transfer", "adjustment"];

export default async function Page({ searchParams }: PageProps<"/transactions/new">) {
  const db = await requestDb();
  const sp = await searchParams;
  const accounts = await listAccounts(db);
  const type = TYPES.find((t) => t === one(sp.type));
  const date = one(sp.date);
  return (
    <TransactionForm
      accounts={accounts}
      defaults={{
        type,
        accountId: one(sp.account),
        toAccountId: one(sp.to),
        categoryId: one(sp.category),
        date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso(),
      }}
    />
  );
}
