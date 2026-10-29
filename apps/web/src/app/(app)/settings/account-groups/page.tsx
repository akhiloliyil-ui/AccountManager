import type { Metadata } from "next";
import { listAccountGroups, listAccounts } from "@gpa/db";
import { AccountGroupsSettings } from "@/components/screens/settings";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Account groups" };

export default async function Page() {
  const db = await requestDb();
  const [groups, accounts] = await Promise.all([listAccountGroups(db), listAccounts(db, { includeArchived: true })]);
  return <AccountGroupsSettings groups={groups} accounts={accounts} />;
}
