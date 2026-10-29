import { ProductScreen } from "@/components/screens/product";
import { requestSession } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";
import { AccessGuard } from "@/components/providers";

export default async function Page({ params }: PageProps<"/products/[id]">) {
  const { db } = await requestSession();
  const { id } = await params;
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <ProductScreen productId={id} weeklyListId={await currentWeekListId(db)} />
    </AccessGuard>
  );
}
