"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { NotebookText, Plus, Search, X } from "lucide-react";
import { addMonths, monthStartOf, parseIso } from "@gpa/core";
import type { AccountView, TxView } from "@/lib/types";
import { categoryOptions, monthLabel, TotalsBar, TxRow } from "../ledger";
import { useApp } from "../providers";
import { Amount, ButtonLink, Card, EmptyState, MonthNav, PageHeader, Segmented, Select } from "../ui";

export type TxViewMode = "daily" | "calendar" | "monthly";

export interface TransactionsData {
  view: TxViewMode;
  /** First day of the month (daily/calendar) or of the year (monthly). */
  anchor: string;
  txs: TxView[];
  accounts: AccountView[];
  filters: { account?: string; category?: string; q?: string };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TransactionsScreen({ data }: { data: TransactionsData }) {
  const { view, anchor, txs, accounts, filters } = data;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { today, categories, canWrite } = useApp();
  const [day, setDay] = useState<string | null>(null);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amountBase, 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountBase, 0);
  const step = view === "monthly" ? 12 : 1;
  const nav = (n: number) => href({ m: addMonths(anchor, n * step).slice(0, 7) });
  const shown = day ? txs.filter((t) => t.date === day) : txs;
  const filtered = !!(filters.account || filters.category || filters.q);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        action={
          <ButtonLink href={`/transactions/new${day ? `?date=${day}` : ""}`} variant="expense" className={clsx("hidden shrink-0", canWrite && "md:inline-flex")}>
            <Plus size={18} /> Add
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav label={view === "monthly" ? anchor.slice(0, 4) : monthLabel(anchor)} prevHref={nav(-1)} nextHref={nav(1)} />
        <Segmented
          label="View"
          value={view}
          onChange={(v) => {
            setDay(null);
            router.replace(href({ view: v === "daily" ? null : v }));
          }}
          options={[
            { value: "daily", label: "Daily" },
            { value: "calendar", label: "Calendar" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
      </div>

      <Filters filters={filters} accounts={accounts} categories={categories} onChange={(patch) => router.replace(href(patch))} />

      <TotalsBar income={income} expense={expense} />

      {view === "monthly" ? (
        <MonthlyView txs={txs} year={anchor.slice(0, 4)} hrefFor={(m) => href({ view: null, m })} />
      ) : (
        <>
          {view === "calendar" && <CalendarView anchor={anchor} txs={txs} today={today} selected={day} onSelect={setDay} />}
          {day && (
            <button onClick={() => setDay(null)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
              <X size={14} /> Showing {parseIso(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} only
            </button>
          )}
          {shown.length ? (
            <DailyList txs={shown} accountById={accountById} />
          ) : (
            <EmptyState
              icon={<NotebookText size={22} />}
              title={filtered ? "Nothing matches these filters" : "No transactions this month"}
              body={filtered ? "Clear a filter or look at another month." : "Add one with the + button, or import a bank statement."}
              action={canWrite && <ButtonLink href="/transactions/new">Add transaction</ButtonLink>}
            />
          )}
        </>
      )}
    </div>
  );
}

function Filters({
  filters,
  accounts,
  categories,
  onChange,
}: {
  filters: TransactionsData["filters"];
  accounts: AccountView[];
  categories: ReturnType<typeof useApp>["categories"];
  onChange: (patch: Record<string, string | null>) => void;
}) {
  const [q, setQ] = useState(filters.q ?? "");
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
      <Select aria-label="Account" value={filters.account ?? ""} onChange={(e) => onChange({ account: e.target.value || null })}>
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Category" value={filters.category ?? ""} onChange={(e) => onChange({ category: e.target.value || null })}>
        <option value="">All categories</option>
        {(["expense", "income"] as const).map((kind) => (
          <optgroup key={kind} label={kind === "expense" ? "Expense" : "Income"}>
            {categoryOptions(categories, kind).map(({ parent, children }) => [
              <option key={parent.id} value={parent.id}>
                {parent.emoji ? `${parent.emoji} ` : ""}
                {parent.name}
              </option>,
              ...children.map((c) => (
                <option key={c.id} value={c.id}>
                  {"   "}
                  {c.name}
                </option>
              )),
            ])}
          </optgroup>
        ))}
      </Select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ q: q.trim() || null });
        }}
        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary"
      >
        <Search size={16} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search note or description"
          aria-label="Search transactions"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {filters.q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              onChange({ q: null });
            }}
            className="text-muted"
          >
            <X size={16} />
          </button>
        )}
      </form>
    </div>
  );
}

function DailyList({ txs, accountById }: { txs: TxView[]; accountById: Map<string, AccountView> }) {
  const days = new Map<string, TxView[]>();
  for (const t of txs) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  const { base } = useApp();

  return (
    <div className="space-y-3">
      {[...days.entries()].map(([date, list]) => {
        const d = parseIso(date);
        const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amountBase, 0);
        const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountBase, 0);
        return (
          <Card key={date} className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <span className="text-2xl font-semibold tabular">{d.getDate()}</span>
              <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium text-surface">
                {d.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span className="text-xs text-muted">{d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span>
              <span className="ml-auto flex gap-4 text-sm">
                {inc > 0 && <Amount minor={inc} currency={base.code} tone="income" />}
                {exp > 0 && <Amount minor={exp} currency={base.code} tone="expense" />}
              </span>
            </div>
            <div className="divide-y divide-border">
              {list.map((t) => (
                <TxRow key={t.id} tx={t} accountById={accountById} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function compact(minor: number) {
  const major = Math.abs(minor) / 100;
  return major >= 10000 ? `${(major / 1000).toFixed(0)}k` : major >= 1000 ? `${(major / 1000).toFixed(1)}k` : major.toFixed(0);
}

function CalendarView({
  anchor,
  txs,
  today,
  selected,
  onSelect,
}: {
  anchor: string;
  txs: TxView[];
  today: string;
  selected: string | null;
  onSelect: (d: string | null) => void;
}) {
  const start = parseIso(monthStartOf(anchor));
  const lead = (start.getDay() + 6) % 7;
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const sums = new Map<string, { inc: number; exp: number }>();
  for (const t of txs) {
    const s = sums.get(t.date) ?? { inc: 0, exp: 0 };
    if (t.type === "income") s.inc += t.amountBase;
    if (t.type === "expense") s.exp += t.amountBase;
    sums.set(t.date, s);
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={clsx("py-2", i === 5 && "text-income", i === 6 && "text-expense")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} className="min-h-16 border-r border-b border-border bg-surface-2/50" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${anchor.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
          const s = sums.get(date);
          return (
            <button
              key={date}
              onClick={() => onSelect(selected === date ? null : date)}
              aria-pressed={selected === date}
              aria-label={date}
              className={clsx(
                "flex min-h-16 flex-col items-start border-r border-b border-border p-1.5 text-left text-[11px] hover:bg-surface-2",
                selected === date && "bg-primary-soft",
              )}
            >
              <span className={clsx("font-medium", date === today && "rounded bg-text px-1 text-bg")}>{i + 1}</span>
              {s?.inc ? <span className="tabular text-income">{compact(s.inc)}</span> : null}
              {s?.exp ? <span className="tabular text-expense">{compact(s.exp)}</span> : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function MonthlyView({ txs, year, hrefFor }: { txs: TxView[]; year: string; hrefFor: (m: string) => string }) {
  const { base } = useApp();
  const router = useRouter();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).reverse();
  return (
    <Card className="divide-y divide-border">
      {months.map((m) => {
        const list = txs.filter((t) => t.date.startsWith(m));
        const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amountBase, 0);
        const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amountBase, 0);
        return (
          <button key={m} onClick={() => router.push(hrefFor(m))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
            <span className="w-24 font-medium">{monthLabel(m, "long").split(" ")[0]}</span>
            <span className="flex flex-1 flex-wrap justify-end gap-x-5 gap-y-1 text-sm">
              <Amount minor={inc} currency={base.code} tone="income" />
              <Amount minor={exp} currency={base.code} tone="expense" />
              <Amount minor={inc - exp} currency={base.code} className="w-32 text-right font-semibold" />
            </span>
          </button>
        );
      })}
    </Card>
  );
}
