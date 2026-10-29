import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "./index";
import {
  assertCanWrite,
  assertCanWriteTransaction,
  authenticate,
  changeOwnPassword,
  createOwner,
  createSignInThrottle,
  createUser,
  deleteUser,
  hasUsers,
  issueSession,
  listUsers,
  MAX_USERS,
  resetOwnerPassword,
  resetUserPassword,
  SESSION_MAX_AGE_S,
  signOutEverywhere,
  signOutUser,
  updateUser,
  verifySession,
  type Access,
} from "./services/auth";
import { createAccount, createTransaction, getAccountDetail, getNetWorth, listAccounts, listTransactions, statTransactions, updateTransaction } from "./services/money";
import { groceryMonthSpend } from "./services/grocery";
import { users } from "./schema";
import { testDb } from "./test-utils";

let h: DbHandle;
let owner: Access;
beforeAll(async () => {
  h = await testDb();
});
afterAll(() => h.close());

async function signedIn(username: string, password: string): Promise<Access> {
  const user = await authenticate(h.db, username, password);
  expect(user).not.toBeNull();
  return (await verifySession(h.db, await issueSession(h.db, user!)))!;
}

describe("owner and sign-in", () => {
  it("starts with nobody, and refuses weak passwords and odd usernames", async () => {
    expect(await hasUsers(h.db)).toBe(false);
    for (const password of ["short", "11111111", "12345678", "password1"]) {
      await expect(createOwner(h.db, { username: "akhil", displayName: "Akhil", password })).rejects.toThrow();
    }
    await expect(createOwner(h.db, { username: "a b", displayName: "", password: "good-pass-2026" })).rejects.toThrow(/Usernames/);
  });

  it("creates the owner once, stores only a hash and signs in case-insensitively by username", async () => {
    await createOwner(h.db, { username: "Akhil", displayName: "Akhil", password: "dubai-family-2026" });
    await expect(createOwner(h.db, { username: "intruder", displayName: "", password: "intruder-pass-1" })).rejects.toThrow(/already set up/);
    const [row] = await h.db.select().from(users).where(eq(users.username, "akhil"));
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(row!.passwordHash).not.toContain("dubai-family-2026");
    expect(await authenticate(h.db, "AKHIL", "dubai-family-2026")).not.toBeNull();
    expect(await authenticate(h.db, "akhil", "Dubai-family-2026")).toBeNull();
    expect(await authenticate(h.db, "nobody", "dubai-family-2026")).toBeNull();
    owner = await signedIn("akhil", "dubai-family-2026");
    expect(owner).toMatchObject({ role: "admin", isOwner: true, accountIds: null });
  });

  it("accepts only its own unexpired, unrevoked tokens", async () => {
    const user = (await authenticate(h.db, "akhil", "dubai-family-2026"))!;
    const now = Date.now();
    const token = await issueSession(h.db, user, now);
    expect(await verifySession(h.db, token, now)).not.toBeNull();
    expect(await verifySession(h.db, token, now + (SESSION_MAX_AGE_S + 60) * 1000)).toBeNull();
    const parts = token.split(".");
    expect(await verifySession(h.db, [parts[0], "someone-else", ...parts.slice(2)].join("."), now)).toBeNull();
    expect(await verifySession(h.db, [...parts.slice(0, 4), "forged"].join("."), now)).toBeNull();
    expect(await verifySession(h.db, undefined, now)).toBeNull();

    await signOutUser(h.db, user.id);
    expect(await verifySession(h.db, token, now)).toBeNull();
    const fresh = await issueSession(h.db, (await authenticate(h.db, "akhil", "dubai-family-2026"))!);
    await signOutEverywhere(h.db);
    expect(await verifySession(h.db, fresh)).toBeNull();
  });
});

describe("household members, roles and accounts", () => {
  let family = "";
  let personal = "";
  let savings = "";

  beforeAll(async () => {
    owner = await signedIn("akhil", "dubai-family-2026");
    family = await createAccount(h.db, { groupId: "g-cash", name: "Family Cash", currency: "AED", openingBalance: 100000 });
    personal = await createAccount(h.db, { groupId: "g-accounts", name: "Personal Bank", currency: "AED", openingBalance: 500000 });
    savings = await createAccount(h.db, { groupId: "g-savings", name: "Savings", currency: "AED", openingBalance: 900000 });
    await createTransaction(h.db, { type: "expense", date: "2026-10-05", accountId: family, amount: 12000, categoryId: "e-shopping--grocery", note: "Lulu" });
    await createTransaction(h.db, { type: "expense", date: "2026-10-06", accountId: personal, amount: 30000, categoryId: "e-shopping--grocery", note: "Private" });
    await createTransaction(h.db, { type: "transfer", date: "2026-10-07", accountId: personal, toAccountId: family, amount: 50000, note: "Top up" });
  });

  it("only admins add people, up to five in all, with unique usernames", async () => {
    await createUser(h.db, owner, { username: "priya", displayName: "Priya", password: "priya-pass-2026", role: "write", allAccounts: false, accountIds: [family] });
    const priya = await signedIn("priya", "priya-pass-2026");
    await expect(
      createUser(h.db, priya, { username: "x1", displayName: "", password: "another-pass-1", role: "read", allAccounts: true, accountIds: [] }),
    ).rejects.toThrow(/Only an admin/);
    await expect(
      createUser(h.db, owner, { username: "Priya", displayName: "", password: "another-pass-1", role: "read", allAccounts: true, accountIds: [] }),
    ).rejects.toThrow(/taken/);
    await expect(
      createUser(h.db, owner, { username: "nobody", displayName: "", password: "another-pass-1", role: "read", allAccounts: false, accountIds: [] }),
    ).rejects.toThrow(/at least one account/);

    await createUser(h.db, owner, { username: "dad", displayName: "Dad", password: "dad-pass-2026", role: "read", allAccounts: false, accountIds: [family, savings] });
    await createUser(h.db, owner, { username: "sam", displayName: "Sam", password: "sam-pass-2026", role: "admin", allAccounts: false, accountIds: [] });
    await createUser(h.db, owner, { username: "nia", displayName: "Nia", password: "nia-pass-2026", role: "write", allAccounts: true, accountIds: [] });
    expect((await listUsers(h.db)).length).toBe(MAX_USERS);
    await expect(
      createUser(h.db, owner, { username: "sixth", displayName: "", password: "sixth-pass-26", role: "read", allAccounts: true, accountIds: [] }),
    ).rejects.toThrow(/allows 5 people/);
  });

  it("limits every list, total and report to the user's accounts", async () => {
    const priya = await signedIn("priya", "priya-pass-2026");
    expect(priya.accountIds).toEqual([family]);
    expect((await listAccounts(h.db, { accountIds: priya.accountIds })).map((a) => a.name)).toEqual(["Family Cash"]);

    const txs = await listTransactions(h.db, { accountIds: priya.accountIds });
    expect(txs.map((t) => t.note).sort()).toEqual(["Lulu", "Top up"]);
    expect(txs.some((t) => t.note === "Private")).toBe(false);

    const stats = await statTransactions(h.db, { from: "2026-10-01", to: "2026-10-31" }, priya.accountIds);
    expect(stats.reduce((s, t) => s + t.amountBase, 0)).toBe(12000);

    const worth = await getNetWorth(h.db, "2026-10-31", priya.accountIds);
    expect(worth.total).toBe(100000 - 12000 + 50000);
    expect((await getNetWorth(h.db, "2026-10-31")).total).toBeGreaterThan(worth.total);

    expect(await getAccountDetail(h.db, personal, priya.accountIds)).toBeNull();
    expect((await groceryMonthSpend(h.db, "2026-10-15", priya.accountIds)).spentFils).toBe(12000);

    expect((await signedIn("nia", "nia-pass-2026")).accountIds).toBeNull();
    expect((await signedIn("sam", "sam-pass-2026")).accountIds).toBeNull();
  });

  it("write users change only their accounts; read users change nothing", async () => {
    const priya = await signedIn("priya", "priya-pass-2026");
    expect(() => assertCanWrite(priya, [family])).not.toThrow();
    expect(() => assertCanWrite(priya, [family, personal])).toThrow(/don't have access/);
    const [topUp] = await listTransactions(h.db, { q: "Top up" });
    await expect(assertCanWriteTransaction(h.db, priya, topUp!.id)).rejects.toThrow(/don't have access/);
    const [lulu] = await listTransactions(h.db, { q: "Lulu" });
    await expect(assertCanWriteTransaction(h.db, priya, lulu!.id)).resolves.toBeUndefined();

    const dad = await signedIn("dad", "dad-pass-2026");
    expect(() => assertCanWrite(dad, [family])).toThrow(/read-only/);
    await expect(assertCanWriteTransaction(h.db, dad, lulu!.id)).rejects.toThrow(/read-only/);
  });

  it("changing someone's access signs them out; the owner can't be demoted or removed", async () => {
    const priyaRow = (await listUsers(h.db)).find((u) => u.username === "priya")!;
    const token = await issueSession(h.db, (await authenticate(h.db, "priya", "priya-pass-2026"))!);
    await updateUser(h.db, owner, priyaRow.id, { role: "read", accountIds: [family, savings] });
    expect(await verifySession(h.db, token)).toBeNull();
    const priya = await signedIn("priya", "priya-pass-2026");
    expect(priya.role).toBe("read");
    expect([...priya.accountIds!].sort()).toEqual([family, savings].sort());

    const ownerRow = (await listUsers(h.db)).find((u) => u.isOwner)!;
    await expect(updateUser(h.db, owner, ownerRow.id, { role: "read" })).rejects.toThrow(/always an admin/);
    await expect(deleteUser(h.db, owner, ownerRow.id)).rejects.toThrow(/can't be removed/);
    const sam = await signedIn("sam", "sam-pass-2026");
    await expect(resetUserPassword(h.db, sam, ownerRow.id, "taken-over-2026")).rejects.toThrow(/Only the owner/);
  });

  it("resets and changes passwords, and removes people", async () => {
    const dadRow = (await listUsers(h.db)).find((u) => u.username === "dad")!;
    await resetUserPassword(h.db, owner, dadRow.id, "dad-new-pass-26");
    expect(await authenticate(h.db, "dad", "dad-pass-2026")).toBeNull();
    expect(await authenticate(h.db, "dad", "dad-new-pass-26")).not.toBeNull();

    await expect(changeOwnPassword(h.db, dadRow.id, "wrong-password", "dad-third-pass")).rejects.toThrow(/current password is wrong/);
    await changeOwnPassword(h.db, dadRow.id, "dad-new-pass-26", "dad-third-pass");
    expect(await authenticate(h.db, "dad", "dad-third-pass")).not.toBeNull();

    await deleteUser(h.db, owner, dadRow.id);
    expect(await authenticate(h.db, "dad", "dad-third-pass")).toBeNull();

    expect(await resetOwnerPassword(h.db, "owner-reset-2026")).toBe("akhil");
    expect(await authenticate(h.db, "akhil", "owner-reset-2026")).not.toBeNull();
  });
});

describe("who added and changed a transaction", () => {
  it("records the person and keeps the record when they are removed", async () => {
    const ownerRow = (await listUsers(h.db)).find((u) => u.isOwner)!;
    const nia = (await listUsers(h.db)).find((u) => u.username === "nia")!;
    const [cash] = await listAccounts(h.db);
    const [id] = await createTransaction(h.db, { type: "expense", date: "2026-10-20", accountId: cash!.id, amount: 500, note: "Tea", by: nia.id });
    await updateTransaction(h.db, id!, { type: "expense", date: "2026-10-20", accountId: cash!.id, amount: 600, note: "Tea", by: ownerRow.id });
    let [tea] = await listTransactions(h.db, { q: "Tea" });
    expect(tea).toMatchObject({ createdByName: "Nia", updatedByName: "Akhil", amount: 600 });

    await deleteUser(h.db, owner, nia.id);
    [tea] = await listTransactions(h.db, { q: "Tea" });
    expect(tea).toMatchObject({ createdByName: null, updatedByName: "Akhil", amount: 600 });
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
    t.succeeded();
    t.failed(now);
    expect(t.wait(now)).toBe(0);
  });
});
