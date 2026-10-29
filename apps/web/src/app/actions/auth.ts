"use server";

import { changePasscode, checkPasscode, createPasscode, signOutEverywhere, ValidationError } from "@gpa/db";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server/action";
import { endSession, safeNext, signInThrottle, startSession } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

const wait = (ms: number) => `Too many wrong passcodes. Try again in ${ms < 60_000 ? `${Math.ceil(ms / 1000)} seconds` : `${Math.ceil(ms / 60_000)} minutes`}.`;

/** Sign-in and first-run setup run before there is a session, so they don't go through runAction. */
export async function signIn(passcode: string, next: string | null): Promise<ActionResult<null>> {
  const db = await getDb();
  const locked = signInThrottle.wait();
  if (locked) return { ok: false, error: wait(locked) };
  if (!(await checkPasscode(db, passcode))) {
    signInThrottle.failed();
    const now = signInThrottle.wait();
    return { ok: false, error: now ? wait(now) : "That passcode isn't right" };
  }
  signInThrottle.succeeded();
  await startSession(db);
  redirect(safeNext(next));
}

export async function setUpPasscode(passcode: string, confirm: string): Promise<ActionResult<null>> {
  if (passcode !== confirm) return { ok: false, error: "The two passcodes don't match" };
  const db = await getDb();
  try {
    await createPasscode(db, passcode);
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
  await startSession(db);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function changePasscodeAction(current: string, next: string, confirm: string) {
  return runAction(async (db) => {
    if (next !== confirm) throw new ValidationError("The two new passcodes don't match");
    const locked = signInThrottle.wait();
    if (locked) throw new ValidationError(wait(locked));
    if (!(await checkPasscode(db, current))) {
      signInThrottle.failed();
      throw new ValidationError("The current passcode is wrong");
    }
    await changePasscode(db, current, next);
    // The new secret signed everyone out, including this device; sign this one back in.
    await startSession(db);
  });
}

export async function signOutOtherDevices() {
  return runAction(async (db) => {
    await signOutEverywhere(db);
    await startSession(db);
  });
}
