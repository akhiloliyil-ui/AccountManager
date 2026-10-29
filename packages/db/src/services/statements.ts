import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { importHashes, suggestCategory, type ColumnMapping, type StatementRow, type Suggestion } from "@gpa/core";
import type { Db } from "../client";
import { accounts, categories, categoryRules, importBatches, importFormats, transactions } from "../schema";
import { inScope, ValidationError, type AccountScope } from "./money";

export type RuleRow = typeof categoryRules.$inferSelect;

export async function listRules(db: Db): Promise<RuleRow[]> {
  return db.select().from(categoryRules).orderBy(asc(categoryRules.pattern));
}

export async function createRule(db: Db, input: { pattern: string; categoryId: string }): Promise<string> {
  const pattern = input.pattern.trim().toLowerCase();
  if (pattern.length < 2) throw new ValidationError("Use at least two characters of the description");
  const [cat] = await db.select().from(categories).where(eq(categories.id, input.categoryId));
  if (!cat) throw new ValidationError("Category not found");
  const [row] = await db.insert(categoryRules).values({ pattern, categoryId: cat.id, kind: cat.kind }).returning();
  return row!.id;
}

export async function deleteRule(db: Db, id: string): Promise<void> {
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
}

export interface PreviewLine extends StatementRow {
  hash: string;
  kind: "income" | "expense";
  /** Already imported (same account, date, amount and merchant text). */
  duplicate: boolean;
  suggestion: Suggestion | null;
}

/** Flags duplicates and suggests categories for normalised statement rows before anything is saved. */
export async function previewStatement(db: Db, accountId: string, rows: StatementRow[]): Promise<PreviewLine[]> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new ValidationError("Choose the account this statement belongs to");

  const hashes = importHashes(accountId, rows);
  const existing = hashes.length
    ? await db
        .select({ hash: transactions.importHash })
        .from(transactions)
        // Hashes embed the statement's account id, so they identify lines booked on either side of a transfer.
        .where(inArray(transactions.importHash, hashes))
    : [];
  const known = new Set(existing.map((e) => e.hash));

  const [rules, history] = await Promise.all([
    listRules(db),
    db
      .select({ description: transactions.description, note: transactions.note, categoryId: transactions.categoryId, kind: transactions.type })
      .from(transactions)
      .where(and(isNotNull(transactions.categoryId), inArray(transactions.type, ["income", "expense"])))
      .orderBy(desc(transactions.date))
      .limit(1000),
  ]);
  const examples = history.map((h) => ({
    description: h.description || h.note,
    categoryId: h.categoryId!,
    kind: h.kind as "income" | "expense",
  }));
  const ruleList = rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId, kind: r.kind ?? undefined }));

  return rows.map((row, i) => {
    const kind = row.amount < 0 ? "expense" : "income";
    return {
      ...row,
      hash: hashes[i]!,
      kind,
      duplicate: known.has(hashes[i]!),
      suggestion: suggestCategory(row.description, kind, ruleList, examples),
    };
  });
}

export interface CommitLine {
  date: string;
  description: string;
  /** Signed minor units, negative = money out. */
  amount: number;
  hash: string;
  categoryId: string | null;
  /** Book as a transfer to/from another account instead of income/expense. */
  transferAccountId?: string | null;
}

/** Saves the chosen lines. Lines already imported (same hash) are skipped, so re-running is harmless. */
export async function commitStatement(
  db: Db,
  input: { accountId: string; filename: string; rowCount: number; lines: CommitLine[]; by?: string | null },
): Promise<{ batchId: string; imported: number; skipped: number }> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId));
  if (!account) throw new ValidationError("Account not found");

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({ accountId: input.accountId, filename: input.filename, rowCount: input.rowCount, importedCount: 0, skippedCount: 0 })
      .returning();
    const cats = await tx.select({ id: categories.id, kind: categories.kind }).from(categories);
    const kindOf = new Map(cats.map((c) => [c.id, c.kind]));

    let imported = 0;
    for (const line of input.lines) {
      if (!line.amount) continue;
      const out = line.amount < 0;
      const base = {
        date: line.date,
        amount: Math.abs(line.amount),
        note: line.description.slice(0, 120),
        description: line.description,
        source: "import" as const,
        importBatchId: batch!.id,
        importHash: line.hash,
        createdBy: input.by ?? null,
      };
      const values =
        line.transferAccountId && line.transferAccountId !== input.accountId
          ? {
              ...base,
              type: "transfer" as const,
              accountId: out ? input.accountId : line.transferAccountId,
              toAccountId: out ? line.transferAccountId : input.accountId,
            }
          : {
              ...base,
              type: out ? ("expense" as const) : ("income" as const),
              accountId: input.accountId,
              categoryId: line.categoryId && kindOf.get(line.categoryId) === (out ? "expense" : "income") ? line.categoryId : null,
            };
      const inserted = await tx.insert(transactions).values(values).onConflictDoNothing().returning({ id: transactions.id });
      imported += inserted.length;
    }

    const skipped = input.lines.length - imported;
    await tx.update(importBatches).set({ importedCount: imported, skippedCount: skipped }).where(eq(importBatches.id, batch!.id));
    return { batchId: batch!.id, imported, skipped };
  });
}

export async function listImportBatches(db: Db, accountIds?: AccountScope) {
  return db
    .select({ batch: importBatches, accountName: accounts.name })
    .from(importBatches)
    .innerJoin(accounts, eq(importBatches.accountId, accounts.id))
    .where(inScope(accountIds, importBatches.accountId))
    .orderBy(desc(importBatches.createdAt))
    .limit(20);
}

/** Removes everything a batch imported. */
export async function undoImportBatch(db: Db, batchId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(transactions).where(eq(transactions.importBatchId, batchId)).returning({ id: transactions.id });
    await tx.delete(importBatches).where(eq(importBatches.id, batchId));
    return removed.length;
  });
}

/* ------------------------------------------------------------------ saved formats */

export type ImportFormatRow = typeof importFormats.$inferSelect;

export async function listImportFormats(db: Db): Promise<ImportFormatRow[]> {
  return db.select().from(importFormats).orderBy(desc(importFormats.lastUsedAt));
}

const validMapping = (m: ColumnMapping) =>
  [m.headerRow, m.date, m.description].every((n) => Number.isInteger(n) && n >= 0) &&
  [m.amount, m.debit, m.credit, m.balance].every((n) => n === undefined || n === null || (Number.isInteger(n) && n >= 0)) &&
  (m.amount != null || m.debit != null || m.credit != null) &&
  ["DMY", "MDY", "YMD"].includes(m.dateFormat);

/** Remembers (or refreshes) the mapping for a header layout after a successful import. */
export async function saveImportFormat(db: Db, input: { signature: string; mapping: ColumnMapping; accountId: string; name?: string }): Promise<void> {
  if (!input.signature || input.signature.length > 2000 || !validMapping(input.mapping)) return;
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, input.accountId));
  const mapping: ColumnMapping = {
    headerRow: input.mapping.headerRow,
    date: input.mapping.date,
    description: input.mapping.description,
    amount: input.mapping.amount ?? undefined,
    debit: input.mapping.debit ?? undefined,
    credit: input.mapping.credit ?? undefined,
    balance: input.mapping.balance ?? undefined,
    dateFormat: input.mapping.dateFormat,
    invert: !!input.mapping.invert,
  };
  await db
    .insert(importFormats)
    .values({ name: input.name?.trim() || `${account?.name ?? "Bank"} statement`, signature: input.signature, mapping, accountId: input.accountId })
    .onConflictDoUpdate({
      target: importFormats.signature,
      set: { mapping, accountId: input.accountId, useCount: sql`${importFormats.useCount} + 1`, lastUsedAt: new Date() },
    });
}

export async function renameImportFormat(db: Db, id: string, name: string): Promise<void> {
  if (!name.trim()) throw new ValidationError("Name the format");
  await db.update(importFormats).set({ name: name.trim().slice(0, 80) }).where(eq(importFormats.id, id));
}

export async function deleteImportFormat(db: Db, id: string): Promise<void> {
  await db.delete(importFormats).where(eq(importFormats.id, id));
}
