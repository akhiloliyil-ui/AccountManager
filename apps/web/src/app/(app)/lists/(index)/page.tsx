import type { Metadata } from "next";
import { listLists } from "@gpa/db";
import { ListsScreen } from "@/components/screens/lists";
import { requestSession } from "@/lib/server/db";
import { AccessGuard } from "@/components/providers";

export const metadata: Metadata = { title: "Lists" };

export default async function Page() {
  const { db } = await requestSession();
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <ListsScreen lists={await listLists(db)} />
    </AccessGuard>
  );
}
