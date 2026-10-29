"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChartPie, List, PiggyBank } from "lucide-react";
import { categoryBreakdown, shiftPeriod, totals, type Period, type StatTx, type Totals } from "@gpa/core";
import { Donut, GroupedBars, OTHER, SERIES, type Slice } from "../charts";
import { useApp } from "../providers";
import { Amount, ButtonLink, Card, EmptyState, MonthNav, PageHeader, Segmented } from "../ui";

export interface StatsData {
  period: Period;
  anchor: string;
  range: { start: string; end: string };
  kind: "income" | "expense";
  parent: string | null;
  txs: StatTx[];
  trend: { bucket: string; totals: Totals }[];
}

function rangeLabel(period: Period, start: string, end: string) {
  const d = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", o);
  if (period === "year") return start.slice(0, 4);
  if (period === "month") return d(start, { month: "short", year: "numeric" });
  return `${d(start, { day: "numeric", month: "short" })} – ${d(end, { day: "numeric", month: "short" })}`;
}

export function StatsScreen({ data }: { data: StatsData }) {
  const { period, anchor, range, kind, parent, txs, trend } = data;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { base, categoryById } = useApp();

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `${pathname}?${next.toString()}`;
  };

  const sums = totals(txs);
  const rows = categoryBreakdown(txs, kind, parent ?? undefined);
  const parentCat = parent ? categoryById.get(parent) : undefined;
  const name = (id: string | null) => {
    if (!id) return "Uncategorised";
    const c = categoryById.get(id);
    if (!c) return "Deleted category";
    return parent && id === parent ? `${c.name} (general)` : `${c.emoji ? `${c.emoji} ` : ""}${c.name}`;
  };
  const colorOf = (i: number) => SERIES[i] ?? OTHER;
  const slices: Slice[] = rows.slice(0, SERIES.length).map((r, i) => ({ key: String(r.categoryId), label: name(r.categoryId), value: r.total, color: colorOf(i) }));
  const rest = rows.slice(SERIES.length).reduce((s, r) => s + r.total, 0);
  if (rest) slices.push({ key: "other", label: "Other", value: rest, color: OTHER });
  const txHref = (categoryId: string | null) =>
    `/transactions?m=${range.start.slice(0, 7)}${categoryId ? `&category=${categoryId}` : ""}${period === "year" ? "&view=monthly" : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stats"
        action={
          <ButtonLink href="/stats/budgets" variant="secondary">
            <PiggyBank size={16} /> Budgets
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav label={rangeLabel(period, range.start, range.end)} prevHref={href({ a: shiftPeriod(period, anchor, -1) })} nextHref={href({ a: shiftPeriod(period, anchor, 1) })} />
        <Segmented
          label="Period"
          value={period}
          onChange={(p) => router.replace(href({ p: p === "month" ? null : p, a: anchor }))}
          options={[
            { value: "week", label: "W" },
            { value: "month", label: "M" },
            { value: "year", label: "Y" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["income", "expense"] as const).map((k) => (
          <button
            key={k}
            onClick={() => router.replace(href({ kind: k === "expense" ? null : k, parent: null }))}
            aria-pressed={kind === k}
            className={`rounded-2xl border p-3 text-left transition-colors ${kind === k ? (k === "income" ? "border-income bg-income-soft" : "border-expense bg-expense-soft") : "border-border bg-surface hover:bg-surface-2"}`}
          >
            <p className="text-xs text-muted">{k === "income" ? "Income" : "Expenses"}</p>
            <Amount minor={k === "income" ? sums.income : sums.expense} currency={base.code} tone={k} className="font-semibold" />
          </button>
        ))}
      </div>

      {parentCat && (
        <Link href={href({ parent: null })} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft size={16} /> All {kind === "income" ? "income" : "expense"} categories · <span className="font-medium text-text">{parentCat.name}</span>
        </Link>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<ChartPie size={22} />} title={`No ${kind} in this period`} body="Pick another period, or add transactions to see where the money goes." />
      ) : (
        <Card className="flex flex-col items-center gap-6 p-5 md:flex-row md:items-start">
          <Donut slices={slices} currency={base} />
          <ol className="w-full flex-1 divide-y divide-border">
            {rows.map((r, i) => {
              const drillable = !parent && r.categoryId && [...categoryById.values()].some((c) => c.parentId === r.categoryId);
              return (
                <li key={String(r.categoryId)}>
                  <Link
                    href={drillable ? href({ parent: r.categoryId }) : txHref(r.categoryId)}
                    className="flex items-center gap-3 py-2.5 hover:bg-surface-2"
                  >
                    <span className="w-12 shrink-0 rounded-md py-0.5 text-center text-xs font-semibold text-white tabular" style={{ background: i < SERIES.length ? colorOf(i) : OTHER }}>
                      {Math.round(r.share * 100)}%
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{name(r.categoryId)}</span>
                    <span className="text-xs text-muted">{r.count}×</span>
                    <Amount minor={r.total} currency={base.code} className="text-sm font-semibold" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {rows.length > 0 && (
        <Link href={txHref(parent)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong">
          <List size={16} /> See these transactions
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Last 12 months</h2>
        <Card className="p-5">
          <GroupedBars
            currency={base}
            series={[
              { key: "income", label: "Income", color: "var(--income)" },
              { key: "expense", label: "Expenses", color: "var(--expense)" },
            ]}
            groups={trend.map((t) => ({
              key: t.bucket,
              label: new Date(`${t.bucket}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" }),
              values: [
                { series: "income", value: t.totals.income },
                { series: "expense", value: t.totals.expense },
              ],
            }))}
            onSelect={(m) => router.push(`/stats?a=${m}-01`)}
          />
          <table className="sr-only">
            <caption>Income and expenses per month</caption>
            <tbody>
              {trend.map((t) => (
                <tr key={t.bucket}>
                  <th>{t.bucket}</th>
                  <td>{t.totals.income}</td>
                  <td>{t.totals.expense}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted">Amounts in {base.code} at your current exchange rates. Transfers and balance adjustments are not income or spending.</p>
      </section>
    </div>
  );
}
