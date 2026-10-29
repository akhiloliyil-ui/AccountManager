import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { accounts, transactions, importBatches, userAccounts, users, type UserRole } from "../schema";
import { getSettings, setSettings } from "../settings";
import { ValidationError } from "./money";

/**
 * Up to five people sign in with their own username and password. Each has a role (read, write or admin) and,
 * unless they are an admin, a chosen set of accounts. Passwords are stored only as scrypt hashes; sessions are
 * stateless HMAC-signed tokens that carry the user's session version, so one user or everyone can be signed out.
 */

export { USER_ROLES, type UserRole } from "../schema";
export type UserRow = typeof users.$inferSelect;

/** The owner plus four more. */
export const MAX_USERS = 5;
export const PASSWORD_MIN_LENGTH = 8;
/** Sessions last 60 days, then the device asks for the password again. */
export const SESSION_MAX_AGE_S = 60 * 24 * 60 * 60;

const fail = (message: string): never => {
  throw new ValidationError(message);
};

/* ------------------------------------------------------------------ passwords */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

async function matchesHash(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

/** Compared against when the username doesn't exist, so a wrong username takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;

function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) fail(`Use at least ${PASSWORD_MIN_LENGTH} characters for the password`);
  if (password.length > 200) fail("That password is too long");
  if (/^(.)\1+$/.test(password) || "012345678901234567890".includes(password) || /^password\d*$/i.test(password)) {
    fail("Pick a password that's harder to guess");
  }
}

function normaliseUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(u)) fail("Usernames are 2–31 letters, numbers, dots, dashes or underscores");
  return u;
}

/* ------------------------------------------------------------------ access */

/** What the signed-in user may do. accountIds is null when they can use every account. */
export interface Access {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  isOwner: boolean;
  accountIds: string[] | null;
}

export async function accessFor(db: Db, user: UserRow): Promise<Access> {
  const all = user.role === "admin" || user.allAccounts;
  const accountIds = all
    ? null
    : (await db.select({ id: userAccounts.accountId }).from(userAccounts).where(eq(userAccounts.userId, user.id))).map((r) => r.id);
  return { userId: user.id, username: user.username, displayName: user.displayName, role: user.role, isOwner: user.isOwner, accountIds };
}

export function canSeeAccount(access: Access, accountId: string): boolean {
  return access.accountIds === null || access.accountIds.includes(accountId);
}

export function assertAdmin(access: Access): void {
  if (access.role !== "admin") fail("Only an admin can do that");
}

export function assertCanWrite(access: Access, accountIds: (string | null | undefined)[] = []): void {
  if (access.role === "read") fail("Your access is read-only");
  for (const id of accountIds) if (id && !canSeeAccount(access, id)) fail("You don't have access to that account");
}

/** Every account a transaction (and its fee or schedule siblings) touches must be one the user can change. */
export async function assertCanWriteTransaction(db: Db, access: Access, id: string): Promise<void> {
  assertCanWrite(access);
  if (access.accountIds === null) return;
  const [tx] = await db.select({ accountId: transactions.accountId, toAccountId: transactions.toAccountId }).from(transactions).where(eq(transactions.id, id));
  if (!tx) return;
  assertCanWrite(access, [tx.accountId, tx.toAccountId]);
}

export async function assertCanWriteImportBatch(db: Db, access: Access, batchId: string): Promise<void> {
  assertCanWrite(access);
  const [batch] = await db.select({ accountId: importBatches.accountId }).from(importBatches).where(eq(importBatches.id, batchId));
  if (batch) assertCanWrite(access, [batch.accountId]);
}

/* ------------------------------------------------------------------ sign-in and sessions */

export async function hasUsers(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return (row?.n ?? 0) > 0;
}

/** First-run setup. Refuses once anyone exists, so it can't be used to take over the app. */
export async function createOwner(db: Db, input: { username: string; displayName: string; password: string }): Promise<UserRow> {
  const username = normaliseUsername(input.username);
  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    // Serialises concurrent first-run requests: only one owner can ever be created.
    await tx.execute(sql`select pg_advisory_xact_lock(726202602)`);
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) fail("GPA is already set up. Sign in instead.");
    const settings = await getSettings(tx as unknown as Db);
    if (!settings.authSecret) await setSettings(tx as unknown as Db, { authSecret: randomBytes(32).toString("base64url") });
    const [owner] = await tx
      .insert(users)
      .values({ username, displayName: input.displayName.trim() || username, passwordHash, role: "admin", isOwner: true, allAccounts: true })
      .returning();
    return owner!;
  });
}

export async function authenticate(db: Db, username: string, password: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase()));
  if (!user) {
    await matchesHash(password, await (dummyHash ??= hashPassword(randomBytes(12).toString("hex"))));
    return null;
  }
  return (await matchesHash(password, user.passwordHash)) ? user : null;
}

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(`gpa-session:${payload}`).digest("base64url");

export async function issueSession(db: Db, user: Pick<UserRow, "id" | "sessionVersion">, now = Date.now()): Promise<string> {
  const { authSecret } = await getSettings(db);
  if (!authSecret) fail("Set up GPA first");
  const payload = `v2.${user.id}.${user.sessionVersion}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(authSecret!, payload)}`;
}

/** The signed-in user's access, or null for a missing, forged, expired or revoked token. */
export async function verifySession(db: Db, token: string | undefined, now = Date.now()): Promise<Access | null> {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const [, userId, version, issued, mac] = parts as [string, string, string, string, string];
  if (!/^\d+$/.test(version) || !/^\d+$/.test(issued)) return null;
  const age = now / 1000 - Number(issued);
  if (age < -60 || age > SESSION_MAX_AGE_S) return null;
  const { authSecret } = await getSettings(db);
  if (!authSecret) return null;
  const expected = Buffer.from(sign(authSecret, parts.slice(0, 4).join(".")));
  const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.sessionVersion !== Number(version)) return null;
  return accessFor(db, user);
}

/** Signs every user out on every device. */
export async function signOutEverywhere(db: Db): Promise<void> {
  await setSettings(db, { authSecret: randomBytes(32).toString("base64url") });
}

/** Signs one user out on every device. Returns their row with the new session version. */
export async function signOutUser(db: Db, userId: string): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning();
  return row;
}

export async function getUser(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

/** Changing your own password signs your other devices out. Returns the updated user for a fresh session. */
export async function changeOwnPassword(db: Db, userId: string, current: string, next: string): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await matchesHash(current, user.passwordHash))) fail("The current password is wrong");
  validatePassword(next);
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: user!.sessionVersion + 1 })
    .where(eq(users.id, userId))
    .returning();
  return updated!;
}

/* ------------------------------------------------------------------ managing users (admins) */

export interface UserView {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isOwner: boolean;
  allAccounts: boolean;
  accountIds: string[];
  createdAt: Date;
}

export async function listUsers(db: Db): Promise<UserView[]> {
  const [rows, links] = await Promise.all([db.select().from(users).orderBy(asc(users.createdAt)), db.select().from(userAccounts)]);
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    isOwner: u.isOwner,
    allAccounts: u.role === "admin" || u.allAccounts,
    accountIds: links.filter((l) => l.userId === u.id).map((l) => l.accountId),
    createdAt: u.createdAt,
  }));
}

export interface UserInput {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  allAccounts: boolean;
  accountIds: string[];
}

async function setUserAccounts(db: Db, userId: string, accountIds: string[]) {
  await db.delete(userAccounts).where(eq(userAccounts.userId, userId));
  const ids = [...new Set(accountIds)];
  if (!ids.length) return;
  const found = await db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.id, ids));
  if (found.length !== ids.length) fail("One of the chosen accounts no longer exists");
  await db.insert(userAccounts).values(ids.map((accountId) => ({ userId, accountId })));
}

function validateAccessChoice(input: { role: UserRole; allAccounts: boolean; accountIds: string[] }) {
  if (input.role !== "admin" && !input.allAccounts && !input.accountIds.length) fail("Choose at least one account, or allow all accounts");
}

export async function createUser(db: Db, access: Access, input: UserInput): Promise<string> {
  assertAdmin(access);
  const username = normaliseUsername(input.username);
  validatePassword(input.password);
  validateAccessChoice(input);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(726202602)`);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(users)) as [{ n: number }];
    if (n >= MAX_USERS) fail(`GPA allows ${MAX_USERS} people: the owner and ${MAX_USERS - 1} more. Remove someone first.`);
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (taken) fail(`The username “${username}” is taken`);
    const [user] = await tx
      .insert(users)
      .values({
        username,
        displayName: input.displayName.trim() || username,
        passwordHash,
        role: input.role,
        allAccounts: input.role === "admin" || input.allAccounts,
      })
      .returning();
    if (input.role !== "admin" && !input.allAccounts) await setUserAccounts(tx as unknown as Db, user!.id, input.accountIds);
    return user!.id;
  });
}

export async function updateUser(
  db: Db,
  access: Access,
  id: string,
  patch: { displayName?: string; role?: UserRole; allAccounts?: boolean; accountIds?: string[] },
): Promise<void> {
  assertAdmin(access);
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, id));
    if (!user) fail("User not found");
    if (user!.isOwner && patch.role && patch.role !== "admin") fail("The owner is always an admin");
    const role = patch.role ?? user!.role;
    const allAccounts = role === "admin" || (patch.allAccounts ?? user!.allAccounts);
    const accountIds =
      patch.accountIds ?? (await tx.select({ id: userAccounts.accountId }).from(userAccounts).where(eq(userAccounts.userId, id))).map((r) => r.id);
    validateAccessChoice({ role, allAccounts, accountIds });
    const changesAccess = role !== user!.role || allAccounts !== user!.allAccounts || patch.accountIds !== undefined;
    await tx
      .update(users)
      .set({
        displayName: patch.displayName?.trim() || user!.displayName,
        role,
        allAccounts,
        // Less access applies at once: their open sessions end and they sign in again.
        sessionVersion: changesAccess && id !== access.userId ? user!.sessionVersion + 1 : user!.sessionVersion,
      })
      .where(eq(users.id, id));
    await setUserAccounts(tx as unknown as Db, id, allAccounts ? [] : accountIds);
  });
}

/** An admin sets a new password for someone who forgot theirs; that person is signed out everywhere. */
export async function resetUserPassword(db: Db, access: Access, id: string, password: string): Promise<void> {
  assertAdmin(access);
  validatePassword(password);
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) fail("User not found");
  if (user!.isOwner && !access.isOwner) fail("Only the owner can reset the owner's password");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionVersion: user!.sessionVersion + 1 })
    .where(eq(users.id, id));
}

export async function deleteUser(db: Db, access: Access, id: string): Promise<void> {
  assertAdmin(access);
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return;
  if (user.isOwner) fail("The owner can't be removed");
  if (id === access.userId) fail("You can't remove yourself");
  await db.delete(users).where(and(eq(users.id, id), eq(users.isOwner, false)));
}

/** For the command-line reset: a new owner password, and the owner signed out everywhere. */
export async function resetOwnerPassword(db: Db, password: string): Promise<string | null> {
  validatePassword(password);
  const [owner] = await db.select().from(users).where(eq(users.isOwner, true));
  if (!owner) return null;
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionVersion: owner.sessionVersion + 1 })
    .where(eq(users.id, owner.id));
  return owner.username;
}

/**
 * Slows down guessing: after 5 wrong passwords in a row, sign-in locks for 30 seconds, doubling each
 * further miss up to 15 minutes. A correct password resets it.
 */
export function createSignInThrottle(options: { freeAttempts?: number; baseMs?: number; maxMs?: number } = {}) {
  const { freeAttempts = 5, baseMs = 30_000, maxMs = 15 * 60_000 } = options;
  let failures = 0;
  let lockedUntil = 0;
  return {
    /** Milliseconds until the next attempt is allowed; 0 when it is. */
    wait(now = Date.now()) {
      return Math.max(0, lockedUntil - now);
    },
    failed(now = Date.now()) {
      failures += 1;
      if (failures >= freeAttempts) lockedUntil = now + Math.min(maxMs, baseMs * 2 ** (failures - freeAttempts));
    },
    succeeded() {
      failures = 0;
      lockedUntil = 0;
    },
  };
}
