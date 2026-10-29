import { todayIso } from "@gpa/core";
import { sendDailyReminders } from "@gpa/db";
import { getDb } from "@/lib/server/db";
import { backupStoreConfigured, listStoredBackups, storeBackup } from "@/lib/server/backup-store";
import { pushConfigured, webPushSender } from "@/lib/server/push";

/**
 * Runs once a day (vercel.json crons, 05:00 UTC = 09:00 in Dubai): bill reminders, and the weekly backup. Vercel sends CRON_SECRET as a bearer token;
 * anything else is refused, so this can't be triggered from outside.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const today = todayIso();
  const reminders = pushConfigured() ? await sendDailyReminders(db, today, webPushSender) : "push not configured";
  // Weekly backup: whenever the newest stored one is a week old, so a missed day catches up the next.
  let backup: unknown = "backup storage not configured";
  if (backupStoreConfigured()) {
    const [newest] = await listStoredBackups();
    backup = !newest || Date.now() - newest.uploadedAt.getTime() >= 7 * 86_400_000 - 3_600_000 ? await storeBackup(db) : "not due";
  }
  return Response.json({ today, reminders, backup });
}
