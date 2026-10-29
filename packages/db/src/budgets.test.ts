import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "./index";
import { authenticate, createOwner, createUser, issueSession, verifySession, type Access } from "./services/auth";
import { getBudgetReport, listBudgets, setBudget } from "./services/budgets";
import { createAccount, createTransaction, setBaseCurrency, updateCurrency } from "./services/money";
import { testDb } from "./test-utils";

let h: DbHandle;
let owner: Access;
let member: Access;
let family = "";
let personal = "";

async function signedIn(username: string, password: string) {
  return (await verifySession(h.db, await issueSession(h.db, (await authenticate(h.db, username, password))!)))!;
}

beforeAll(async () => {
  h = await testDb();
  await createOwner(h.db, { username: "akhil", displayName: "Akhil", password: "owner-pass-2026" });
  owner = await signedIn("akhil", "owner-pass-2026");
  family = await createAccount(h.db, { groupId: "g-cash", name: "Family Cash", currency: "AED" });
  personal = await createAccount(h.db, { groupId: "g-accounts", name: "Personal", currency: "AED" });
  await createUser(h.db, owner, { username: "priya", displayName: "Priya", password: "priya-pass-2026", role: "write", allAccounts: false, accountIds: [family] });
  member = await signedIn("priya", "priya-pass-2026");
  await createTransaction(h.db, { type: "expense", date: "2026-10-03", accountId: family, amount: 40000, categoryId: "e-food--eating-out" });
  await createTransaction(h.db, { type: "expense", date: "2026-10-04", accountId: personal, amount: 70000, categoryId: "e-food--eating-out" });
  await createTransaction(h.db, { type: "expense", date: "2026-09-28", accountId: family, amount: 99900, categoryId: "e-food--eating-out" });
});
afterAll(() => h.close());

describe("category budgets", () => {
  it("only admins set budgets, only on expense categories", async () => {
    await expect(setBudget(h.db, member, "e-food", 100000)).rejects.toThrow(/Only an admin/);
    await expect(setBudget(h.db, owner, "i-salary", 100000)).rejects.toThrow(/expense categories/);
    await setBudget(h.db, owner, "e-food", 100000);
    await setBudget(h.db, owner, "e-food", 150000);
    expect(await listBudgets(h.db)).toEqual([{ categoryId: "e-food", parentCategoryId: "e-food", amount: 150000 }]);
  });

  it("reports one month's spending, limited to the accounts a person can see", async () => {
    const all = await getBudgetReport(h.db, "2026-10-15", null, "2026-10-15");
    expect(all.lines[0]).toMatchObject({ categoryId: "e-food", spent: 110000, remaining: 40000 });
    const mine = await getBudgetReport(h.db, "2026-10-15", member.accountIds, "2026-10-15");
    expect(mine.lines[0]).toMatchObject({ spent: 40000 });
    const september = await getBudgetReport(h.db, "2026-09-01", null, "2026-10-15");
    expect(september).toMatchObject({ month: "2026-09-01", pace: 1 });
    expect(september.lines[0]).toMatchObject({ spent: 99900, status: "ok" });
  });

  it("moves budgets with a new base currency, and removes them with 0", async () => {
    await updateCurrency(h.db, "INR", { perBase: 24, active: true });
    await setBaseCurrency(h.db, "INR");
    expect((await listBudgets(h.db))[0]!.amount).toBe(150000 * 24);
    await setBaseCurrency(h.db, "AED");
    expect((await listBudgets(h.db))[0]!.amount).toBe(150000);
    await setBudget(h.db, owner, "e-food", 0);
    expect(await listBudgets(h.db)).toEqual([]);
  });
});
