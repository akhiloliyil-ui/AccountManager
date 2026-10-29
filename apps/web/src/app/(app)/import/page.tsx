import type { Metadata } from "next";
import { listAccounts, listImportBatches } from "@gpa/db";
import { StatementImportScreen } from "@/components/screens/statement-import";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Import statement" };

export default async function Page({ searchParams }: PageProps<"/import">) {
  const db = await requestDb();
  const account = (await searchParams).account;
  const [accounts, batches] = await Promise.all([listAccounts(db), listImportBatches(db)]);
  return (
    <StatementImportScreen
      accounts={accounts}
      initialAccountId={typeof account === "string" ? account : undefined}
      batches={batches.map(({ batch, accountName }) => ({ ...batch, accountName }))}
    />
  );
}
