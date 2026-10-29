"use server";

import { redirect } from "next/navigation";
import {
  assertAdmin,
  deletePushSubscription,
  listPushSubscriptions,
  recordPushResults,
  savePushSubscription,
  type PushSubscriptionInput,
  decodeBackup,
  MAX_UPLOAD_BYTES,
  restoreBackup,
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
import { backupStoreConfigured, loadStoredBackup, storeBackup } from "@/lib/server/backup-store";
import { pushConfigured, webPushSender } from "@/lib/server/push";

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

/* ------------------------------------------------------------------ backup */

/** Replaces all data with an uploaded backup. Owner only (checked in restoreBackup); signs everyone out. */
export async function restoreBackupAction(form: FormData) {
  return runAction(async (db, access) => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose a backup file");
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Backup files must be 15 MB or smaller");
    return restoreBackup(db, access, decodeBackup(new Uint8Array(await file.arrayBuffer())));
  });
}

/* ------------------------------------------------------------------ notifications */

export async function subscribePushAction(sub: PushSubscriptionInput) {
  return runAction((db, access) => savePushSubscription(db, access.userId, sub));
}

export async function unsubscribePushAction(endpoint: string) {
  return runAction((db, access) => deletePushSubscription(db, access.userId, endpoint));
}

/** Sends a test notification to this person's devices. */
export async function testPushAction() {
  return runAction(async (db, access) => {
    if (!pushConfigured()) throw new ValidationError("Notifications aren't set up on this server");
    const subs = await listPushSubscriptions(db, access.userId);
    if (!subs.length) throw new ValidationError("Turn notifications on first");
    const message = { title: "GPA notifications are on", body: "You'll get a morning reminder when bills need confirming.", url: "/transactions/bills", tag: "test" };
    const results = await Promise.all(subs.map((s) => webPushSender(s, message)));
    await recordPushResults(
      db,
      subs.filter((_, i) => results[i] === "sent").map((s) => s.id),
      subs.filter((_, i) => results[i] === "gone").map((s) => s.id),
    );
    return results.filter((r) => r === "sent").length;
  });
}

/** Saves a backup to the automatic-backup storage now. Admins only. */
export async function backupNowAction() {
  return runAction(async (db, access) => {
    assertAdmin(access);
    if (!backupStoreConfigured()) throw new ValidationError("Automatic backup storage isn't set up on this server");
    return storeBackup(db);
  });
}

/** Restores one of the automatic backups, without downloading and uploading it. Owner only. */
export async function restoreStoredBackupAction(pathname: string) {
  return runAction(async (db, access) => {
    const backup = await loadStoredBackup(pathname);
    if (!backup) throw new ValidationError("That backup no longer exists");
    return restoreBackup(db, access, backup);
  });
}
