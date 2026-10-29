import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listAccounts, listImportBatches } from "@gpa/db";
import { StatementImportScreen } from "@/components/screens/statement-import";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Import statement" };

export default async function Page({ searchParams }: PageProps<"/import">) {
  const { db, scope, access } = await requestSession();
  if (access.role === "read") redirect("/transactions");
  const account = (await searchParams).account;
  const [accounts, batches] = await Promise.all([listAccounts(db, { accountIds: scope }), listImportBatches(db, scope)]);
  return (
    <StatementImportScreen
      accounts={accounts}
      initialAccountId={typeof account === "string" ? account : undefined}
      batches={batches.map(({ batch, accountName }) => ({ ...batch, accountName }))}
    />
  );
}
