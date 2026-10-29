import type { Metadata } from "next";
import { currentWeekListId } from "@/lib/server/grocery";
import { OffersScreen } from "@/components/screens/offers";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Offers" };

export default async function Page() {
  const { db } = await requestSession();
  return <OffersScreen weeklyListId={await currentWeekListId(db)} />;
}
