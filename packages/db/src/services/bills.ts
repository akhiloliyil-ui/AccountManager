import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { addDays, billDue, daysBetween, todayIso, type BillDue } from "@gpa/core";
import type { Db } from "../client";
import { transactions } from "../schema";
import { inScope, listTransactions, type AccountScope, type TxView } from "./money";

/**
 * Bills are scheduled payments (repeats and installments) nobody has confirmed as paid yet. They count in balances
 * from their date as before; this only reminds you to check each one went through.
 */

export interface Bill extends TxView {
  due: BillDue;
  /** Days past the date; 0 when due today or later. */
  daysLate: number;
}

export async function getBills(db: Db, today = todayIso(), accountIds?: AccountScope, horizonDays = 31): Promise<Bill[]> {
  const rows = await listTransactions(db, { to: addDays(today, horizonDays), unpaidBills: true, accountIds });
  return rows.reverse().map((t) => ({ ...t, due: billDue(t.date, today), daysLate: Math.max(0, daysBetween(t.date, today)) }));
}

/** Bills on or past their date: what the app icon badge counts. */
export async function countDueBills(db: Db, today = todayIso(), accountIds?: AccountScope): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.scheduleId),
        isNull(transactions.paidAt),
        isNull(transactions.parentId),
        lte(transactions.date, today),
        accountIds ? sql`(${inScope(accountIds, transactions.accountId)} or ${inScope(accountIds, transactions.toAccountId)})` : undefined,
      ),
    );
  return row?.n ?? 0;
}

/** Confirms a scheduled payment was paid, or puts it back on the bills list. */
export async function markBillPaid(db: Db, id: string, paid = true): Promise<void> {
  await db
    .update(transactions)
    .set({ paidAt: paid ? new Date() : null })
    .where(and(eq(transactions.id, id), isNotNull(transactions.scheduleId)));
}
