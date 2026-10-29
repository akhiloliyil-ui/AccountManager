import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTransaction, listAccounts } from "@gpa/db";
import { TransactionForm } from "@/components/screens/transaction-form";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function Page({ params }: PageProps<"/transactions/[id]">) {
  const { db, scope } = await requestSession();
  const { id } = await params;
  const [tx, accounts] = await Promise.all([getTransaction(db, id, scope), listAccounts(db, { includeArchived: true, accountIds: scope })]);
  if (!tx) notFound();
  return <TransactionForm tx={tx} accounts={accounts} defaults={{ date: tx.date }} />;
}
