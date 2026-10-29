"use server";

import { redirect } from "next/navigation";
import {
  assertAdmin,
  authenticate,
  changeOwnPassword,
  createOwner,
  createUser,
  deleteUser,
  getUser,
  resetUserPassword,
  signOutEverywhere,
  signOutUser,
  updateUser,
  ValidationError,
  type UserInput,
  type UserRole,
} from "@gpa/db";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server/action";
import { endSession, safeNext, signInThrottle, startSession } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

const wait = (ms: number) =>
  `Too many wrong passwords. Try again in ${ms < 60_000 ? `${Math.ceil(ms / 1000)} seconds` : `${Math.ceil(ms / 60_000)} minutes`}.`;

/* Sign-in and first-run setup happen before there is a session, so they don't go through runAction. */

export async function signIn(username: string, password: string, next: string | null): Promise<ActionResult<null>> {
  const db = await getDb();
  const throttle = signInThrottle(username);
  const locked = throttle.wait();
  if (locked) return { ok: false, error: wait(locked) };
  const user = await authenticate(db, username, password);
  if (!user) {
    throttle.failed();
    const now = throttle.wait();
    // The same message for an unknown username and a wrong password, so usernames can't be probed.
    return { ok: false, error: now ? wait(now) : "That username and password don't match" };
  }
  throttle.succeeded();
  await startSession(db, user);
  redirect(safeNext(next));
}

export async function setUpOwner(input: { username: string; displayName: string; password: string; confirm: string }): Promise<ActionResult<null>> {
  if (input.password !== input.confirm) return { ok: false, error: "The two passwords don't match" };
  const db = await getDb();
  let owner;
  try {
    owner = await createOwner(db, input);
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
  await startSession(db, owner);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(current: string, next: string, confirm: string) {
  return runAction(async (db, access) => {
    if (next !== confirm) throw new ValidationError("The two new passwords don't match");
    const throttle = signInThrottle(access.username);
    const locked = throttle.wait();
    if (locked) throw new ValidationError(wait(locked));
    let user;
    try {
      user = await changeOwnPassword(db, access.userId, current, next);
    } catch (error) {
      if (error instanceof ValidationError && /current password/.test(error.message)) throttle.failed();
      throw error;
    }
    // Your other devices are signed out; this one gets a fresh session.
    await startSession(db, user);
  });
}

/** Signs this person out on their other devices; this one stays signed in. */
export async function signOutMyOtherDevices() {
  return runAction(async (db, access) => {
    const me = await signOutUser(db, access.userId);
    if (me) await startSession(db, me);
  });
}

/* ------------------------------------------------------------------ people (admins only; checked in @gpa/db too) */

export async function addUserAction(input: UserInput) {
  return runAction((db, access) => createUser(db, access, input));
}

export async function updateUserAction(id: string, patch: { displayName?: string; role?: UserRole; allAccounts?: boolean; accountIds?: string[] }) {
  return runAction((db, access) => updateUser(db, access, id, patch));
}

export async function resetPasswordAction(id: string, password: string) {
  return runAction((db, access) => resetUserPassword(db, access, id, password));
}

export async function removeUserAction(id: string) {
  return runAction((db, access) => deleteUser(db, access, id));
}

export async function signOutUserAction(id: string) {
  return runAction(async (db, access) => {
    assertAdmin(access);
    await signOutUser(db, id);
  });
}

/** Signs everyone out on every device, then signs this admin back in here. */
export async function signOutEveryoneAction() {
  return runAction(async (db, access) => {
    assertAdmin(access);
    await signOutEverywhere(db);
    const me = await getUser(db, access.userId);
    if (me) await startSession(db, me);
  });
}
