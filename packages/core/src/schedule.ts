import type { Minor } from "./currency";
import { addDays, addMonths, parseIso } from "./dates";

export interface ScheduleInput {
  /** "installment" splits `amount` into `count` parts; "repeat" charges `amount` every time. */
  mode: "installment" | "repeat";
  amount: Minor;
  count: number;
  startDate: string;
  frequency: "monthly" | "weekly";
}

export interface ScheduledPayment {
  n: number;
  count: number;
  date: string;
  amount: Minor;
}

/**
 * Dates and amounts for an installment plan or a repeating transaction (Money Manager's
 * "Rep/Inst."). Installment remainders go on the first payment so the parts add up exactly.
 * Monthly dates keep the start day where the month allows (31st -> 30th/28th).
 */
export function schedulePayments({ mode, amount, count, startDate, frequency }: ScheduleInput): ScheduledPayment[] {
  if (!Number.isInteger(count) || count < 1 || count > 360) throw new Error("count must be between 1 and 360");
  const startDay = parseIso(startDate).getDate();
  const base = mode === "installment" ? Math.trunc(amount / count) : amount;
  const remainder = mode === "installment" ? amount - base * count : 0;

  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    count,
    date: frequency === "monthly" ? addMonths(startDate, i, startDay) : addDays(startDate, i * 7),
    amount: base + (i === 0 ? remainder : 0),
  }));
}

/** "Monthly EMI" + (3/12) -> "Monthly EMI (3/12)". */
export function installmentLabel(note: string, n: number, count: number): string {
  return `${note.trim() || "Installment"} (${n}/${count})`;
}

export type BillDue = "overdue" | "today" | "week" | "later";

/** Where an unpaid scheduled payment sits: past its date, due today, within the next 7 days, or later. */
export function billDue(date: string, today: string): BillDue {
  if (date < today) return "overdue";
  if (date === today) return "today";
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= 7 ? "week" : "later";
}

/** Whole days between two ISO dates (positive when `date` is before `today`). */
export function daysBetween(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}
