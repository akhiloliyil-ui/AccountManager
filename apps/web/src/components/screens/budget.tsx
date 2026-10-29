"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { aedToFils } from "@gpa/core";
import { updateGrocerySettingsAction } from "@/app/actions/grocery";
import { monthBudget } from "@/lib/grocery";
import type { GroceryList } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { GroceryNav } from "../grocery-nav";
import { useApp } from "../providers";
import { Amount, Badge, BudgetRing, Button, Card, Money, PageHeader, SectionTitle } from "../ui";

export interface GrocerySpend {
  spentFils: number;
  fromBasketFils: number;
  otherFils: number;
  count: number;
}

export function BudgetScreen({ lists, spend }: { lists: GroceryList[]; spend: GrocerySpend }) {
  const { catalog, settings, today, groceryCategoryById, categoryById } = useApp();
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(settings.groceryBudgetFils / 100));

  const { summary, byList, byCategory } = monthBudget(lists, catalog, settings.preferredStoreIds, settings.groceryBudgetFils, spend.spentFils, today);
  const month = new Date(`${today}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const categoryMax = Math.max(...categoryRows.map(([, v]) => v), 1);
  const groceryCategory = categoryById.get(settings.groceryCategoryId);
  const statusBadge = {
    ok: <Badge tone="primary">On track</Badge>,
    warning: <Badge tone="offer">Over 80% planned</Badge>,
    over: <Badge tone="danger">Over budget</Badge>,
  }[summary.status];

  return (
    <div className="space-y-8">
      <div>
        <GroceryNav />
        <PageHeader title="Grocery budget" subtitle={month} />
      </div>

      <Card className="flex flex-col items-center gap-6 p-6 md:flex-row md:gap-10 md:p-8">
        <BudgetRing spent={summary.spentFils} projected={summary.projectedFils} budget={summary.budgetFils} status={summary.status} size={184}>
          <span className="text-xs text-muted">Left to spend</span>
          <Money fils={summary.remainingFils} className="text-xl font-semibold" />
        </BudgetRing>

        <div className="w-full flex-1 space-y-4">
          <div className="flex items-center justify-between">
            {statusBadge}
            {!editing && (
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong">
                <Pencil size={14} /> Edit budget
              </button>
            )}
          </div>

          {editing && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const aed = Number(draft);
                if (!Number.isFinite(aed) || aed < 0) return;
                run(() => updateGrocerySettingsAction({ groceryBudgetFils: aedToFils(aed) }), { onDone: () => setEditing(false) });
              }}
            >
              <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
                <span className="text-sm text-muted">AED</span>
                <input
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Monthly grocery budget in AED"
                  className="tabular h-full flex-1 bg-transparent outline-none"
                  autoFocus
                />
              </label>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </form>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Monthly budget" fils={summary.budgetFils} />
            <Stat label="Spent (from your ledger)" fils={summary.spentFils} />
            <Stat label="Projected" fils={summary.projectedFils} />
            <Stat label="Even pace today" fils={summary.paceFils} />
          </dl>
          <p className="text-xs text-muted">
            Spent counts every expense in{" "}
            <Link href={`/transactions?category=${settings.groceryCategoryId}`} className="font-medium text-text underline">
              {groceryCategory?.name ?? "the grocery category"}
            </Link>{" "}
            this month: <Money fils={spend.fromBasketFils} /> from confirmed baskets, <Money fils={spend.otherFils} /> entered or imported directly.
          </p>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle title="Planned by category" />
          <Card className="space-y-4 p-5">
            {categoryRows.map(([id, fils]) => (
              <div key={id}>
                <div className="flex justify-between text-sm">
                  <span>{groceryCategoryById.get(id)?.name ?? "Other"}</span>
                  <Money fils={fils} className="font-medium" />
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(fils / categoryMax) * 100}%` }} />
                </div>
              </div>
            ))}
            {categoryRows.length === 0 && <p className="text-sm text-muted">No planned items this month.</p>}
          </Card>
        </section>

        <section>
          <SectionTitle title="Lists this month" />
          <Card className="divide-y divide-border">
            {byList.map(({ list, boughtCount, remainingFils, paidMinor }) => (
              <Link key={list.id} href={`/lists/${list.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{list.name}</p>
                  <p className="text-xs text-muted">
                    {boughtCount} of {list.items.length} bought
                    {paidMinor.map((p, i) => (
                      <span key={i}>
                        {" · paid "}
                        <Amount minor={p.amount} currency={p.currency} />
                      </span>
                    ))}
                  </p>
                </div>
                <div className="text-right">
                  <Money fils={remainingFils} className="text-sm font-semibold" />
                  <p className="text-[11px] text-muted">still planned</p>
                </div>
              </Link>
            ))}
            {byList.length === 0 && <p className="px-5 py-4 text-sm text-muted">No weekly or monthly lists this month.</p>}
          </Card>
          <p className="mt-3 text-xs text-muted">Tick items while shopping, then Confirm purchase on the list to book what you paid.</p>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, fils }: { label: string; fils: number }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">
        <Money fils={fils} />
      </dd>
    </div>
  );
}
