import { addDays, monthEndOf, monthStartOf, todayIso, totals } from "@gpa/core";
import { getDebts, getNetWorth, groceryMonthSpend, listAccounts, listLists, listTransactions, statTransactions } from "@gpa/db";
import { HomeScreen } from "@/components/screens/home";
import { requestDb } from "@/lib/server/db";
import { currentWeekListId } from "@/lib/server/grocery";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Page() {
  const db = await requestDb();
  const today = todayIso();
  const [worth, stats, recent, debts, accounts, lists, spend, currentWeekId] = await Promise.all([
    getNetWorth(db),
    statTransactions(db, { from: monthStartOf(today), to: monthEndOf(today) }),
    listTransactions(db, { to: today, limit: 6 }),
    getDebts(db, today),
    listAccounts(db, { includeArchived: true }),
    listLists(db),
    groceryMonthSpend(db),
    currentWeekListId(db),
  ]);
  const soon = debts.upcoming.filter((t) => t.date <= addDays(today, 31)).slice(0, 4);
  const upcoming = soon.length ? await listTransactions(db, { from: soon[0]!.date, to: soon.at(-1)!.date }) : [];

  return (
    <HomeScreen
      data={{
        greeting: greeting(),
        worth,
        month: totals(stats),
        recent,
        upcoming: upcoming.filter((t) => soon.some((s) => s.id === t.id)).reverse(),
        accounts,
        lists,
        spend,
        currentWeekId,
      }}
    />
  );
}
