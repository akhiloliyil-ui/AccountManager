import { refresh } from "next/cache";
import { ValidationError, type Access, type Db } from "@gpa/db";
import type { ActionResult } from "../action-result";
import { currentAccess } from "./auth";
import { getDb } from "./db";

/**
 * Runs a mutation for a Server Action: user mistakes come back as readable errors,
 * anything else is logged and reported generically. The current page is refreshed on success.
 * Server Actions are public endpoints, so the session is checked here for every one of them, and the action gets
 * the person's access to check their role and accounts (assertCanWrite / assertAdmin from @gpa/db).
 */
export async function runAction<T>(fn: (db: Db, access: Access) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const db = await getDb();
    const access = await currentAccess(db);
    if (!access) return { ok: false, error: "You've been signed out. Reload the page and sign in again." };
    const data = await fn(db, access);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
