"use client";

import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, OctagonAlert, PiggyBank, Plus } from "lucide-react";
import { addMonths, toMinor, type CategoryBudgetLine, type CategoryBudgetReport, type CategoryBudgetStatus } from "@gpa/core";
import { setBudgetAction } from "@/app/actions/money";
import { evaluateAmount, minorToInput } from "@/lib/calc";
import { useAction } from "@/lib/use-action";
import { categoryOptions, monthLabel, useCategoryLabel } from "../ledger";
import { useApp } from "../providers";
import { Amount, BackLink, Button, ButtonLink, Card, EmptyState, Field, Input, MonthNav, PageHeader, SectionTitle, Select, Sheet } from "../ui";

type Report = CategoryBudgetReport & { month: string };

const STATUS: Record<CategoryBudgetStatus, { bar: string; text: string; icon: typeof CircleCheck; label: string }> = {
  ok: { bar: "bg-primary", text: "text-primary-strong", icon: CircleCheck, label: "On track" },
  warning: { bar: "bg-offer", text: "text-offer", icon: CircleAlert, label: "Close to the limit" },
  over: { bar: "bg-danger", text: "text-danger", icon: OctagonAlert, label: "Over budget" },
};

/** Spent against the limit, with a tick where spending would be if spread evenly over the month. */
export function BudgetBar({ ratio, pace, status }: { ratio: number; pace: number; status: CategoryBudgetStatus }) {
  return (
    <div className="relative h-2 rounded-full bg-[var(--ring-track)]">
      <div className={clsx("h-full rounded-full", STATUS[status].bar)} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      {pace > 0 && pace < 1 && <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-text/60" style={{ left: `${pace * 100}%` }} aria-hidden />}
    </div>
  );
}

function BudgetRow({ line, pace, onEdit }: { line: CategoryBudgetLine; pace: number; onEdit?: () => void }) {
  const { base } = useApp();
  const label = useCategoryLabel()(line.categoryId);
  const s = STATUS[line.status];
  const Icon = s.icon;
  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {label.emoji && <span className="mr-1.5">{label.emoji}</span>}
            {label.sub ? `${label.top} › ${label.sub}` : label.top}
          </p>
          <p className={clsx("flex items-center gap-1 text-xs", s.text)}>
            <Icon size={13} aria-hidden /> {s.label}
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p>
            <Amount minor={line.spent} currency={base.code} className="font-semibold" /> <span className="text-muted">of</span>{" "}
            <Amount minor={line.amount} currency={base.code} />
          </p>
          <p className={clsx("text-xs", line.remaining < 0 ? "text-danger" : "text-muted")}>
            {line.remaining < 0 ? "Over by " : ""}
            <Amount minor={Math.abs(line.remaining)} currency={base.code} />
            {line.remaining >= 0 ? " left" : ""}
          </p>
        </div>
      </div>
      <BudgetBar ratio={line.ratio} pace={pace} status={line.status} />
    </>
  );
  return onEdit ? (
    <button type="button" onClick={onEdit} className="block w-full px-4 py-3.5 text-left hover:bg-surface-2" aria-label={`Edit budget for ${label.sub ?? label.top}`}>
      {body}
    </button>
  ) : (
    <div className="px-4 py-3.5">{body}</div>
  );
}

const byUrgency = (a: CategoryBudgetLine, b: CategoryBudgetLine) => b.ratio - a.ratio;

export function BudgetsScreen({ report, limited }: { report: Report; limited: boolean }) {
  const { base, isAdmin, today } = useApp();
  const [editing, setEditing] = useState<CategoryBudgetLine | "new" | null>(null);
  const month = report.month.slice(0, 7);
  const nav = (n: number) => `/stats/budgets?m=${addMonths(report.month, n).slice(0, 7)}`;
  const overall = report.totalBudget > 0 ? report.totalSpent / report.totalBudget : 0;
  const overallStatus: CategoryBudgetStatus = report.totalSpent > report.totalBudget ? "over" : overall >= 0.9 ? "warning" : "ok";
  const current = month === today.slice(0, 7);

  return (
    <div className="space-y-5">
      <BackLink href="/stats">Stats</BackLink>
      <PageHeader
        title="Budgets"
        subtitle={limited ? "Monthly limits for the household. Spending counts only the accounts you can see." : "Monthly limits per category."}
        action={
          isAdmin && (
            <Button onClick={() => setEditing("new")}>
              <Plus size={18} /> <span className="hidden sm:inline">Add budget</span>
            </Button>
          )
        }
      />
      <MonthNav label={monthLabel(report.month, "long")} prevHref={nav(-1)} nextHref={nav(1)} />

      {report.lines.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={22} />}
          title="No budgets yet"
          body={isAdmin ? "Set a monthly limit for Food, Transport, Rent or any expense category, and see how each month is going." : "An admin can set monthly limits per category in this screen."}
          action={isAdmin ? <Button onClick={() => setEditing("new")}>Add a budget</Button> : undefined}
        />
      ) : (
        <>
          <Card className="p-4">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Spent of budgeted</p>
                <p className="text-xl font-semibold">
                  <Amount minor={report.totalSpent} currency={base.code} /> <span className="text-base font-normal text-muted">of</span>{" "}
                  <Amount minor={report.totalBudget} currency={base.code} className="text-base font-normal" />
                </p>
              </div>
              {current && <p className="text-right text-xs text-muted">{Math.round(report.pace * 100)}% of the month gone</p>}
            </div>
            <BudgetBar ratio={overall} pace={report.pace} status={overallStatus} />
            {report.unbudgetedSpent > 0 && (
              <p className="mt-3 text-xs text-muted">
                Plus <Amount minor={report.unbudgetedSpent} currency={base.code} /> in categories without a budget.
              </p>
            )}
          </Card>

          <section>
            <SectionTitle title="By category" />
            <Card className="divide-y divide-border">
              {[...report.lines].sort(byUrgency).map((l) => (
                <BudgetRow key={l.categoryId} line={l} pace={report.pace} onEdit={isAdmin ? () => setEditing(l) : undefined} />
              ))}
            </Card>
            {current && <p className="mt-2 text-xs text-muted">The tick on each bar marks where spending would be if spread evenly over the month.</p>}
          </section>
        </>
      )}

      {editing && <BudgetSheet line={editing === "new" ? null : editing} taken={report.lines.map((l) => l.categoryId)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetSheet({ line, taken, onClose }: { line: CategoryBudgetLine | null; taken: string[]; onClose: () => void }) {
  const { base, categories } = useApp();
  const { pending, run } = useAction();
  const [categoryId, setCategoryId] = useState(line?.categoryId ?? "");
  const [amountText, setAmountText] = useState(line ? minorToInput(line.amount, base.decimals) : "");
  const value = evaluateAmount(amountText);

  return (
    <Sheet open onClose={onClose} title={line ? "Edit budget" : "Add a budget"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!categoryId || value === null || value <= 0) return;
          run(() => setBudgetAction(categoryId, toMinor(value, base.decimals)), { success: "Budget saved", onDone: onClose });
        }}
      >
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!!line} required>
            <option value="">Choose a category</option>
            {categoryOptions(categories, "expense").map(({ parent, children }) => [
              <option key={parent.id} value={parent.id} disabled={taken.includes(parent.id) && parent.id !== line?.categoryId}>
                {parent.emoji ? `${parent.emoji} ` : ""}
                {parent.name} (all)
              </option>,
              ...children.map((c) => (
                <option key={c.id} value={c.id} disabled={taken.includes(c.id) && c.id !== line?.categoryId}>
                  {"   "}
                  {c.name}
                </option>
              )),
            ])}
          </Select>
        </Field>
        <Field label={`Monthly limit (${base.code})`} hint="A whole category's budget includes its subcategories.">
          <Input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1500" autoFocus={!!line} required />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={pending || !categoryId || value === null || value <= 0}>
            Save budget
          </Button>
          {line && (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => run(() => setBudgetAction(line.categoryId, null), { success: "Budget removed", onDone: onClose })}
            >
              Remove
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/** The three budgets closest to (or past) their limit, for Home. */
export function BudgetsCard({ report }: { report: Report }) {
  const { isAdmin } = useApp();
  if (!report.lines.length) {
    return isAdmin ? (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Set monthly limits for Food, Transport, Rent and more.</p>
        <ButtonLink href="/stats/budgets" variant="secondary">
          Set budgets
        </ButtonLink>
      </Card>
    ) : null;
  }
  const top = [...report.lines].sort(byUrgency).slice(0, 3);
  const over = report.lines.filter((l) => l.status === "over").length;
  return (
    <section>
      <SectionTitle
        title={over ? `Budgets · ${over} over` : "Budgets"}
        action={
          <Link href="/stats/budgets" className="text-sm font-medium text-primary-strong hover:underline">
            All budgets
          </Link>
        }
      />
      <Card className="divide-y divide-border">
        {top.map((l) => (
          <BudgetRow key={l.categoryId} line={l} pace={report.pace} />
        ))}
      </Card>
    </section>
  );
}
