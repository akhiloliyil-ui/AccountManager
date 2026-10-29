import type { Fils } from "./money";

export type BudgetStatus = "ok" | "warning" | "over";

export interface BudgetSummary {
  budgetFils: Fils;
  spentFils: Fils;
  projectedFils: Fils;
  remainingFils: Fils;
  /** Where spend "should" be today if spread evenly over the month. */
  paceFils: Fils;
  status: BudgetStatus;
}

export function summarizeBudget(input: {
  budgetFils: Fils;
  spentFils: Fils;
  /** Planned cost of items not yet bought. */
  plannedRemainingFils: Fils;
  date: Date;
}): BudgetSummary {
  const { budgetFils, spentFils, plannedRemainingFils, date } = input;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const projectedFils = spentFils + plannedRemainingFils;
  const status: BudgetStatus =
    projectedFils > budgetFils ? "over" : projectedFils > budgetFils * 0.8 ? "warning" : "ok";

  return {
    budgetFils,
    spentFils,
    projectedFils,
    remainingFils: budgetFils - spentFils,
    paceFils: Math.round((budgetFils * date.getDate()) / daysInMonth),
    status,
  };
}
