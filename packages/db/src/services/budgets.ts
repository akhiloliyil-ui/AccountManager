import { eq } from "drizzle-orm";
import { categoryBudgetReport, monthPace, monthEndOf, monthStartOf, todayIso, type CategoryBudget, type CategoryBudgetReport } from "@gpa/core";
import type { Db } from "../client";
import { budgets, categories } from "../schema";
import { assertAdmin, type Access } from "./auth";
import { statTransactions, ValidationError, type AccountScope } from "./money";

/** Monthly budgets per expense category. Admins set them; everyone sees progress on the accounts they can see. */

export async function listBudgets(db: Db): Promise<CategoryBudget[]> {
  const rows = await db
    .select({ categoryId: budgets.categoryId, amount: budgets.amount, parentId: categories.parentId })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id));
  return rows.map((r) => ({ categoryId: r.categoryId, parentCategoryId: r.parentId ?? r.categoryId, amount: r.amount }));
}

/** Sets a category's monthly budget; null or 0 removes it. */
export async function setBudget(db: Db, access: Access, categoryId: string, amount: number | null): Promise<void> {
  assertAdmin(access);
  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!cat) throw new ValidationError("Category not found");
  if (cat.kind !== "expense") throw new ValidationError("Budgets are for expense categories");
  if (!amount) {
    await db.delete(budgets).where(eq(budgets.categoryId, categoryId));
    return;
  }
  if (!Number.isInteger(amount) || amount < 0) throw new ValidationError("Enter a budget above zero");
  await db
    .insert(budgets)
    .values({ categoryId, amount })
    .onConflictDoUpdate({ target: budgets.categoryId, set: { amount, updatedAt: new Date() } });
}

/** One month's spending against every budget, on the accounts in scope. `month` is any date in that month. */
export async function getBudgetReport(db: Db, month: string, accountIds?: AccountScope, today = todayIso()): Promise<CategoryBudgetReport & { month: string }> {
  const start = monthStartOf(month);
  const [list, txs] = await Promise.all([listBudgets(db), statTransactions(db, { from: start, to: monthEndOf(month) }, accountIds)]);
  return { month: start, ...categoryBudgetReport(list, txs, monthPace(start, today)) };
}
