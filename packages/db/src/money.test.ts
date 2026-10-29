import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { categoryBreakdown, totals } from "@gpa/core";
import { ensureSeeded, migrate, rows, type DbHandle } from "./index";
import {
  createAccount,
  createAccountGroup,
  createCategory,
  createTransaction,
  deleteAccountGroup,
  deleteTransaction,
  getAccountDetail,
  getCurrencies,
  getDebts,
  getNetWorth,
  listAccounts,
  listCategories,
  listTransactions,
  setAccountBalance,
  setBaseCurrency,
  statTransactions,
  updateCurrency,
  updateTransaction,
  ValidationError,
} from "./services/money";
import { testDb } from "./test-utils";

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(() => h.close());

const balanceOf = async (id: string, asOf?: string) => (await listAccounts(h.db, { asOf })).find((a) => a.id === id)!.balance;

describe("schema and seed", () => {
  it("is idempotent", async () => {
    expect(await migrate(h.db)).toEqual([]);
    expect(await ensureSeeded(h.db)).toBe(false);
  });

  it("starts with Money Manager style groups, categories and AED + INR", async () => {
    const { base, rows: currencyRows } = await getCurrencies(h.db);
    expect(base.code).toBe("AED");
    expect(currencyRows.filter((c) => c.active).map((c) => c.code)).toEqual(["AED", "INR"]);
    const cats = await listCategories(h.db);
    const shopping = cats.find((c) => c.id === "e-shopping")!;
    expect(cats.filter((c) => c.parentId === shopping.id).map((c) => c.name)).toContain("Grocery");
    expect(cats.filter((c) => c.kind === "income" && !c.parentId)).toHaveLength(10);
    expect((await listAccounts(h.db)).map((a) => a.name)).toEqual(["Cash"]);
  });

  it("enforces transaction shape in the database itself", async () => {
    const [cash] = await listAccounts(h.db);
    await expect(
      h.db.execute(sql`insert into transactions (id, type, date, account_id, amount) values ('x', 'transfer', '2026-10-01', ${cash!.id}, 100)`),
    ).rejects.toThrow();
    await expect(
      h.db.execute(sql`insert into transactions (id, type, date, account_id, amount) values ('y', 'expense', '2026-10-01', ${cash!.id}, -5)`),
    ).rejects.toThrow();
  });
});

describe("transactions and balances", () => {
  let salary: string;
  let card: string;
  let esaf: string;

  beforeAll(async () => {
    salary = await createAccount(h.db, { groupId: "g-accounts", name: "Salary Account", currency: "AED", openingBalance: 500000 });
    card = await createAccount(h.db, { groupId: "g-card", name: "Mashreq Credit Card", currency: "AED" });
    esaf = await createAccount(h.db, { groupId: "g-savings", name: "ESAF (NRI)", currency: "INR" });
  });

  it("books income and expense", async () => {
    await createTransaction(h.db, { type: "income", date: "2026-10-01", accountId: salary, amount: 1050000, categoryId: "i-salary" });
    await createTransaction(h.db, { type: "expense", date: "2026-10-26", accountId: card, amount: 3040, categoryId: "e-food--family", note: "With family" });
    expect(await balanceOf(salary, "2026-10-31")).toBe(1550000);
    expect(await balanceOf(card, "2026-10-31")).toBe(-3040);
  });

  it("converts a cross-currency transfer and books its fee as an expense", async () => {
    const [id] = await createTransaction(h.db, {
      type: "transfer",
      date: "2026-10-05",
      accountId: salary,
      toAccountId: esaf,
      amount: 100000,
      feeAmount: 1500,
      note: "Remittance",
    });
    // AED 1,000 at 24.1 INR = INR 24,100
    expect(await balanceOf(esaf, "2026-10-31")).toBe(2410000);
    expect(await balanceOf(salary, "2026-10-31")).toBe(1550000 - 100000 - 1500);

    const view = (await listTransactions(h.db, { from: "2026-10-05", to: "2026-10-05" })).find((t) => t.id === id)!;
    expect(view).toMatchObject({ toCurrency: "INR", toAmount: 2410000, feeAmount: 1500, amountBase: 100000 });
    const fee = (await listTransactions(h.db, { from: "2026-10-05", to: "2026-10-05", types: ["expense"] }))[0]!;
    expect(fee).toMatchObject({ parentId: id, amount: 1500, categoryId: "e-other--bank-fee", note: "Fee: Remittance" });
  });

  it("replaces the fee when a transfer is edited and removes it with the transfer", async () => {
    const [id] = await createTransaction(h.db, { type: "transfer", date: "2026-10-06", accountId: salary, toAccountId: card, amount: 3040, feeAmount: 100 });
    await updateTransaction(h.db, id!, { type: "transfer", date: "2026-10-06", accountId: salary, toAccountId: card, amount: 3040, feeAmount: 250 });
    const fees = (await listTransactions(h.db, { from: "2026-10-06", to: "2026-10-06", types: ["expense"] })).map((t) => t.amount);
    expect(fees).toEqual([250]);
    await deleteTransaction(h.db, id!);
    expect(await listTransactions(h.db, { from: "2026-10-06", to: "2026-10-06" })).toEqual([]);
  });

  it("uses an explicit received amount for transfers", async () => {
    await createTransaction(h.db, { type: "transfer", date: "2026-10-07", accountId: esaf, toAccountId: salary, amount: 240000, toAmount: 9900 });
    expect(await balanceOf(esaf, "2026-10-31")).toBe(2410000 - 240000);
  });

  it("rejects bad input with a readable message", async () => {
    await expect(createTransaction(h.db, { type: "expense", date: "2026-10-01", accountId: card, amount: 0 })).rejects.toThrow(ValidationError);
    await expect(
      createTransaction(h.db, { type: "expense", date: "2026-10-01", accountId: card, amount: 100, categoryId: "i-salary" }),
    ).rejects.toThrow("Pick an expense category");
    await expect(
      createTransaction(h.db, { type: "transfer", date: "2026-10-01", accountId: card, toAccountId: card, amount: 100 }),
    ).rejects.toThrow("different account");
  });

  it("splits installments and deletes the following occurrences", async () => {
    const ids = await createTransaction(h.db, {
      type: "expense",
      date: "2026-10-30",
      accountId: card,
      amount: 26300,
      categoryId: "e-buy-now-pay-later--kitchen-accessories",
      note: "Kitchen accessories",
      schedule: { mode: "installment", count: 4, frequency: "monthly" },
    });
    const plan = (await listTransactions(h.db, { from: "2026-10-30", to: "2027-03-01" })).filter((t) => ids.includes(t.id)).reverse();
    expect(plan.map((t) => [t.date, t.amount, t.scheduleNo, t.scheduleCount])).toEqual([
      ["2026-10-30", 6575, 1, 4],
      ["2026-11-30", 6575, 2, 4],
      ["2026-12-30", 6575, 3, 4],
      ["2027-01-30", 6575, 4, 4],
    ]);
    expect(await deleteTransaction(h.db, ids[1]!, "following")).toBe(3);
    expect((await listTransactions(h.db, { from: "2026-10-30", to: "2027-03-01" })).filter((t) => ids.includes(t.id))).toHaveLength(1);
  });

  it("filters by category including subcategories, and by text", async () => {
    const food = await listTransactions(h.db, { categoryId: "e-food" });
    expect(food.map((t) => t.note)).toEqual(["With family"]);
    expect((await listTransactions(h.db, { q: "remit" })).map((t) => t.type).sort()).toEqual(["expense", "transfer"]);
  });

  it("reports income vs expense without transfers, by top-level category", async () => {
    const stats = await statTransactions(h.db, { from: "2026-10-01", to: "2026-10-31" });
    expect(totals(stats)).toEqual({ income: 1050000, expense: 3040 + 1500 + 6575, net: 1050000 - 11115 });
    expect(categoryBreakdown(stats, "expense").map((r) => r.categoryId)).toEqual(["e-buy-now-pay-later", "e-food", "e-other"]);
  });

  it("revalues an account with an adjustment", async () => {
    const funds = await createAccount(h.db, { groupId: "g-investments", name: "Mutual funds", currency: "INR", openingBalance: 25000000 });
    await setAccountBalance(h.db, { accountId: funds, balance: 25840000, date: "2026-10-15", note: "Market value" });
    const detail = (await getAccountDetail(h.db, funds))!;
    expect(detail.account.balance).toBe(25840000);
    expect(detail.adjustments).toBe(840000);
    expect(await setAccountBalance(h.db, { accountId: funds, balance: 25840000, date: "2026-10-15" })).toBeNull();
  });

  it("computes net worth in the base currency and after a base change", async () => {
    const worth = await getNetWorth(h.db, "2026-10-31");
    const accounts = await listAccounts(h.db, { asOf: "2026-10-31" });
    const positives = accounts.filter((a) => a.balanceBase > 0).reduce((s, a) => s + a.balanceBase, 0);
    expect(worth.assets).toBe(positives);
    expect(worth.liabilities).toBeLessThan(0);

    await updateCurrency(h.db, "INR", { perBase: 24 });
    await setBaseCurrency(h.db, "INR");
    const { base, byCode } = await getCurrencies(h.db);
    expect(base.code).toBe("INR");
    expect(byCode.get("AED")!.perBase).toBeCloseTo(1 / 24);
    const inInr = await getNetWorth(h.db, "2026-10-31");
    expect(Math.abs(inInr.total / 24 - (await getNetWorthAed()))).toBeLessThan(100);
    await setBaseCurrency(h.db, "AED");
    await updateCurrency(h.db, "INR", { perBase: 24.1 });

    async function getNetWorthAed() {
      const all = await listAccounts(h.db, { asOf: "2026-10-31" });
      return all.reduce((s, a) => s + (a.currency === "AED" ? a.balance : a.balance / 24), 0);
    }
  });

  it("lists debts with upcoming scheduled payments", async () => {
    const loan = await createAccount(h.db, { groupId: "g-loan", name: "NBD PL", currency: "AED", openingBalance: -11956800, limitAmount: 11956800 });
    await createTransaction(h.db, {
      type: "transfer",
      date: "2026-10-27",
      accountId: salary,
      toAccountId: loan,
      amount: 249100 * 3,
      schedule: { mode: "installment", count: 3, frequency: "monthly" },
      note: "Monthly EMI",
    });
    const debts = await getDebts(h.db, "2026-10-29");
    const nbd = debts.owed.find((a) => a.id === loan)!;
    expect(nbd.balance).toBe(-11956800 + 249100);
    expect(debts.owed.map((a) => a.id)).toContain(card);
    // The card's remaining BNPL installment and the loan's next two EMIs.
    expect(debts.upcoming.map((t) => t.date)).toEqual(["2026-10-30", "2026-11-27", "2026-12-27"]);
  });
});

describe("structure management", () => {
  it("refuses to delete a group that still has accounts", async () => {
    const group = await createAccountGroup(h.db, { name: "Crypto", type: "investment" });
    const acc = await createAccount(h.db, { groupId: group, name: "Wallet", currency: "AED" });
    await expect(deleteAccountGroup(h.db, group)).rejects.toThrow("Move or delete");
    await h.db.execute(sql`delete from accounts where id = ${acc}`);
    await deleteAccountGroup(h.db, group);
  });

  it("only nests subcategories one level, with the parent's kind", async () => {
    const parent = await createCategory(h.db, { kind: "expense", name: "Kids", emoji: "🧸" });
    const child = await createCategory(h.db, { kind: "expense", name: "Toys", parentId: parent });
    await expect(createCategory(h.db, { kind: "expense", name: "Lego", parentId: child })).rejects.toThrow("own subcategories");
    await expect(createCategory(h.db, { kind: "income", name: "Pocket money", parentId: parent })).rejects.toThrow("kind");
  });

  it("stores large rupee balances exactly", async () => {
    const id = await createAccount(h.db, { groupId: "g-savings", name: "FD", currency: "INR", openingBalance: 98765432109 });
    const [row] = rows<{ v: string }>(await h.db.execute(sql`select opening_balance::text as v from accounts where id = ${id}`));
    expect(row!.v).toBe("98765432109");
    expect(await balanceOf(id)).toBe(98765432109);
  });
});
