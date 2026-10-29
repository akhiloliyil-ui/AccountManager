import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "./index";
import {
  changePasscode,
  checkPasscode,
  createPasscode,
  createSignInThrottle,
  isPasscodeSet,
  issueSession,
  SESSION_MAX_AGE_S,
  signOutEverywhere,
  verifySession,
} from "./services/auth";
import { getSettings } from "./settings";
import { testDb } from "./test-utils";

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(() => h.close());

describe("household passcode", () => {
  it("starts with no passcode and refuses weak ones", async () => {
    expect(await isPasscodeSet(h.db)).toBe(false);
    expect(await checkPasscode(h.db, "anything")).toBe(false);
    await expect(issueSession(h.db)).rejects.toThrow(/Set a passcode first/);
    for (const weak of ["12345", "111111", "123456", "987654"]) await expect(createPasscode(h.db, weak)).rejects.toThrow();
  });

  it("stores only a hash, and can be created once", async () => {
    await createPasscode(h.db, "dubai-2026");
    const { authHash } = await getSettings(h.db);
    expect(authHash).toMatch(/^scrypt\$/);
    expect(authHash).not.toContain("dubai-2026");
    expect(await checkPasscode(h.db, "dubai-2026")).toBe(true);
    expect(await checkPasscode(h.db, "Dubai-2026")).toBe(false);
    await expect(createPasscode(h.db, "attacker-pass")).rejects.toThrow(/already set/);
    expect(await checkPasscode(h.db, "dubai-2026")).toBe(true);
  });

  it("accepts its own session tokens only, until they expire", async () => {
    const now = Date.now();
    const token = await issueSession(h.db, now);
    expect(await verifySession(h.db, token, now)).toBe(true);
    expect(await verifySession(h.db, token, now + (SESSION_MAX_AGE_S - 60) * 1000)).toBe(true);
    expect(await verifySession(h.db, token, now + (SESSION_MAX_AGE_S + 60) * 1000)).toBe(false);

    const [v, issued, mac] = token.split(".");
    expect(await verifySession(h.db, `${v}.${Number(issued) + 1000}.${mac}`, now)).toBe(false);
    expect(await verifySession(h.db, `${v}.${issued}.${mac!.slice(0, -2)}xx`, now)).toBe(false);
    expect(await verifySession(h.db, undefined, now)).toBe(false);
    expect(await verifySession(h.db, "garbage", now)).toBe(false);
  });

  it("signs every device out when asked or when the passcode changes", async () => {
    const before = await issueSession(h.db);
    await signOutEverywhere(h.db);
    expect(await verifySession(h.db, before)).toBe(false);

    const again = await issueSession(h.db);
    await expect(changePasscode(h.db, "wrong-one", "new-pass-99")).rejects.toThrow(/current passcode is wrong/);
    expect(await verifySession(h.db, again)).toBe(true);
    await changePasscode(h.db, "dubai-2026", "new-pass-99");
    expect(await verifySession(h.db, again)).toBe(false);
    expect(await checkPasscode(h.db, "dubai-2026")).toBe(false);
    expect(await checkPasscode(h.db, "new-pass-99")).toBe(true);
  });
});

describe("sign-in throttle", () => {
  it("allows a few mistakes, then locks for longer each time, and resets on success", () => {
    const t = createSignInThrottle();
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) t.failed(now);
    expect(t.wait(now)).toBe(0);
    t.failed(now);
    expect(t.wait(now)).toBe(30_000);
    t.failed(now);
    expect(t.wait(now)).toBe(60_000);
    for (let i = 0; i < 20; i++) t.failed(now);
    expect(t.wait(now)).toBe(15 * 60_000);
    expect(t.wait(now + 15 * 60_000)).toBe(0);
    t.succeeded();
    t.failed(now);
    expect(t.wait(now)).toBe(0);
  });
});
