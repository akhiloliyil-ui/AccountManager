import { addDays, monthStartOf, todayIso, weekStartOf } from "@gpa/core";
import type { Db } from "./client";
import {
  accountGroups,
  accounts,
  categories,
  categoryRules,
  currencies,
  groceryCategories,
  groceryLists,
  listItems,
  products,
  storePrices,
  stores,
} from "./schema";
import {
  categoryRows,
  SEED_ACCOUNT_GROUPS,
  SEED_CURRENCIES,
  SEED_GROCERY_CATEGORIES,
  SEED_LISTS,
  SEED_PRODUCTS,
  SEED_RULES,
  SEED_STORES,
  seedPrices,
} from "./seed-data";
import { getSetting, setSettings } from "./settings";

export const SEED_VERSION = 1;

/** Inserts the starter data once. Safe to call on every start. */
export async function ensureSeeded(db: Db, today = todayIso()): Promise<boolean> {
  if ((await getSetting(db, "seededVersion")) >= SEED_VERSION) return false;

  await db.transaction(async (tx) => {
    await tx.insert(currencies).values(SEED_CURRENCIES).onConflictDoNothing();
    await tx
      .insert(accountGroups)
      .values(SEED_ACCOUNT_GROUPS.map((g, i) => ({ ...g, sort: i })))
      .onConflictDoNothing();
    const [cash] = await tx
      .insert(accounts)
      .values({ groupId: "g-cash", name: "Cash", currency: "AED", openingBalance: 0 })
      .returning();
    await tx.insert(categories).values(categoryRows()).onConflictDoNothing();
    await tx.insert(categoryRules).values(SEED_RULES);

    await tx
      .insert(stores)
      .values(SEED_STORES.map((s, i) => ({ ...s, sort: i })))
      .onConflictDoNothing();
    await tx
      .insert(groceryCategories)
      .values(SEED_GROCERY_CATEGORIES.map((c, i) => ({ ...c, sort: i })))
      .onConflictDoNothing();
    await tx
      .insert(products)
      .values(SEED_PRODUCTS.map(({ baseAed: _, ...p }) => p))
      .onConflictDoNothing();
    await tx.insert(storePrices).values(seedPrices(today, addDays)).onConflictDoNothing();

    for (const list of SEED_LISTS) {
      const periodStart = list.type === "weekly" ? weekStartOf(today) : list.type === "monthly" ? monthStartOf(today) : null;
      const [row] = await tx.insert(groceryLists).values({ type: list.type, name: list.name, periodStart }).returning();
      await tx.insert(listItems).values(
        list.items.map(([productId, quantity, checked = false], sort) => ({ listId: row!.id, productId, quantity, checked, sort })),
      );
    }

    await setSettings(tx as unknown as Db, { defaultAccountId: cash!.id, seededVersion: SEED_VERSION });
  });
  return true;
}
