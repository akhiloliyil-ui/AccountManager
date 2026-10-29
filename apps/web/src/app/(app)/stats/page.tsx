import type { Metadata } from "next";
import { isValidIso, lastMonthEnds, periodRange, todayIso, trendBy, type Period } from "@gpa/core";
import { statTransactions } from "@gpa/db";
import { StatsScreen } from "@/components/screens/stats";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Stats" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: PageProps<"/stats">) {
  const db = await requestDb();
  const sp = await searchParams;
  const period: Period = one(sp.p) === "week" ? "week" : one(sp.p) === "year" ? "year" : "month";
  const a = one(sp.a);
  const anchor = a && isValidIso(a) ? a : todayIso();
  const range = periodRange(period, anchor);
  const kind = one(sp.kind) === "income" ? "income" : "expense";

  const months = lastMonthEnds(anchor, 12);
  const [txs, history] = await Promise.all([
    statTransactions(db, { from: range.start, to: range.end }),
    statTransactions(db, { from: `${months[0]!.slice(0, 7)}-01`, to: months.at(-1)! }),
  ]);
  const trend = trendBy(history, months.map((m) => m.slice(0, 7)), (d) => d.slice(0, 7));

  return <StatsScreen data={{ period, anchor, range, kind, parent: one(sp.parent) ?? null, txs, trend }} />;
}
