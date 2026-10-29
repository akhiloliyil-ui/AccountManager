import type { Metadata } from "next";
import { groceryMonthSpend, listLists } from "@gpa/db";
import { BudgetScreen } from "@/components/screens/budget";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Grocery budget" };

export default async function Page() {
  const db = await requestDb();
  const [lists, spend] = await Promise.all([listLists(db), groceryMonthSpend(db)]);
  return <BudgetScreen lists={lists} spend={spend} />;
}
