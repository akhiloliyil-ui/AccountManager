import { createDb, type DbHandle } from "./client";

/** A fresh in-memory Postgres (PGlite) with migrations and starter data applied. */
export async function testDb(): Promise<DbHandle> {
  return createDb({ seed: true });
}

export { makePdf } from "./make-pdf";
