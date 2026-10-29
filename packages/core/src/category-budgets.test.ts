import { describe, expect, it } from "vitest";
import { budgetStatus, categoryBudgetReport, monthPace } from "./category-budgets";
import type { StatTx } from "./stats";

const tx = (amountBase: number, categoryId: string | null, parentCategoryId: string | null, type: StatTx["type"] = "expense"): StatTx => ({
  type,
  date: "2026-10-10",
  amountBase,
  categoryId,
  parentCategoryId,
});

describe("category budgets", () => {
  it("measures the month's pace", () => {
    expect(monthPace("2026-10-01", "2026-09-30")).toBe(0);
    expect(monthPace("2026-10-01", "2026-10-31")).toBe(1);
    expect(monthPace("2026-10-01", "2026-11-02")).toBe(1);
    expect(monthPace("2026-10-01", "2026-10-15")).toBeCloseTo(15 / 31);
  });

  it("flags over, close and ahead-of-pace budgets", () => {
    expect(budgetStatus(1001, 1000, 0.5)).toBe("over");
    expect(budgetStatus(900, 1000, 1)).toBe("warning");
    expect(budgetStatus(700, 1000, 0.5)).toBe("warning");
    expect(budgetStatus(550, 1000, 0.5)).toBe("ok");
    expect(budgetStatus(300, 1000, 0)).toBe("ok");
  });

  it("adds subcategories into a parent budget without counting them twice", () => {
    const report = categoryBudgetReport(
      [
        { categoryId: "food", parentCategoryId: "food", amount: 100000 },
        { categoryId: "food--eating-out", parentCategoryId: "food", amount: 30000 },
        { categoryId: "transport--fuel", parentCategoryId: "transport", amount: 40000 },
      ],
      [
        tx(20000, "food--groceries", "food"),
        tx(35000, "food--eating-out", "food"),
        tx(5000, "food", "food"),
        tx(10000, "transport--fuel", "transport"),
        tx(8000, "transport--taxi", "transport"),
        tx(12000, null, null),
        tx(99999, "salary", "salary", "income"),
      ],
      0.5,
    );
    const by = Object.fromEntries(report.lines.map((l) => [l.categoryId, l]));
    expect(by.food).toMatchObject({ spent: 60000, remaining: 40000, status: "ok" });
    expect(by["food--eating-out"]).toMatchObject({ spent: 35000, remaining: -5000, status: "over" });
    expect(by["transport--fuel"]).toMatchObject({ spent: 10000, status: "ok" });
    expect(report.totalBudget).toBe(140000);
    expect(report.totalSpent).toBe(70000);
    expect(report.unbudgetedSpent).toBe(20000);
  });
});
