/** Calendar helpers on ISO "YYYY-MM-DD" strings, free of time zones. */

export type Period = "week" | "month" | "year";

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d ?? 1);
}

export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return isoDate(parseIso(iso)) === iso;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Adds months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number, preferredDay?: number): string {
  const d = parseIso(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const day = Math.min(preferredDay ?? d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return isoDate(new Date(target.getFullYear(), target.getMonth(), day));
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEndOf(iso: string): string {
  const d = parseIso(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth())));
}

export interface PeriodRange {
  start: string;
  /** Inclusive. */
  end: string;
}

export function periodRange(period: Period, anchor: string): PeriodRange {
  switch (period) {
    case "week": {
      const start = weekStartOf(anchor);
      return { start, end: addDays(start, 6) };
    }
    case "month":
      return { start: monthStartOf(anchor), end: monthEndOf(anchor) };
    case "year":
      return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  }
}

export function shiftPeriod(period: Period, anchor: string, steps: number): string {
  const { start } = periodRange(period, anchor);
  if (period === "week") return addDays(start, steps * 7);
  if (period === "month") return addMonths(start, steps);
  return `${Number(start.slice(0, 4)) + steps}-01-01`;
}

/** Month-end dates for the `count` months ending with the month of `anchor`, oldest first. */
export function lastMonthEnds(anchor: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthEndOf(addMonths(monthStartOf(anchor), i - count + 1)));
}
