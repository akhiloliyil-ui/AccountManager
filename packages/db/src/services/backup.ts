import { gunzipSync, gzipSync } from "node:zlib";
import { getTableColumns, getTableName, ne, sql, type Table } from "drizzle-orm";
import type { Db } from "../client";
import { migrations } from "../migrations.gen";
import * as s from "../schema";
import { assertAdmin, signOutEverywhere, type Access } from "./auth";
import { ValidationError } from "./money";

/**
 * A backup is every household table as JSON, gzipped. It leaves out the session signing key (a new one is made on
 * restore) and the stored flyer PDF files (large; their reviewed offers are kept). It does include password hashes,
 * so a backup file should be kept as safe as the database itself.
 */

/** Parents before children, so foreign keys hold while restoring. */
const TABLES: Table[] = [
  s.settings,
  s.currencies,
  s.users,
  s.accountGroups,
  s.accounts,
  s.userAccounts,
  s.categories,
  s.budgets,
  s.categoryRules,
  s.importBatches,
  s.importFormats,
  s.transactions,
  s.stores,
  s.groceryCategories,
  s.products,
  s.storePrices,
  s.groceryLists,
  s.groceryPurchases,
  s.listItems,
  s.pdfImports,
  s.pdfImportLines,
];

export const BACKUP_FORMAT = "gpa-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Number of database migrations when the backup was made. */
  schema: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupSummary {
  exportedAt: string;
  schema: number;
  counts: Record<string, number>;
}

/** Self-referencing tables: rows without a parent first. */
const parentsFirst = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => Number(a.parentId != null) - Number(b.parentId != null));

export async function createBackup(db: Db, access: Access): Promise<BackupFile> {
  assertAdmin(access);
  return snapshotBackup(db);
}

/** The backup itself, with no permission check: for the scheduled job, which has no signed-in person. */
export async function snapshotBackup(db: Db): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  await db.transaction(async (tx) => {
    // One consistent snapshot of every table.
    await tx.execute(sql`set transaction isolation level repeatable read`);
    for (const table of TABLES) {
      const name = getTableName(table);
      let rows = (await tx.select().from(table as typeof s.settings)) as Record<string, unknown>[];
      if (table === s.settings) rows = rows.filter((r) => r.key !== "authSecret");
      if (table === s.pdfImports) rows = rows.map((r) => ({ ...r, file: null }));
      tables[name] = rows;
    }
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schema: migrations.length, exportedAt: new Date().toISOString(), tables };
}

export function encodeBackup(backup: BackupFile): Uint8Array {
  return gzipSync(JSON.stringify(backup), { level: 9 });
}

/** Reads a .json.gz (or plain .json) backup and checks it is one of ours. */
export function decodeBackup(bytes: Uint8Array): BackupFile {
  let text: string;
  try {
    text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString("utf8") : new TextDecoder().decode(bytes);
  } catch {
    throw new ValidationError("This file couldn't be unpacked. Choose a GPA backup (.json.gz).");
  }
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ValidationError("This file isn't a GPA backup.");
  }
  if (data?.format !== BACKUP_FORMAT || typeof data.tables !== "object" || !data.tables) throw new ValidationError("This file isn't a GPA backup.");
  if (data.version > BACKUP_VERSION || data.schema > migrations.length) {
    throw new ValidationError("This backup was made by a newer version of GPA. Update this app first, then restore.");
  }
  const known = new Set(TABLES.map(getTableName));
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!known.has(name)) throw new ValidationError(`The backup has an unknown table “${name}”.`);
    if (!Array.isArray(rows)) throw new ValidationError(`The backup's “${name}” table is damaged.`);
  }
  if (!data.tables.users?.some((u) => u.isOwner)) throw new ValidationError("The backup has no owner account, so nobody could sign in after restoring.");
  return data;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    schema: backup.schema,
    counts: Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length])),
  };
}

/** Timestamps travel as ISO strings in JSON; the driver wants Date objects back. */
function revive(table: Table, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (!(key in row)) continue; // older backups: columns added since then take their defaults
    const v = row[key];
    out[key] = col.columnType === "PgTimestamp" && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

/**
 * Replaces all household data with the backup's, in one transaction: if anything fails, nothing changes.
 * Owner only. Everyone is signed out afterwards, because the people and passwords may have changed.
 */
export async function restoreBackup(db: Db, access: Access, backup: BackupFile): Promise<BackupSummary> {
  assertAdmin(access);
  if (!access.isOwner) throw new ValidationError("Only the owner can restore a backup");
  await db.transaction(async (tx) => {
    for (const table of [...TABLES].reverse()) {
      // Keep this instance's session key; everything else comes from the backup.
      if (table === s.settings) await tx.delete(s.settings).where(ne(s.settings.key, "authSecret"));
      else await tx.delete(table as typeof s.settings);
    }
    for (const table of TABLES) {
      let rows = backup.tables[getTableName(table)] ?? [];
      if (table === s.settings) rows = rows.filter((r) => r.key !== "authSecret");
      if (table === s.categories || table === s.transactions) rows = parentsFirst(rows);
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500).map((r) => revive(table, r));
        if (batch.length) await tx.insert(table as typeof s.settings).values(batch as (typeof s.settings.$inferInsert)[]);
      }
    }
  });
  await signOutEverywhere(db);
  return summarizeBackup(backup);
}
