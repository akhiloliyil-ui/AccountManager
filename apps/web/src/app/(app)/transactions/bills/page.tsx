import type { Metadata } from "next";
import { todayIso } from "@gpa/core";
import { getBills, listAccounts } from "@gpa/db";
import { BillsScreen } from "@/components/screens/bills";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Bills" };

export default async function Page() {
  const { db, scope } = await requestSession();
  const [bills, accounts] = await Promise.all([getBills(db, todayIso(), scope, 95), listAccounts(db, { includeArchived: true, accountIds: scope })]);
  return <BillsScreen bills={bills} accounts={accounts} />;
}
