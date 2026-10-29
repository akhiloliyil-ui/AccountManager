import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, addMonths, todayIso } from "@gpa/core";
import type { DbHandle } from "./index";
import { countDueBills, getBills, markBillPaid } from "./services/bills";
import { createAccount, createTransaction, listAccounts, updateTransaction } from "./services/money";
import { testDb } from "./test-utils";

let h: DbHandle;
let card = "";
let other = "";
const today = todayIso();
const later = addDays(today, 16);

beforeAll(async () => {
  h = await testDb();
  card = await createAccount(h.db, { groupId: "g-card", name: "Credit card", currency: "AED" });
  other = await createAccount(h.db, { groupId: "g-accounts", name: "Other bank", currency: "AED" });
  // 4 monthly installments starting today: the first is paid at purchase, three become bills.
  await createTransaction(h.db, {
    type: "expense",
    date: today,
    accountId: card,
    amount: 40000,
    note: "Phone",
    categoryId: "e-shopping--grocery",
    schedule: { mode: "installment", count: 4, frequency: "monthly" },
  });
  // A weekly repeat from tomorrow on another account. Seen 16 days later, all three are past due and unconfirmed.
  await createTransaction(h.db, { type: "expense", date: addDays(today, 1), accountId: other, amount: 5000, note: "Cleaner", schedule: { mode: "repeat", count: 3, frequency: "weekly" } });
});
afterAll(() => h.close());

describe("bills", () => {
  it("lists unpaid scheduled payments by when they're due", async () => {
    const now = await getBills(h.db, today, null, 40);
    expect(now.filter((b) => b.note === "Phone").map((b) => b.date)).toEqual([addMonths(today, 1)]);
    expect(now.filter((b) => b.note === "Cleaner").map((b) => b.due)).toEqual(["week", "later", "later"]);
    expect(await countDueBills(h.db, today)).toBe(0);

    const cleaner = (await getBills(h.db, later, null, 40)).filter((b) => b.note === "Cleaner");
    expect(cleaner.map((b) => b.daysLate)).toEqual([15, 8, 1]);
    expect(cleaner.every((b) => b.due === "overdue")).toBe(true);
    expect(await countDueBills(h.db, later)).toBe(3);
  });

  it("is limited to the accounts a person can see", async () => {
    expect((await getBills(h.db, today, [card], 40)).every((b) => b.accountId === card)).toBe(true);
    expect(await countDueBills(h.db, later, [card])).toBe(0);
  });

  it("drops off the list when marked paid or edited, and comes back when unmarked", async () => {
    const [first, second] = (await getBills(h.db, later, null, 40)).filter((b) => b.note === "Cleaner");
    await markBillPaid(h.db, first!.id);
    // Editing one that's due (here: paid early, today, at a different amount) also settles it.
    await updateTransaction(h.db, second!.id, { type: "expense", date: today, accountId: other, amount: 5500, note: "Cleaner" });
    let ids = (await getBills(h.db, later, null, 40)).map((b) => b.id);
    expect(ids).not.toContain(first!.id);
    expect(ids).not.toContain(second!.id);
    await markBillPaid(h.db, first!.id, false);
    ids = (await getBills(h.db, later, null, 40)).map((b) => b.id);
    expect(ids).toContain(first!.id);
    expect((await listAccounts(h.db)).length).toBeGreaterThan(0);
  });
});
