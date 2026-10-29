import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "../client";
import { getSettings, setSettings } from "../settings";
import { ValidationError } from "./money";

/**
 * One passcode for the household. The passcode is stored only as a scrypt hash; sessions are stateless
 * HMAC-signed tokens, so rotating the signing secret signs every device out at once.
 */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

export const PASSCODE_MIN_LENGTH = 6;
/** Sessions last 60 days, then the device asks for the passcode again. */
export const SESSION_MAX_AGE_S = 60 * 24 * 60 * 60;

const fail = (message: string): never => {
  throw new ValidationError(message);
};

async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(passcode, salt, KEY_LEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

async function matchesHash(passcode: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(passcode, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

function validateNew(passcode: string) {
  if (passcode.length < PASSCODE_MIN_LENGTH) fail(`Use at least ${PASSCODE_MIN_LENGTH} characters`);
  if (passcode.length > 200) fail("That passcode is too long");
  if (/^(.)\1+$/.test(passcode) || "01234567890".includes(passcode) || "09876543210".includes(passcode)) fail("Pick something less guessable than a repeated or sequential passcode");
}

export async function isPasscodeSet(db: Db): Promise<boolean> {
  return !!(await getSettings(db)).authHash;
}

/** First-run setup. Refuses once a passcode exists, so it can't be used to take over the app. */
export async function createPasscode(db: Db, passcode: string): Promise<void> {
  validateNew(passcode);
  if (await isPasscodeSet(db)) fail("A passcode is already set. Sign in instead.");
  await setSettings(db, { authHash: await hashPasscode(passcode), authSecret: randomBytes(32).toString("base64url") });
}

export async function checkPasscode(db: Db, passcode: string): Promise<boolean> {
  const { authHash } = await getSettings(db);
  return !!authHash && (await matchesHash(passcode, authHash));
}

/** Changing the passcode also signs out every other device. */
export async function changePasscode(db: Db, current: string, next: string): Promise<void> {
  if (!(await checkPasscode(db, current))) fail("The current passcode is wrong");
  validateNew(next);
  await setSettings(db, { authHash: await hashPasscode(next), authSecret: randomBytes(32).toString("base64url") });
}

export async function signOutEverywhere(db: Db): Promise<void> {
  await setSettings(db, { authSecret: randomBytes(32).toString("base64url") });
}

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(`gpa-session:${payload}`).digest("base64url");

export async function issueSession(db: Db, now = Date.now()): Promise<string> {
  const { authSecret } = await getSettings(db);
  if (!authSecret) fail("Set a passcode first");
  const issued = String(Math.floor(now / 1000));
  return `v1.${issued}.${sign(authSecret!, issued)}`;
}

export async function verifySession(db: Db, token: string | undefined, now = Date.now()): Promise<boolean> {
  const [version, issued, mac] = token?.split(".") ?? [];
  if (version !== "v1" || !issued || !mac || !/^\d+$/.test(issued)) return false;
  const age = now / 1000 - Number(issued);
  if (age < -60 || age > SESSION_MAX_AGE_S) return false;
  const { authSecret } = await getSettings(db);
  if (!authSecret) return false;
  const expected = Buffer.from(sign(authSecret, issued));
  const actual = Buffer.from(mac);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Slows down guessing: after 5 wrong passcodes in a row, sign-in locks for 30 seconds, doubling each
 * further miss up to 15 minutes. A correct passcode resets it.
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
