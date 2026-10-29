import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { pushSubscriptions, users } from "../schema";
import { accessFor } from "./auth";
import { getBills } from "./bills";
import { ValidationError } from "./money";

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
}

/** Saves this device for the signed-in person. An endpoint moves to whoever subscribed on it last. */
export async function savePushSubscription(db: Db, userId: string, input: PushSubscriptionInput): Promise<void> {
  if (!/^https:\/\//.test(input.endpoint) || input.endpoint.length > 1000 || !input.keys?.p256dh || !input.keys?.auth) {
    throw new ValidationError("This browser returned an invalid notification subscription");
  }
  const values = { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, label: (input.label ?? "").slice(0, 80) };
  await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

export async function deletePushSubscription(db: Db, userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function listPushSubscriptions(db: Db, userId?: string): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(userId ? eq(pushSubscriptions.userId, userId) : undefined);
}

/** After a send: gone devices are removed, delivered ones stamped. */
export async function recordPushResults(db: Db, delivered: string[], gone: string[]): Promise<void> {
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (delivered.length) await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(inArray(pushSubscriptions.id, delivered));
}

/** People who have at least one device subscribed. */
export async function usersWithPush(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId));
  return rows.map((r) => r.userId);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
}

/** Sends one message to one device; resolves to "gone" when the browser has dropped the subscription. */
export type PushSender = (sub: PushSubscriptionRow, message: PushMessage) => Promise<"sent" | "gone" | "failed">;

/** The morning reminder for one person: bills on or past their date on the accounts they can see. */
export async function billReminderFor(db: Db, userId: string, today: string): Promise<PushMessage | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const access = await accessFor(db, user);
  const due = (await getBills(db, today, access.accountIds, 0)).filter((b) => b.due === "overdue" || b.due === "today");
  if (!due.length) return null;
  const names = due.slice(0, 3).map((b) => (b.due === "overdue" ? `${b.note || "Payment"} (${b.daysLate}d late)` : `${b.note || "Payment"} (today)`));
  return {
    title: due.length === 1 ? "1 bill to confirm" : `${due.length} bills to confirm`,
    body: names.join(", ") + (due.length > 3 ? ` and ${due.length - 3} more` : ""),
    url: "/transactions/bills",
    tag: "bills",
  };
}

/** Sends today's bill reminders to everyone with notifications on. */
export async function sendDailyReminders(db: Db, today: string, send: PushSender): Promise<{ people: number; sent: number; removed: number }> {
  let people = 0;
  const delivered: string[] = [];
  const gone: string[] = [];
  for (const userId of await usersWithPush(db)) {
    const message = await billReminderFor(db, userId, today);
    if (!message) continue;
    people += 1;
    for (const sub of await listPushSubscriptions(db, userId)) {
      const result = await send(sub, message);
      if (result === "sent") delivered.push(sub.id);
      if (result === "gone") gone.push(sub.id);
    }
  }
  await recordPushResults(db, delivered, gone);
  return { people, sent: delivered.length, removed: gone.length };
}
