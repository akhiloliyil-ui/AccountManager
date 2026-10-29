import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIso } from "@gpa/core";
import type { DbHandle } from "./index";
import { authenticate, createOwner, createUser, issueSession, verifySession } from "./services/auth";
import { createAccount, createTransaction } from "./services/money";
import { deletePushSubscription, listPushSubscriptions, savePushSubscription, sendDailyReminders, type PushMessage, type PushSender } from "./services/push";
import { testDb } from "./test-utils";

let h: DbHandle;
let ownerId = "";
let priyaId = "";
const today = todayIso();
const later = addDays(today, 3);
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `k${n}`, auth: `a${n}` }, label: `Device ${n}` });

beforeAll(async () => {
  h = await testDb();
  ownerId = (await createOwner(h.db, { username: "akhil", displayName: "Akhil", password: "owner-pass-2026" })).id;
  const owner = (await verifySession(h.db, await issueSession(h.db, (await authenticate(h.db, "akhil", "owner-pass-2026"))!)))!;
  const family = await createAccount(h.db, { groupId: "g-cash", name: "Family", currency: "AED" });
  const mine = await createAccount(h.db, { groupId: "g-card", name: "My card", currency: "AED" });
  priyaId = await createUser(h.db, owner, { username: "priya", displayName: "Priya", password: "priya-pass-2026", role: "write", allAccounts: false, accountIds: [family] });
  // Bills that fall due tomorrow: by `later` they're 2 days overdue.
  await createTransaction(h.db, { type: "expense", date: addDays(today, 1), accountId: mine, amount: 9000, note: "Phone EMI", schedule: { mode: "installment", count: 2, frequency: "monthly" } });
  await createTransaction(h.db, { type: "expense", date: addDays(today, 3), accountId: family, amount: 5000, note: "Cleaner", schedule: { mode: "repeat", count: 2, frequency: "weekly" } });
});
afterAll(() => h.close());

describe("push notifications", () => {
  it("saves one row per device and moves an endpoint to whoever subscribed last", async () => {
    await savePushSubscription(h.db, ownerId, sub(1));
    await savePushSubscription(h.db, ownerId, sub(2));
    await savePushSubscription(h.db, priyaId, sub(3));
    await savePushSubscription(h.db, priyaId, sub(2));
    expect((await listPushSubscriptions(h.db, ownerId)).map((s) => s.endpoint)).toEqual(["https://push.example/1"]);
    expect((await listPushSubscriptions(h.db, priyaId)).length).toBe(2);
    await expect(savePushSubscription(h.db, ownerId, { endpoint: "http://insecure", keys: { p256dh: "x", auth: "y" } })).rejects.toThrow(/invalid/);
  });

  it("sends each person only their own due bills, and drops devices that are gone", async () => {
    const sent: { endpoint: string; message: PushMessage }[] = [];
    const send: PushSender = async (s, message) => {
      sent.push({ endpoint: s.endpoint, message });
      return s.endpoint.endsWith("/3") ? "gone" : "sent";
    };
    const result = await sendDailyReminders(h.db, later, send);
    expect(result).toEqual({ people: 2, sent: 2, removed: 1 });

    const toOwner = sent.find((s) => s.endpoint.endsWith("/1"))!.message;
    expect(toOwner).toMatchObject({ title: "2 bills to confirm", url: "/transactions/bills", tag: "bills" });
    expect(toOwner.body).toContain("Phone EMI (2d late)");
    expect(toOwner.body).toContain("Cleaner (today)");
    const toPriya = sent.find((s) => s.endpoint.endsWith("/2"))!.message;
    expect(toPriya).toMatchObject({ title: "1 bill to confirm", body: "Cleaner (today)" });

    expect((await listPushSubscriptions(h.db, priyaId)).map((s) => s.endpoint)).toEqual(["https://push.example/2"]);
    expect((await listPushSubscriptions(h.db, ownerId))[0]!.lastSentAt).not.toBeNull();
  });

  it("says nothing when nothing is due, and unsubscribes", async () => {
    const send: PushSender = async () => "sent";
    expect(await sendDailyReminders(h.db, today, send)).toEqual({ people: 0, sent: 0, removed: 0 });
    await deletePushSubscription(h.db, ownerId, "https://push.example/1");
    expect(await listPushSubscriptions(h.db, ownerId)).toEqual([]);
  });
});
