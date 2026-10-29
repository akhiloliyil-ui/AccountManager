import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { importHashes, suggestCategory, type StatementRow, type Suggestion } from "@gpa/core";
import type { Db } from "../client";
import { accounts, categories, categoryRules, importBatches, transactions } from "../schema";
import { ValidationError } from "./money";

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
  input: { accountId: string; filename: string; rowCount: number; lines: CommitLine[] },
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

export async function listImportBatches(db: Db) {
  return db
    .select({ batch: importBatches, accountName: accounts.name })
    .from(importBatches)
    .innerJoin(accounts, eq(importBatches.accountId, accounts.id))
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
