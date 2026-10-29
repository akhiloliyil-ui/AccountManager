import { createBackup, encodeBackup } from "@gpa/db";
import { todayIso } from "@gpa/core";
import { requestSession } from "@/lib/server/db";

/** Downloads everything as a gzipped JSON backup. Admins only. */
export async function GET() {
  const { db, access } = await requestSession();
  if (access.role !== "admin") return new Response("Only an admin can download a backup", { status: 403 });
  const bytes = encodeBackup(await createBackup(db, access));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="gpa-backup-${todayIso()}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
