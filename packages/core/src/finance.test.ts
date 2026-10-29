import { describe, expect, it } from "vitest";
import {
  addMonths,
  balances,
  categoryBreakdown,
  convertMinor,
  formatCurrency,
  lastMonthEnds,
  netWorth,
  netWorthSeries,
  parseAmount,
  periodRange,
  runningBalance,
  schedulePayments,
  shiftPeriod,
  totals,
  trendBy,
  type Currency,
  type LedgerAccount,
  type LedgerTx,
  type StatTx,
} from "./index";

const AED: Currency = { code: "AED", name: "UAE Dirham", symbol: "DH", decimals: 2, perBase: 1 };
const INR: Currency = { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, perBase: 24 };
const currencies = new Map([AED, INR].map((c) => [c.code, c]));

describe("currency", () => {
  it("converts through the base rate", () => {
    expect(convertMinor(10000, AED, INR)).toBe(240000); // AED 100 = INR 2,400
    expect(convertMinor(240000, INR, AED)).toBe(10000);
    expect(convertMinor(100, INR, AED)).toBe(4); // INR 1 = AED 0.0417 -> 4 fils
  });

  it("formats with code or symbol", () => {
    expect(formatCurrency(1740046, AED)).toBe("AED 17,400.46");
    expect(formatCurrency(-6644609, INR, { useSymbol: true })).toBe("-₹ 66,446.09");
    expect(formatCurrency(500, AED, { signed: true })).toBe("+AED 5.00");
  });

  it.each([
    ["1,234.50", 1234.5],
    ["(12.00)", -12],
    ["-12", -12],
    ["12.00 DR", -12],
    ["12.00 CR", 12],
    ["AED 1,234", 1234],
    ["1.234,50", 1234.5],
    ["₹ 66,446.09", 66446.09],
    ["250-", -250],
    ["", null],
    ["n/a", null],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});

describe("ledger", () => {
  const accounts: LedgerAccount[] = [
    { id: "salary", currency: "AED", openingBalance: 500000, includeInTotals: true },
    { id: "card", currency: "AED", openingBalance: 0, includeInTotals: true },
    { id: "esaf", currency: "INR", openingBalance: 2400000, includeInTotals: true },
    { id: "hidden", currency: "AED", openingBalance: 999900, includeInTotals: false },
  ];
  const txs: LedgerTx[] = [
    { type: "income", date: "2026-10-01", accountId: "salary", amount: 1050000 },
    { type: "expense", date: "2026-10-02", accountId: "card", amount: 3040 },
    { type: "transfer", date: "2026-10-05", accountId: "salary", toAccountId: "esaf", amount: 100000, toAmount: 2400000 },
    { type: "transfer", date: "2026-10-27", accountId: "salary", toAccountId: "card", amount: 3040 },
    { type: "adjustment", date: "2026-11-01", accountId: "salary", amount: -100 },
  ];

  it("applies income, expense, cross-currency transfers and adjustments", () => {
    const b = balances(accounts, txs);
    expect(b.get("salary")).toBe(500000 + 1050000 - 100000 - 3040 - 100);
    expect(b.get("card")).toBe(0);
    expect(b.get("esaf")).toBe(4800000);
  });

  it("stops at the as-of date", () => {
    expect(balances(accounts, txs, "2026-10-02").get("card")).toBe(-3040);
  });

  it("splits net worth into assets and liabilities in the base currency", () => {
    const b = balances(accounts, txs, "2026-10-02");
    const worth = netWorth(accounts, b, currencies, AED);
    // salary 15,500 + esaf INR 24,000 (= AED 1,000); card -30.40; hidden excluded
    expect(worth).toEqual({ assets: 1650000, liabilities: -3040, total: 1646960 });
  });

  it("builds a month-end series", () => {
    const series = netWorthSeries(accounts, txs, currencies, AED, lastMonthEnds("2026-10-15", 2));
    expect(series.map((s) => s.date)).toEqual(["2026-09-30", "2026-10-31"]);
    expect(series[0]!.worth.total).toBe(600000);
  });

  it("computes a running balance", () => {
    const rows = runningBalance(accounts[1]!, txs.filter((t) => t.accountId === "card" || t.toAccountId === "card"));
    expect(rows.map((r) => r.balance)).toEqual([-3040, 0]);
  });
});

describe("stats", () => {
  const tx = (type: StatTx["type"], amountBase: number, categoryId: string | null, parent = categoryId, date = "2026-10-10"): StatTx => ({
    type,
    date,
    amountBase,
    categoryId,
    parentCategoryId: parent,
  });
  const txs = [
    tx("income", 1050000, "salary"),
    tx("expense", 664427, "utility"),
    tx("expense", 598580, "loan"),
    tx("expense", 2734, "grocery", "shopping"),
    tx("expense", 156073, "online", "shopping"),
    tx("expense", 1000, null),
    tx("transfer", 249100, null),
    tx("expense", 5000, "utility", "utility", "2026-09-30"),
  ];

  it("excludes transfers from totals", () => {
    expect(totals(txs.slice(0, 7))).toEqual({ income: 1050000, expense: 1422814, net: 1050000 - 1422814 });
  });

  it("ranks top-level categories with shares", () => {
    const rows = categoryBreakdown(txs.slice(0, 7), "expense");
    expect(rows.map((r) => r.categoryId)).toEqual(["utility", "loan", "shopping", null]);
    expect(rows[2]!.total).toBe(158807);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });

  it("drills into subcategories", () => {
    const rows = categoryBreakdown(txs, "expense", "shopping");
    expect(rows.map((r) => [r.categoryId, r.total])).toEqual([
      ["online", 156073],
      ["grocery", 2734],
    ]);
  });

  it("groups a trend by month", () => {
    const trend = trendBy(txs, ["2026-09", "2026-10"], (d) => d.slice(0, 7));
    expect(trend[0]!.totals.expense).toBe(5000);
    expect(trend[1]!.totals.income).toBe(1050000);
  });
});

describe("dates and schedules", () => {
  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("ranges and shifts periods", () => {
    expect(periodRange("week", "2026-10-29")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(periodRange("month", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(shiftPeriod("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftPeriod("year", "2026-06-01", -1)).toBe("2025-01-01");
  });

  it("splits installments exactly and keeps the start day", () => {
    const plan = schedulePayments({ mode: "installment", amount: 26300, count: 4, startDate: "2026-01-31", frequency: "monthly" });
    expect(plan.map((p) => p.amount)).toEqual([6575, 6575, 6575, 6575]);
    expect(plan.map((p) => p.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    const uneven = schedulePayments({ mode: "installment", amount: 10000, count: 3, startDate: "2026-10-01", frequency: "monthly" });
    expect(uneven.map((p) => p.amount)).toEqual([3334, 3333, 3333]);
  });

  it("repeats weekly at the full amount", () => {
    const plan = schedulePayments({ mode: "repeat", amount: 5000, count: 3, startDate: "2026-10-29", frequency: "weekly" });
    expect(plan.map((p) => [p.date, p.amount])).toEqual([
      ["2026-10-29", 5000],
      ["2026-11-05", 5000],
      ["2026-11-12", 5000],
    ]);
  });
});

describe("bill due dates", () => {
  it("sorts payments into overdue, today, this week and later", async () => {
    const { billDue, daysBetween } = await import("./schedule");
    expect(billDue("2026-10-28", "2026-10-29")).toBe("overdue");
    expect(billDue("2026-10-29", "2026-10-29")).toBe("today");
    expect(billDue("2026-11-05", "2026-10-29")).toBe("week");
    expect(billDue("2026-11-06", "2026-10-29")).toBe("later");
    expect(daysBetween("2026-10-26", "2026-10-29")).toBe(3);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});
