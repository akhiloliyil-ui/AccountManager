import { requestSession } from "@/lib/server/db";
import { isBackupPath, readStoredBackup } from "@/lib/server/backup-store";

/** Downloads one of the automatic backups. Admins only. */
export async function GET(request: Request) {
  const { access } = await requestSession();
  if (access.role !== "admin") return new Response("Only an admin can download a backup", { status: 403 });
  const pathname = new URL(request.url).searchParams.get("file") ?? "";
  if (!isBackupPath(pathname)) return new Response("Not found", { status: 404 });
  const bytes = await readStoredBackup(pathname);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${pathname.slice("backups/".length)}"`,
      "Cache-Control": "no-store",
    },
  });
}
