import { del, get, list, put } from "@vercel/blob";
import { decodeBackup, encodeBackup, snapshotBackup, type BackupFile, type Db } from "@gpa/db";
import { todayIso } from "@gpa/core";

/**
 * Automatic backups in a private Vercel Blob store (BLOB_READ_WRITE_TOKEN, set when the store is connected).
 * One file per day it runs, the newest KEEP kept.
 */
const PREFIX = "backups/";
export const KEEP = 8;

export function backupStoreConfigured(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export interface StoredBackup {
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export async function listStoredBackups(): Promise<StoredBackup[]> {
  if (!backupStoreConfigured()) return [];
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  return blobs
    .map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt) }))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

/** Writes today's backup (replacing one already made today) and deletes all but the newest KEEP. */
export async function storeBackup(db: Db): Promise<{ pathname: string; size: number; removed: number }> {
  const bytes = encodeBackup(await snapshotBackup(db));
  const pathname = `${PREFIX}gpa-backup-${todayIso()}.json.gz`;
  await put(pathname, Buffer.from(bytes), { access: "private", contentType: "application/gzip", allowOverwrite: true, addRandomSuffix: false });
  const old = (await listStoredBackups()).slice(KEEP);
  if (old.length) await del(old.map((b) => b.pathname));
  return { pathname, size: bytes.length, removed: old.length };
}

/** Only names this app writes, so a request can't reach anything else in the store. */
export function isBackupPath(pathname: string): boolean {
  return /^backups\/gpa-backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(pathname);
}

export async function readStoredBackup(pathname: string): Promise<Uint8Array | null> {
  if (!isBackupPath(pathname)) return null;
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

export async function loadStoredBackup(pathname: string): Promise<BackupFile | null> {
  const bytes = await readStoredBackup(pathname);
  return bytes ? decodeBackup(bytes) : null;
}
