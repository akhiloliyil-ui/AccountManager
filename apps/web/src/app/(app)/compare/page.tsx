import type { Metadata } from "next";
import { listLists } from "@gpa/db";
import { CompareScreen } from "@/components/screens/compare";
import { requestSession } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";
import { AccessGuard } from "@/components/providers";

export const metadata: Metadata = { title: "Compare" };

export default async function Page() {
  const { db } = await requestSession();
  const [lists, currentWeekId] = await Promise.all([listLists(db), currentWeekListId(db)]);
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <CompareScreen lists={lists} currentWeekId={currentWeekId} />
    </AccessGuard>
  );
}
