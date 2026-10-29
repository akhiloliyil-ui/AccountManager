import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { migrations } from "./migrations.gen";
import * as schema from "./schema";
import { ensureSeeded } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Rows of a raw `db.execute()` result; both drivers return `{ rows }`. */
export function rows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export interface DbHandle {
  db: Db;
  driver: "postgres" | "pglite";
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** postgres:// URL. When absent, an embedded PGlite (Postgres in WASM) is used. */
  url?: string;
  /** PGlite data directory; omit for an in-memory database (tests). */
  dataDir?: string;
  /** Insert the starter data (categories, account groups, catalogue) on an empty database. */
  seed?: boolean;
}

export async function createDb({ url, dataDir, seed = true }: CreateDbOptions = {}): Promise<DbHandle> {
  let handle: DbHandle;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: 10 });
    handle = { db: drizzle({ client: pool, schema }) as unknown as Db, driver: "postgres", close: () => pool.end() };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    if (dataDir) await (await import("node:fs/promises")).mkdir(dataDir, { recursive: true });
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    handle = { db: drizzle({ client, schema }) as unknown as Db, driver: "pglite", close: () => client.close() };
  }
  await migrate(handle.db);
  if (seed) await ensureSeeded(handle.db);
  return handle;
}

/** Applies bundled migrations once each, serialised across app instances by an advisory lock. */
export async function migrate(db: Db): Promise<string[]> {
  const applied: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(726202601)`);
    await tx.execute(
      sql`create table if not exists gpa_migrations (tag text primary key, applied_at timestamptz not null default now())`,
    );
    const done = await tx.execute(sql`select tag from gpa_migrations`);
    const doneTags = new Set(rows<{ tag: string }>(done).map((r) => r.tag));
    for (const m of migrations) {
      if (doneTags.has(m.tag)) continue;
      for (const statement of m.sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`insert into gpa_migrations (tag) values (${m.tag})`);
      applied.push(m.tag);
    }
  });
  return applied;
}
