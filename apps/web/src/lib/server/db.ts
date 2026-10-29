import { connection } from "next/server";
import { createDb, seedDemo, type Db, type DbHandle } from "@gpa/db";
import { requireSession } from "./auth";

/**
 * One database per server process. DATABASE_URL selects a real PostgreSQL server;
 * without it the app keeps its data in an embedded PGlite folder (PGLITE_DIR, default .data/pglite).
 */
const g = globalThis as { __gpaDb?: Promise<DbHandle> };

function open(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL || undefined;
  return createDb({ url, dataDir: url ? undefined : (process.env.PGLITE_DIR ?? ".data/pglite") }).then(async (handle) => {
    if (process.env.GPA_SEED_DEMO === "1") await seedDemo(handle.db);
    return handle;
  });
}

export async function getDb(): Promise<Db> {
  g.__gpaDb ??= open().catch((error) => {
    g.__gpaDb = undefined;
    throw error;
  });
  return (await g.__gpaDb).db;
}

/**
 * For Server Components and route handlers: waits for the request (data is never prerendered), checks the
 * session and returns the database. Signed-out requests are redirected to /login before any data is read.
 */
export async function requestDb(): Promise<Db> {
  await connection();
  const db = await getDb();
  await requireSession(db);
  return db;
}
