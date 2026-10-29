import { eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

/** Typed app settings stored as JSON rows. */
export interface Settings {
  /** Monthly grocery budget in AED fils. */
  groceryBudgetFils: number;
  preferredStoreIds: string[];
  /** Expense category that grocery purchases are booked to. */
  groceryCategoryId: string;
  /** Account suggested for new transactions and grocery purchases. */
  defaultAccountId: string | null;
  seededVersion: number;
  /** Fetch exchange rates online twice a day. Off by default: the app makes no network calls unless asked. */
  fxAutoUpdate: boolean;
  /** Last successful online rate update (ISO timestamp). */
  fxUpdatedAt: string | null;
  /** Last attempt, successful or not; paces automatic updates. */
  fxCheckedAt: string | null;
  /** When the provider published the rates last fetched. */
  fxPublishedAt: string | null;
  /** scrypt hash of the household passcode; null until it is created on first visit. Never sent to the browser. */
  authHash: string | null;
  /** Signs session cookies. Replacing it signs every device out. Never sent to the browser. */
  authSecret: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  groceryBudgetFils: 300000,
  preferredStoreIds: ["carrefour", "lulu", "union"],
  groceryCategoryId: "e-shopping--grocery",
  defaultAccountId: null,
  seededVersion: 0,
  fxAutoUpdate: false,
  fxUpdatedAt: null,
  fxCheckedAt: null,
  fxPublishedAt: null,
  authHash: null,
  authSecret: null,
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(settings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export async function setSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  for (const [key, value] of entries) {
    // null means "back to the default", and every nullable setting defaults to null.
    if (value === null) {
      await db.delete(settings).where(eq(settings.key, key));
      continue;
    }
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}

export async function deleteSettings(db: Db, keys: (keyof Settings)[]): Promise<void> {
  await db.delete(settings).where(inArray(settings.key, keys));
}

export async function getSetting<K extends keyof Settings>(db: Db, key: K): Promise<Settings[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}
