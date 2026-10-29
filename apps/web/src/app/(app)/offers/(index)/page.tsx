import type { Metadata } from "next";
import { currentWeekListId } from "@/lib/server/grocery";
import { OffersScreen } from "@/components/screens/offers";
import { requestSession } from "@/lib/server/db";
import { AccessGuard } from "@/components/providers";

export const metadata: Metadata = { title: "Offers" };

export default async function Page() {
  const { db } = await requestSession();
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <OffersScreen weeklyListId={await currentWeekListId(db)} />
    </AccessGuard>
  );
}
