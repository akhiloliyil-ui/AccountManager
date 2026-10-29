import type { Metadata } from "next";
import { groceryMonthSpend, listLists } from "@gpa/db";
import { BudgetScreen } from "@/components/screens/budget";
import { requestSession } from "@/lib/server/db";
import { AccessGuard } from "@/components/providers";

export const metadata: Metadata = { title: "Grocery budget" };

export default async function Page() {
  const { db, scope } = await requestSession();
  const [lists, spend] = await Promise.all([listLists(db), groceryMonthSpend(db, undefined, scope)]);
  // Anyone can see the budget; only admins change it.
  return (
    <AccessGuard need="admin">
      <BudgetScreen lists={lists} spend={spend} />
    </AccessGuard>
  );
}
