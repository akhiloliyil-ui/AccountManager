import type { Metadata } from "next";
import { listPushSubscriptions } from "@gpa/db";
import { NotificationsCard } from "@/components/pwa";
import { SecuritySettings } from "@/components/screens/settings";
import { requestSession } from "@/lib/server/db";
import { vapidPublicKey } from "@/lib/server/push";

export const metadata: Metadata = { title: "My account" };

export default async function Page() {
  const { db, access } = await requestSession();
  const devices = await listPushSubscriptions(db, access.userId);
  return (
    <SecuritySettings>
      <NotificationsCard vapidKey={vapidPublicKey} devices={devices.map((d) => ({ endpoint: d.endpoint, label: d.label }))} />
    </SecuritySettings>
  );
}
