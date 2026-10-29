import { ProductScreen } from "@/components/screens/product";
import { requestSession } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";

export default async function Page({ params }: PageProps<"/products/[id]">) {
  const { db } = await requestSession();
  const { id } = await params;
  return <ProductScreen productId={id} weeklyListId={await currentWeekListId(db)} />;
}
