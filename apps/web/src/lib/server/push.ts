import webpush from "web-push";
import type { PushSender } from "@gpa/db";

/**
 * Web Push with this app's own VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Without them notifications are
 * simply unavailable. Generate a pair with `npx web-push generate-vapid-keys`.
 */
export const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://localhost");
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export const webPushSender: PushSender = async (sub, message) => {
  configure();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 12 * 60 * 60 });
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.warn("[gpa] push failed", status, error instanceof Error ? error.message : error);
    return "failed";
  }
};
