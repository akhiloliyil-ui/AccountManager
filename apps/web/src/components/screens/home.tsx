"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { CalendarClock, ChevronRight, FileSpreadsheet, Receipt, Scale } from "lucide-react";
import type { NetWorth, Totals } from "@gpa/core";
import { monthBudget, quoteList } from "@/lib/grocery";
import type { AccountView, GroceryList, TxView } from "@/lib/types";
import { TxRow } from "../ledger";
import { OfferCard } from "../offer-card";
import { useApp } from "../providers";
import { Amount, BudgetRing, ButtonLink, Card, Money, SectionTitle, StoreName } from "../ui";
import type { GrocerySpend } from "./budget";

export interface HomeData {
  greeting: string;
  worth: NetWorth;
  month: Totals;
  recent: TxView[];
  upcoming: TxView[];
  accounts: AccountView[];
  lists: GroceryList[];
  spend: GrocerySpend;
  currentWeekId: string | null;
}

export function HomeScreen({ data }: { data: HomeData }) {
  const { greeting, worth, month, recent, upcoming, accounts, lists, spend, currentWeekId } = data;
  const { base, catalog, settings, today } = useApp();
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const { summary } = monthBudget(lists, catalog, settings.preferredStoreIds, settings.groceryBudgetFils, spend.spentFils, today);
  const week = lists.find((l) => l.id === currentWeekId);
  const open = week ? { items: week.items.filter((i) => !i.purchaseId) } : null;
  const quote = open ? quoteList(open, settings.preferredStoreIds, catalog.prices) : null;
  const basket = week?.items.filter((i) => i.checked && !i.purchaseId).length ?? 0;
  const bought = week?.items.filter((i) => i.purchaseId).length ?? 0;

  const myProducts = new Set(lists.filter((l) => l.type !== "saved").flatMap((l) => l.items.filter((i) => !i.purchaseId).map((i) => i.productId)));
  const forYou = catalog.offers.filter((o) => myProducts.has(o.productId) && settings.preferredStoreIds.includes(o.storeId));
  const monthName = new Date(`${today}T00:00:00`).toLocaleDateString("en-GB", { month: "long" });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">{greeting}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-[28px]">Your money and groceries</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/accounts" className="group">
          <Card className="h-full p-5 transition-colors group-hover:border-primary/40">
            <p className="text-sm text-muted">Net worth</p>
            <Amount minor={worth.total} currency={base.code} tone={worth.total < 0 ? "expense" : "none"} className="mt-1 block text-2xl font-semibold" />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stacked label="Assets" value={<Amount minor={worth.assets} currency={base.code} tone="income" />} />
              <Stacked label="Liabilities" value={<Amount minor={worth.liabilities} currency={base.code} tone="expense" />} />
            </div>
          </Card>
        </Link>
        <Link href="/stats" className="group">
          <Card className="h-full p-5 transition-colors group-hover:border-primary/40">
            <p className="text-sm text-muted">{monthName} so far</p>
            <Amount minor={month.net} currency={base.code} signed className="mt-1 block text-2xl font-semibold" />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stacked label="Income" value={<Amount minor={month.income} currency={base.code} tone="income" />} />
              <Stacked label="Expenses" value={<Amount minor={month.expense} currency={base.code} tone="expense" />} />
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/budget" className="group">
          <Card className="flex h-full items-center gap-5 p-5 transition-colors group-hover:border-primary/40">
            <BudgetRing spent={summary.spentFils} projected={summary.projectedFils} budget={summary.budgetFils} status={summary.status} size={120}>
              <span className="text-[11px] text-muted">Left</span>
              <Money fils={summary.remainingFils} className="text-sm font-semibold" />
            </BudgetRing>
            <div className="min-w-0 flex-1 space-y-2.5 text-sm">
              <p className="font-semibold">Grocery budget</p>
              <Row label="Spent" value={<Money fils={summary.spentFils} />} />
              <Row label="Planned" value={<Money fils={summary.projectedFils} />} />
              <Row label="Budget" value={<Money fils={summary.budgetFils} />} />
            </div>
          </Card>
        </Link>

        {week && quote ? (
          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{week.name}</p>
              <span className="text-sm text-muted">
                {bought} of {week.items.length} bought
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${week.items.length ? (bought / week.items.length) * 100 : 0}%` }} />
            </div>
            {basket > 0 ? (
              <Link href={`/lists/${week.id}`} className="mt-4 flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary-strong">
                <Receipt size={16} /> {basket} ticked item{basket > 1 ? "s" : ""} waiting to be booked
              </Link>
            ) : (
              quote.comparison.cheapest && (
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">Cheapest for the rest</p>
                    <StoreName storeId={quote.comparison.cheapest.storeId} className="mt-1 text-sm font-medium" />
                  </div>
                  <Money fils={quote.comparison.cheapest.estimatedFils} className="text-xl font-semibold" />
                </div>
              )
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <ButtonLink href={`/lists/${week.id}`} variant="secondary">
                Open list
              </ButtonLink>
              <ButtonLink href={`/compare?list=${week.id}`}>
                <Scale size={16} /> Compare
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-start justify-center gap-3 p-5">
            <p className="font-semibold">No list for this week yet</p>
            <ButtonLink href="/lists/current">Start this week&apos;s list</ButtonLink>
          </Card>
        )}
      </div>

      {upcoming.length > 0 && (
        <section>
          <SectionTitle
            title="Coming up"
            action={
              <Link href="/debts" className="text-sm font-medium text-primary-strong">
                Debts
              </Link>
            }
          />
          <Card className="divide-y divide-border">
            {upcoming.map((t) => (
              <Link key={t.id} href={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <CalendarClock size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.note || "Scheduled payment"} ({t.scheduleNo}/{t.scheduleCount})
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(`${t.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                    {accountById.get(t.accountId)?.name}
                  </p>
                </div>
                <Amount minor={t.amount} currency={t.currency} className="text-sm font-semibold" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle
          title="Recent transactions"
          action={
            <Link href="/transactions" className="text-sm font-medium text-primary-strong">
              All
            </Link>
          }
        />
        {recent.length ? (
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} accountById={accountById} />
            ))}
          </Card>
        ) : (
          <Link href="/import" className="block">
            <Card className="flex items-center gap-4 border-primary/25 bg-primary-soft/60 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
                <FileSpreadsheet size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Bring in your bank history</p>
                <p className="text-sm text-muted">Import a CSV or Excel statement, or add transactions with the + button.</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Card>
          </Link>
        )}
      </section>

      {forYou.length > 0 && (
        <section>
          <SectionTitle
            title="Deals on your lists"
            action={
              <Link href="/offers" className="text-sm font-medium text-primary-strong">
                All offers
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {forYou.slice(0, 3).map((o) => (
              <OfferCard key={`${o.storeId}-${o.productId}`} offer={o} weeklyListId={currentWeekId} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Stacked({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
