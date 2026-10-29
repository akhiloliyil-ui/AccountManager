import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { weekStartOf } from "@gpa/core";
import type { DbHandle } from "./index";
import {
  addItem,
  confirmPurchase,
  createList,
  ensureCurrentWeekList,
  getCatalog,
  getList,
  groceryMonthSpend,
  listLists,
  removeItem,
  setChecked,
  updateGrocerySettings,
} from "./services/grocery";
import { createAccount, deleteTransaction, getTransaction, listAccounts } from "./services/money";
import { testDb } from "./test-utils";

const TODAY = "2026-10-29";

let h: DbHandle;
let cash: string;
beforeAll(async () => {
  h = await testDb();
  cash = (await listAccounts(h.db))[0]!.id;
});
afterAll(() => h.close());

describe("catalogue and lists", () => {
  it("serves the seeded catalogue with live offers only", async () => {
    const catalog = await getCatalog(h.db, "2026-01-01");
    expect(catalog.stores).toHaveLength(6);
    expect(catalog.products).toHaveLength(24);
    expect(catalog.offers.length).toBeGreaterThan(0);
    const later = await getCatalog(h.db, "2099-01-01");
    expect(later.offers).toEqual([]);
    expect(later.prices.every((p) => !p.promo)).toBe(true);
  });

  it("creates this week's list once", async () => {
    const id = await ensureCurrentWeekList(h.db, "2030-01-02");
    expect(await ensureCurrentWeekList(h.db, "2030-01-03")).toBe(id);
    expect((await getList(h.db, id))!.periodStart).toBe(weekStartOf("2030-01-02"));
  });

  it("copies a template and merges repeated products", async () => {
    const template = (await listLists(h.db)).find((l) => l.name === "Weekly basics")!;
    const id = await createList(h.db, { type: "weekly", name: "Copy", fromId: template.id, today: TODAY });
    await addItem(h.db, id, { productId: "milk", quantity: 1 });
    await addItem(h.db, id, { text: "Birthday candles" });
    const list = (await getList(h.db, id))!;
    expect(list.items).toHaveLength(template.items.length + 1);
    expect(list.items.find((i) => i.productId === "milk")!.quantity).toBe(3);
    expect(list.items.every((i) => !i.checked)).toBe(true);
  });
});

describe("basket -> expense confirmation", () => {
  let listId: string;

  beforeAll(async () => {
    await updateGrocerySettings(h.db, { groceryBudgetFils: 300000, preferredStoreIds: ["carrefour", "lulu", "union"] });
    listId = await createList(h.db, { type: "weekly", name: "Spec basket", today: TODAY });
    for (const [productId, quantity] of [["milk", 2], ["eggs", 1], ["rice", 1], ["chicken", 2], ["tomato", 1.5]] as const) {
      await addItem(h.db, listId, { productId, quantity });
    }
  });

  it("needs ticked items", async () => {
    await expect(confirmPurchase(h.db, { listId, storeId: "lulu", accountId: cash, amount: 10000, date: TODAY })).rejects.toThrow("Tick");
  });

  it("books the ticked items as one grocery expense and records the estimate", async () => {
    const list = (await getList(h.db, listId))!;
    for (const item of list.items.filter((i) => i.productId !== "tomato")) await setChecked(h.db, item.id, true);

    const result = await confirmPurchase(h.db, { listId, storeId: "lulu", accountId: cash, amount: 13100, date: TODAY });
    // Lulu: milk 2 x 9.75 + eggs 18.50 + rice 39.95 + chicken 2 for 50 (live sample offer) = 127.95
    expect(result).toMatchObject({ estimatedFils: 12795, itemCount: 4 });

    const tx = (await getTransaction(h.db, result.transactionId))!;
    expect(tx).toMatchObject({ type: "expense", amount: 13100, categoryId: "e-shopping--grocery", source: "basket", accountId: cash });
    expect(tx.note).toBe("Groceries at Lulu · Spec basket");
    expect(tx.description).toContain("2 × Fresh full-cream milk");

    const after = (await getList(h.db, listId))!;
    expect(after.items.filter((i) => i.purchaseId)).toHaveLength(4);
    expect(after.purchases).toEqual([expect.objectContaining({ storeId: "lulu", amount: 13100, estimatedFils: 12795, currency: "AED" })]);
  });

  it("locks purchased items and only books newly ticked ones next time", async () => {
    const list = (await getList(h.db, listId))!;
    const bought = list.items.find((i) => i.purchaseId)!;
    await expect(removeItem(h.db, bought.id)).rejects.toThrow("confirmed purchase");
    await expect(confirmPurchase(h.db, { listId, storeId: "lulu", accountId: cash, amount: 500, date: TODAY })).rejects.toThrow("Tick");

    const tomato = list.items.find((i) => i.productId === "tomato")!;
    await setChecked(h.db, tomato.id, true);
    const second = await confirmPurchase(h.db, { listId, storeId: "union", accountId: cash, amount: 640, date: TODAY });
    expect(second.itemCount).toBe(1);
    expect((await getList(h.db, listId))!.purchases).toHaveLength(2);
  });

  it("counts confirmed purchases in the month's grocery spend, converting other currencies", async () => {
    const inr = await createAccount(h.db, { groupId: "g-savings", name: "NRE", currency: "INR" });
    const other = await createList(h.db, { type: "weekly", name: "INR trip", today: TODAY });
    const item = await addItem(h.db, other, { productId: "banana", quantity: 1 });
    await setChecked(h.db, item, true);
    await confirmPurchase(h.db, { listId: other, storeId: null, accountId: inr, amount: 24100, date: TODAY }); // INR 241 = AED 10

    const spend = await groceryMonthSpend(h.db, TODAY);
    expect(spend).toEqual({ spentFils: 13100 + 640 + 1000, fromBasketFils: 13100 + 640 + 1000, otherFils: 0, count: 3 });
  });

  it("releases the items when the expense is deleted", async () => {
    const list = (await getList(h.db, listId))!;
    await deleteTransaction(h.db, list.purchases[0]!.transactionId);
    const after = (await getList(h.db, listId))!;
    expect(after.purchases).toHaveLength(1);
    expect(after.items.filter((i) => i.purchaseId)).toHaveLength(1);
    expect(after.items.filter((i) => i.checked)).toHaveLength(5);
  });

  it("validates grocery settings", async () => {
    await expect(updateGrocerySettings(h.db, { preferredStoreIds: ["lulu"] })).rejects.toThrow("two stores");
    await expect(updateGrocerySettings(h.db, { groceryCategoryId: "i-salary" })).rejects.toThrow("expense category");
  });
});
