import { monthEndOf, monthStartOf, todayIso, totals } from "@gpa/core";
import { getBills, getBudgetReport, getNetWorth, groceryMonthSpend, listAccounts, listLists, listTransactions, statTransactions } from "@gpa/db";
import { HomeScreen } from "@/components/screens/home";
import { requestSession } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Page() {
  const { db, scope } = await requestSession();
  const today = todayIso();
  const [worth, stats, recent, accounts, lists, spend, currentWeekId, budgets, bills] = await Promise.all([
    getNetWorth(db, undefined, scope),
    statTransactions(db, { from: monthStartOf(today), to: monthEndOf(today) }, scope),
    listTransactions(db, { accountIds: scope, to: today, limit: 6 }),
    listAccounts(db, { includeArchived: true, accountIds: scope }),
    listLists(db),
    groceryMonthSpend(db, undefined, scope),
    currentWeekListId(db),
    getBudgetReport(db, today, scope, today),
    getBills(db, today, scope),
  ]);

  return (
    <HomeScreen
      data={{
        greeting: greeting(),
        worth,
        month: totals(stats),
        recent,
        bills,
        accounts,
        lists,
        spend,
        currentWeekId,
        budgets,
      }}
    />
  );
}
