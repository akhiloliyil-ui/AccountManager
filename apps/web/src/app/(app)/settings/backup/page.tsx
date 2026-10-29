import type { Metadata } from "next";
import { BackupSettings } from "@/components/screens/backup";
import { backupStoreConfigured, KEEP, listStoredBackups } from "@/lib/server/backup-store";
import { requestAdmin } from "@/lib/server/db";

export const metadata: Metadata = { title: "Backup & restore" };

export default async function Page() {
  const { access } = await requestAdmin();
  const automatic = backupStoreConfigured() ? { keep: KEEP, backups: await listStoredBackups() } : null;
  return <BackupSettings isOwner={access.isOwner} automatic={automatic} />;
}
