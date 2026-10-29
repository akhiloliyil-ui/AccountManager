import type { Metadata } from "next";
import { listLists } from "@gpa/db";
import { CompareScreen } from "@/components/screens/compare";
import { requestSession } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";

export const metadata: Metadata = { title: "Compare" };

export default async function Page() {
  const { db } = await requestSession();
  const [lists, currentWeekId] = await Promise.all([listLists(db), currentWeekListId(db)]);
  return <CompareScreen lists={lists} currentWeekId={currentWeekId} />;
}
