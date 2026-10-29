import { refresh } from "next/cache";
import { ValidationError, type Db } from "@gpa/db";
import type { ActionResult } from "../action-result";
import { isSignedIn } from "./auth";
import { getDb } from "./db";

/**
 * Runs a mutation for a Server Action: user mistakes come back as readable errors,
 * anything else is logged and reported generically. The current page is refreshed on success.
 * Server Actions are public endpoints, so the session is checked here for every one of them.
 */
export async function runAction<T>(fn: (db: Db) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const db = await getDb();
    if (!(await isSignedIn(db))) return { ok: false, error: "You've been signed out. Reload the page and sign in again." };
    const data = await fn(db);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
