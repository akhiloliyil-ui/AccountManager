import { notFound } from "next/navigation";
import { getList, listAccounts } from "@gpa/db";
import { ListDetailScreen } from "@/components/screens/list-detail";
import { requestSession } from "@/lib/server/db";
import { AccessGuard } from "@/components/providers";

export default async function Page({ params }: PageProps<"/lists/[id]">) {
  const { db, scope } = await requestSession();
  const { id } = await params;
  const [list, accounts] = await Promise.all([getList(db, id), listAccounts(db, { accountIds: scope })]);
  if (!list) notFound();
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <ListDetailScreen list={list} accounts={accounts} />
    </AccessGuard>
  );
}
