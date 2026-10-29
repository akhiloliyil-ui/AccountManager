import type { Metadata } from "next";
import { currentWeekListId } from "@/lib/server/grocery";
import { OffersScreen } from "@/components/screens/offers";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Offers" };

export default async function Page() {
  const db = await requestDb();
  return <OffersScreen weeklyListId={await currentWeekListId(db)} />;
}
