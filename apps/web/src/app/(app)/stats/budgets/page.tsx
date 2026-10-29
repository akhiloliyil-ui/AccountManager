import type { Metadata } from "next";
import { todayIso } from "@gpa/core";
import { getBudgetReport } from "@gpa/db";
import { BudgetsScreen } from "@/components/screens/budgets";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Budgets" };

export default async function Page({ searchParams }: PageProps<"/stats/budgets">) {
  const { db, scope } = await requestSession();
  const m = [(await searchParams).m].flat()[0];
  const today = todayIso();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : today;
  // Spending only counts the accounts this person can see; budgets themselves are for the household.
  return <BudgetsScreen report={await getBudgetReport(db, month, scope, today)} limited={scope !== null} />;
}
