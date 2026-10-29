import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import type { DbHandle } from "./index";
import { authenticate, createOwner, createUser, issueSession, verifySession, type Access } from "./services/auth";
import { createBackup, decodeBackup, encodeBackup, restoreBackup, summarizeBackup } from "./services/backup";
import { setBudget, listBudgets } from "./services/budgets";
import { createAccount, createTransaction, deleteTransaction, listAccounts, listTransactions } from "./services/money";
import { getSettings, setSettings } from "./settings";
import { testDb } from "./test-utils";

let h: DbHandle;
let owner: Access;
let admin: Access;

async function signedIn(username: string, password: string) {
  return (await verifySession(h.db, await issueSession(h.db, (await authenticate(h.db, username, password))!)))!;
}

beforeAll(async () => {
  h = await testDb();
  await createOwner(h.db, { username: "akhil", displayName: "Akhil", password: "owner-pass-2026" });
  owner = await signedIn("akhil", "owner-pass-2026");
  await createUser(h.db, owner, { username: "sam", displayName: "Sam", password: "sam-pass-2026", role: "admin", allAccounts: true, accountIds: [] });
  admin = await signedIn("sam", "sam-pass-2026");
  const bank = await createAccount(h.db, { groupId: "g-accounts", name: "Bank", currency: "AED", openingBalance: 100000 });
  const nri = await createAccount(h.db, { groupId: "g-savings", name: "NRI", currency: "INR" });
  await createTransaction(h.db, { type: "transfer", date: "2026-10-02", accountId: bank, toAccountId: nri, amount: 50000, feeAmount: 1500, note: "Home" });
  await createTransaction(h.db, { type: "expense", date: "2026-10-03", accountId: bank, amount: 9000, note: "EMI", schedule: { mode: "installment", count: 3, frequency: "monthly" } });
  await setBudget(h.db, owner, "e-food", 120000);
  await setSettings(h.db, { groceryBudgetFils: 250000 });
});
afterAll(() => h.close());

describe("backup and restore", () => {
  it("only admins back up; the file leaves out the session key and PDF files", async () => {
    const before = (await getSettings(h.db)).authSecret;
    const backup = await createBackup(h.db, admin);
    expect(backup.tables.settings!.some((r) => r.key === "authSecret")).toBe(false);
    expect(JSON.stringify(backup)).not.toContain(before!);
    expect(summarizeBackup(backup).counts.transactions).toBe(5); // transfer + its fee + 3 installments
    expect(encodeBackup(backup).length).toBeLessThan(JSON.stringify(backup).length);
  });

  it("puts everything back exactly, and signs everyone out", async () => {
    const backup = decodeBackup(encodeBackup(await createBackup(h.db, owner)));
    const txBefore = await listTransactions(h.db);
    const accountsBefore = await listAccounts(h.db);

    // Things go wrong after the backup was taken.
    await deleteTransaction(h.db, txBefore.find((t) => t.note === "Home")!.id);
    await setBudget(h.db, owner, "e-food", 0);
    await setSettings(h.db, { groceryBudgetFils: 1 });
    const token = await issueSession(h.db, (await authenticate(h.db, "akhil", "owner-pass-2026"))!);

    await expect(restoreBackup(h.db, admin, backup)).rejects.toThrow(/Only the owner/);
    const summary = await restoreBackup(h.db, owner, backup);
    expect(summary.counts.users).toBe(2);

    expect((await listTransactions(h.db)).map((t) => [t.id, t.amount, t.parentId, t.createdAt.toISOString()])).toEqual(
      txBefore.map((t) => [t.id, t.amount, t.parentId, t.createdAt.toISOString()]),
    );
    expect((await listAccounts(h.db)).map((a) => [a.name, a.balance])).toEqual(accountsBefore.map((a) => [a.name, a.balance]));
    expect(await listBudgets(h.db)).toEqual([{ categoryId: "e-food", parentCategoryId: "e-food", amount: 120000 }]);
    expect((await getSettings(h.db)).groceryBudgetFils).toBe(250000);
    expect(await verifySession(h.db, token)).toBeNull();
    expect(await authenticate(h.db, "sam", "sam-pass-2026")).not.toBeNull();
  });

  it("refuses files that aren't GPA backups, without touching anything", async () => {
    expect(() => decodeBackup(new TextEncoder().encode("hello"))).toThrow(/isn't a GPA backup/);
    expect(() => decodeBackup(gzipSync(JSON.stringify({ format: "other" })))).toThrow(/isn't a GPA backup/);
    expect(() => decodeBackup(gzipSync(JSON.stringify({ format: "gpa-backup", version: 1, schema: 999, tables: {} })))).toThrow(/newer version/);
    expect(() => decodeBackup(gzipSync(JSON.stringify({ format: "gpa-backup", version: 1, schema: 1, tables: { users: [] } })))).toThrow(/no owner/);
    expect(() => decodeBackup(new Uint8Array([0x1f, 0x8b, 1, 2, 3]))).toThrow(/couldn't be unpacked/);
  });

  it("rolls back completely when a backup is damaged part-way", async () => {
    const backup = await createBackup(h.db, owner);
    const before = (await listTransactions(h.db)).length;
    const broken = structuredClone(backup);
    broken.tables.transactions = [...broken.tables.transactions!, { ...broken.tables.transactions![0]!, id: "dup", accountId: "no-such-account" }];
    await expect(restoreBackup(h.db, owner, decodeBackup(encodeBackup(broken)))).rejects.toThrow();
    expect((await listTransactions(h.db)).length).toBe(before);
  });
});
