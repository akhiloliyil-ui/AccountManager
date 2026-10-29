import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  compareBasket,
  convertMinor,
  monthEndOf,
  monthStartOf,
  todayIso,
  weekStartOf,
  type Category,
  type Product,
  type Promo,
  type Store,
  type StorePrice,
} from "@gpa/core";
import type { Db } from "../client";
import {
  accounts,
  categories,
  groceryCategories,
  groceryLists,
  groceryPurchases,
  listItems,
  products,
  storePrices,
  stores,
  transactions,
} from "../schema";
import { getSettings, setSettings, type Settings } from "../settings";
import { getCurrencies, inScope, ValidationError, type AccountScope } from "./money";

/* ------------------------------------------------------------------ catalogue */

export interface Offer {
  storeId: string;
  productId: string;
  promo: Promo;
  validTo: string | null;
  source: string;
}

export interface Catalog {
  stores: Store[];
  categories: Category[];
  products: Product[];
  /** Current prices; promos past their end date are dropped. */
  prices: StorePrice[];
  offers: Offer[];
}

export async function getCatalog(db: Db, today = todayIso()): Promise<Catalog> {
  const [storeRows, categoryRows, productRows, priceRows] = await Promise.all([
    db.select().from(stores).orderBy(asc(stores.sort)),
    db.select().from(groceryCategories).orderBy(asc(groceryCategories.sort)),
    db.select().from(products).orderBy(asc(products.name)),
    db.select().from(storePrices),
  ]);
  const prices: StorePrice[] = [];
  const offers: Offer[] = [];
  for (const p of priceRows) {
    const promoLive = p.promo && (!p.promoValidTo || p.promoValidTo >= today);
    prices.push({
      productId: p.productId,
      storeId: p.storeId,
      priceFils: p.priceFils,
      promo: promoLive ? p.promo! : undefined,
      promoValidTo: promoLive ? (p.promoValidTo ?? undefined) : undefined,
      source: p.source,
      observedAt: p.observedAt,
    });
    if (promoLive) {
      offers.push({ storeId: p.storeId, productId: p.productId, promo: p.promo!, validTo: p.promoValidTo, source: p.sourceLabel ?? "Offer" });
    }
  }
  return {
    stores: storeRows.map(({ id, name, color }) => ({ id, name, color })),
    categories: categoryRows.map(({ id, name }) => ({ id, name })),
    products: productRows.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand ?? undefined,
      categoryId: p.categoryId,
      packSize: p.packSize,
      packUnit: p.packUnit,
      soldBy: p.soldBy,
    })),
    prices,
    offers,
  };
}

export async function createProduct(
  db: Db,
  input: { name: string; brand?: string | null; categoryId: string; packSize?: number; packUnit?: Product["packUnit"]; soldBy?: Product["soldBy"] },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Name the product");
  const [row] = await db
    .insert(products)
    .values({ ...input, name, brand: input.brand?.trim() || null })
    .returning();
  return row!.id;
}

/** Records a shelf price seen in store (keeps any live promo). */
export async function setShelfPrice(db: Db, input: { productId: string; storeId: string; priceFils: number; date?: string }) {
  if (!Number.isInteger(input.priceFils) || input.priceFils <= 0) throw new ValidationError("Enter a price above zero");
  const observedAt = input.date ?? todayIso();
  await db
    .insert(storePrices)
    .values({ productId: input.productId, storeId: input.storeId, priceFils: input.priceFils, source: "manual", observedAt })
    .onConflictDoUpdate({
      target: [storePrices.productId, storePrices.storeId],
      set: { priceFils: input.priceFils, source: "manual", observedAt },
    });
}

/* ------------------------------------------------------------------ lists */

export type ListType = "weekly" | "monthly" | "saved";

export interface ListItem {
  id: string;
  productId: string | null;
  text: string | null;
  quantity: number;
  checked: boolean;
  /** Set once the item was confirmed as bought in a purchase (basket -> expense). */
  purchaseId: string | null;
}

export interface Purchase {
  id: string;
  transactionId: string;
  storeId: string | null;
  estimatedFils: number;
  amount: number;
  currency: string;
  accountId: string;
  date: string;
}

export interface GroceryList {
  id: string;
  type: ListType;
  name: string;
  periodStart: string | null;
  items: ListItem[];
  purchases: Purchase[];
}

export async function listLists(db: Db, ids?: string[]): Promise<GroceryList[]> {
  const lists = await db
    .select()
    .from(groceryLists)
    .where(ids ? inArray(groceryLists.id, ids) : undefined)
    .orderBy(asc(groceryLists.type), asc(groceryLists.createdAt));
  if (!lists.length) return [];
  const listIds = lists.map((l) => l.id);
  const [items, purchases] = await Promise.all([
    db.select().from(listItems).where(inArray(listItems.listId, listIds)).orderBy(asc(listItems.sort), asc(listItems.createdAt)),
    db
      .select({ purchase: groceryPurchases, tx: transactions, currency: accounts.currency })
      .from(groceryPurchases)
      .innerJoin(transactions, eq(groceryPurchases.transactionId, transactions.id))
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(inArray(groceryPurchases.listId, listIds))
      .orderBy(asc(transactions.date)),
  ]);
  // Newest periods first, templates last.
  const order = { weekly: 0, monthly: 1, saved: 2 } as const;
  return lists
    .sort((a, b) => order[a.type] - order[b.type] || (b.periodStart ?? "").localeCompare(a.periodStart ?? "") || b.createdAt.getTime() - a.createdAt.getTime())
    .map((l) => ({
      id: l.id,
      type: l.type,
      name: l.name,
      periodStart: l.periodStart,
      items: items
        .filter((i) => i.listId === l.id)
        .map(({ id, productId, text, quantity, checked, purchaseId }) => ({ id, productId, text, quantity, checked, purchaseId })),
      purchases: purchases
        .filter((p) => p.purchase.listId === l.id)
        .map(({ purchase, tx, currency }) => ({
          id: purchase.id,
          transactionId: tx.id,
          storeId: purchase.storeId,
          estimatedFils: purchase.estimatedFils,
          amount: tx.amount,
          currency,
          accountId: tx.accountId,
          date: tx.date,
        })),
    }));
}

export async function getList(db: Db, id: string): Promise<GroceryList | null> {
  return (await listLists(db, [id]))[0] ?? null;
}

export async function createList(db: Db, input: { type: ListType; name: string; fromId?: string | null; today?: string }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Name the list");
  const today = input.today ?? todayIso();
  const periodStart = input.type === "weekly" ? weekStartOf(today) : input.type === "monthly" ? monthStartOf(today) : null;
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(groceryLists).values({ type: input.type, name, periodStart }).returning();
    if (input.fromId) {
      const source = await tx.select().from(listItems).where(eq(listItems.listId, input.fromId)).orderBy(asc(listItems.sort));
      if (source.length) {
        await tx.insert(listItems).values(
          source.map((i, sort) => ({ listId: row!.id, productId: i.productId, text: i.text, quantity: i.quantity, sort })),
        );
      }
    }
    return row!.id;
  });
}

/** This week's list, created empty if it does not exist yet. */
export async function ensureCurrentWeekList(db: Db, today = todayIso()): Promise<string> {
  const [existing] = await db
    .select({ id: groceryLists.id })
    .from(groceryLists)
    .where(and(eq(groceryLists.type, "weekly"), eq(groceryLists.periodStart, weekStartOf(today))))
    .orderBy(asc(groceryLists.createdAt))
    .limit(1);
  return existing?.id ?? createList(db, { type: "weekly", name: "This week", today });
}

export async function renameList(db: Db, id: string, name: string) {
  if (!name.trim()) throw new ValidationError("Name the list");
  await db.update(groceryLists).set({ name: name.trim() }).where(eq(groceryLists.id, id));
}

/** Deletes the list. Expenses already confirmed from it stay in the ledger. */
export async function deleteList(db: Db, id: string) {
  await db.delete(groceryLists).where(eq(groceryLists.id, id));
}

export async function addItem(db: Db, listId: string, input: { productId?: string | null; text?: string | null; quantity?: number }) {
  const quantity = input.quantity ?? 1;
  if (!(quantity > 0)) throw new ValidationError("Quantity must be above zero");
  if (!input.productId && !input.text?.trim()) throw new ValidationError("Choose a product or type an item");
  if (input.productId) {
    // Same product, not yet bought: add to its quantity instead of a second row.
    const [existing] = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.productId, input.productId), isNull(listItems.purchaseId)));
    if (existing) {
      await db.update(listItems).set({ quantity: existing.quantity + quantity }).where(eq(listItems.id, existing.id));
      return existing.id;
    }
  }
  const siblings = await db.select({ sort: listItems.sort }).from(listItems).where(eq(listItems.listId, listId));
  const [row] = await db
    .insert(listItems)
    .values({
      listId,
      productId: input.productId ?? null,
      text: input.productId ? null : input.text!.trim(),
      quantity,
      sort: siblings.reduce((m, s) => Math.max(m, s.sort + 1), 0),
    })
    .returning();
  return row!.id;
}

async function unpurchasedItem(db: Db, itemId: string) {
  const [item] = await db.select().from(listItems).where(eq(listItems.id, itemId));
  if (!item) throw new ValidationError("Item not found");
  if (item.purchaseId) throw new ValidationError("This item is part of a confirmed purchase. Delete that expense to change it.");
  return item;
}

export async function setQuantity(db: Db, itemId: string, quantity: number) {
  await unpurchasedItem(db, itemId);
  await db.update(listItems).set({ quantity: Math.max(0.5, quantity) }).where(eq(listItems.id, itemId));
}

export async function setChecked(db: Db, itemId: string, checked: boolean) {
  await unpurchasedItem(db, itemId);
  await db.update(listItems).set({ checked }).where(eq(listItems.id, itemId));
}

export async function removeItem(db: Db, itemId: string) {
  await unpurchasedItem(db, itemId);
  await db.delete(listItems).where(eq(listItems.id, itemId));
}

export async function saveAsTemplate(db: Db, listId: string, name: string) {
  return createList(db, { type: "saved", name, fromId: listId });
}

/* ------------------------------------------------------------------ settings */

export type GrocerySettings = Pick<Settings, "groceryBudgetFils" | "preferredStoreIds" | "groceryCategoryId" | "defaultAccountId">;

export async function updateGrocerySettings(db: Db, patch: Partial<GrocerySettings>) {
  if (patch.groceryBudgetFils !== undefined && (!Number.isInteger(patch.groceryBudgetFils) || patch.groceryBudgetFils < 0)) {
    throw new ValidationError("Budget must be zero or more");
  }
  if (patch.preferredStoreIds && patch.preferredStoreIds.length < 2) {
    throw new ValidationError("Compare needs at least two stores");
  }
  if (patch.groceryCategoryId) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, patch.groceryCategoryId));
    if (cat?.kind !== "expense") throw new ValidationError("Pick an expense category for groceries");
  }
  await setSettings(db, patch);
}

/* ------------------------------------------------------------------ basket -> expense */

export interface ConfirmPurchaseInput {
  listId: string;
  storeId: string | null;
  accountId: string;
  /** What was actually paid, in minor units of the account's currency. */
  amount: number;
  date: string;
  categoryId?: string | null;
  note?: string;
}

/**
 * Turns the ticked, not-yet-bought items of a list into one expense transaction and marks them
 * as bought. Deleting that expense later releases the items again (FK set null).
 */
export async function confirmPurchase(db: Db, input: ConfirmPurchaseInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationError("Enter the amount you paid");
  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId));
  if (!account) throw new ValidationError("Choose the account you paid from");
  const settings = await getSettings(db);
  const categoryId = input.categoryId ?? settings.groceryCategoryId;
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (category?.kind !== "expense") throw new ValidationError("Pick an expense category");

  const [list] = await db.select().from(groceryLists).where(eq(groceryLists.id, input.listId));
  if (!list) throw new ValidationError("List not found");
  const items = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.listId, input.listId), eq(listItems.checked, true), isNull(listItems.purchaseId)));
  if (!items.length) throw new ValidationError("Tick the items you bought first");

  const catalog = await getCatalog(db, input.date);
  const priced = items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, quantity: i.quantity }));
  const storeIds = input.storeId ? [input.storeId] : settings.preferredStoreIds;
  const comparison = compareBasket(priced, catalog.prices, storeIds);
  const estimatedFils = (input.storeId ? comparison.stores[0] : comparison.cheapest)?.estimatedFils ?? 0;

  const productName = new Map(catalog.products.map((p) => [p.id, p.name]));
  const storeName = input.storeId ? catalog.stores.find((s) => s.id === input.storeId)?.name : undefined;
  const description = items
    .map((i) => `${i.quantity} × ${i.productId ? (productName.get(i.productId) ?? "Item") : i.text}`)
    .join("\n");

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(transactions)
      .values({
        type: "expense",
        date: input.date,
        accountId: account.id,
        amount: input.amount,
        categoryId,
        note: input.note?.trim() || `Groceries${storeName ? ` at ${storeName}` : ""} · ${list.name}`,
        description,
        source: "basket",
      })
      .returning();
    const [purchase] = await tx
      .insert(groceryPurchases)
      .values({ listId: list.id, transactionId: expense!.id, storeId: input.storeId, estimatedFils })
      .returning();
    await tx
      .update(listItems)
      .set({ purchaseId: purchase!.id })
      .where(inArray(listItems.id, items.map((i) => i.id)));
    return { transactionId: expense!.id, purchaseId: purchase!.id, estimatedFils, itemCount: items.length };
  });
}

/** Grocery spend this month: expenses booked to the grocery category (and its subcategories), in AED fils. */
export async function groceryMonthSpend(db: Db, today = todayIso(), accountIds?: AccountScope) {
  const settings = await getSettings(db);
  const [{ byCode }, rows] = await Promise.all([
    getCurrencies(db),
    db
      .select({ amount: transactions.amount, currency: accounts.currency, source: transactions.source })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          eq(transactions.type, "expense"),
          inScope(accountIds, transactions.accountId),
          gte(transactions.date, monthStartOf(today)),
          lte(transactions.date, monthEndOf(today)),
          inArray(
            transactions.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(or(eq(categories.id, settings.groceryCategoryId), eq(categories.parentId, settings.groceryCategoryId))),
          ),
        ),
      ),
  ]);
  const aed = byCode.get("AED") ?? { code: "AED", name: "UAE Dirham", symbol: "DH", decimals: 2, perBase: 1 };
  let spentFils = 0;
  let fromBasketFils = 0;
  for (const r of rows) {
    const fils = convertMinor(r.amount, byCode.get(r.currency) ?? aed, aed);
    spentFils += fils;
    if (r.source === "basket") fromBasketFils += fils;
  }
  return { spentFils, fromBasketFils, otherFils: spentFils - fromBasketFils, count: rows.length };
}
