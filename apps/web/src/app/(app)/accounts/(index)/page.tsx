import type { Metadata } from "next";
import { lastMonthEnds, todayIso } from "@gpa/core";
import { getNetWorth, getNetWorthSeries, listAccountGroups, listAccounts } from "@gpa/db";
import { AccountsScreen } from "@/components/screens/accounts";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Accounts" };

export default async function Page() {
  const { db, scope } = await requestSession();
  const today = todayIso();
  const [accounts, groups, worth, series] = await Promise.all([
    listAccounts(db, { includeArchived: true, accountIds: scope }),
    listAccountGroups(db),
    getNetWorth(db, today, scope),
    getNetWorthSeries(db, lastMonthEnds(today, 12).map((d) => (d > today ? today : d)), scope),
  ]);
  return <AccountsScreen accounts={accounts} groups={groups} worth={worth} series={series} />;
}
