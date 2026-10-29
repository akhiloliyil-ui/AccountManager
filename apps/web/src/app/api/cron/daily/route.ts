import { todayIso } from "@gpa/core";
import { sendDailyReminders } from "@gpa/db";
import { getDb } from "@/lib/server/db";
import { pushConfigured, webPushSender } from "@/lib/server/push";

/**
 * Runs once a day (vercel.json crons, 05:00 UTC = 09:00 in Dubai). Vercel sends CRON_SECRET as a bearer token;
 * anything else is refused, so this can't be triggered from outside.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const today = todayIso();
  const reminders = pushConfigured() ? await sendDailyReminders(db, today, webPushSender) : "push not configured";
  return Response.json({ today, reminders });
}
