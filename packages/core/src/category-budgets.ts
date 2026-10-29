import type { Minor } from "./currency";
import { monthEndOf, monthStartOf, parseIso } from "./dates";
import type { StatTx } from "./stats";

/** A monthly spending limit for an expense category (and, for a top-level category, its subcategories). */
export interface CategoryBudget {
  categoryId: string;
  /** Top-level category it belongs to; equals categoryId for a top-level category. */
  parentCategoryId: string;
  /** Base-currency minor units per month. */
  amount: Minor;
}

export type CategoryBudgetStatus = "ok" | "warning" | "over";

export interface CategoryBudgetLine extends CategoryBudget {
  spent: Minor;
  remaining: Minor;
  /** spent / amount; above 1 when over. */
  ratio: number;
  status: CategoryBudgetStatus;
}

export interface CategoryBudgetReport {
  lines: CategoryBudgetLine[];
  /** Budgets without double counting a subcategory whose parent has its own budget. */
  totalBudget: Minor;
  totalSpent: Minor;
  /** Expenses in categories with no budget. */
  unbudgetedSpent: Minor;
  /** How far through the month `today` is: 0 before it starts, 1 once it has ended. */
  pace: number;
}

/** Share of the month gone by: where spending would be if spread evenly. */
export function monthPace(month: string, today: string): number {
  const start = monthStartOf(month);
  const end = monthEndOf(month);
  if (today < start) return 0;
  if (today > end) return 1;
  return parseIso(today).getDate() / parseIso(end).getDate();
}

/**
 * "over" once the limit is passed; "warning" at 90% or when running well ahead of the month's pace
 * (more than 10% of the budget above it, once at least half is spent).
 */
export function budgetStatus(spent: Minor, amount: Minor, pace: number): CategoryBudgetStatus {
  if (spent > amount) return "over";
  if (spent >= amount * 0.9 || (spent >= amount * 0.5 && spent > amount * (pace + 0.1))) return "warning";
  return "ok";
}

/** Spending against each budget for one month; `txs` are that month's transactions in the base currency. */
export function categoryBudgetReport(budgets: CategoryBudget[], txs: StatTx[], pace: number): CategoryBudgetReport {
  const expenses = txs.filter((t) => t.type === "expense");
  const budgeted = new Set(budgets.map((b) => b.categoryId));

  const lines = budgets.map((b) => {
    const topLevel = b.categoryId === b.parentCategoryId;
    const spent = expenses
      .filter((t) => (topLevel ? t.parentCategoryId === b.categoryId : t.categoryId === b.categoryId))
      .reduce((s, t) => s + t.amountBase, 0);
    return {
      ...b,
      spent,
      remaining: b.amount - spent,
      ratio: b.amount > 0 ? spent / b.amount : 0,
      status: budgetStatus(spent, b.amount, pace),
    };
  });

  // A subcategory budget inside a budgeted parent is a slice of the parent's, not extra money.
  const counted = lines.filter((l) => l.categoryId === l.parentCategoryId || !budgeted.has(l.parentCategoryId));
  const covered = (t: StatTx) => (t.parentCategoryId !== null && budgeted.has(t.parentCategoryId)) || (t.categoryId !== null && budgeted.has(t.categoryId));

  return {
    lines,
    totalBudget: counted.reduce((s, l) => s + l.amount, 0),
    totalSpent: counted.reduce((s, l) => s + l.spent, 0),
    unbudgetedSpent: expenses.filter((t) => !covered(t)).reduce((s, t) => s + t.amountBase, 0),
    pace,
  };
}
