import { notFound } from "next/navigation";
import { getAccountDetail, listAccountGroups, listAccounts } from "@gpa/db";
import { AccountDetailScreen } from "@/components/screens/accounts";
import { requestDb } from "@/lib/server/db";

export default async function Page({ params }: PageProps<"/accounts/[id]">) {
  const db = await requestDb();
  const { id } = await params;
  const [detail, groups, accounts] = await Promise.all([getAccountDetail(db, id), listAccountGroups(db), listAccounts(db, { includeArchived: true })]);
  if (!detail) notFound();
  return <AccountDetailScreen {...detail} groups={groups} accounts={accounts} />;
}
