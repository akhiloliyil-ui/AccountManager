import type { Metadata } from "next";
import { BackupSettings } from "@/components/screens/backup";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "Backup & restore" };

export default async function Page() {
  const { access } = await requestAdmin();
  return <BackupSettings isOwner={access.isOwner} />;
}
