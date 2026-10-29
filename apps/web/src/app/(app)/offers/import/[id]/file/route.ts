import { getPdfFile } from "@gpa/db";
import { requestDb } from "@/lib/server/db";

/** The uploaded flyer, for checking prices during review. */
export async function GET(_req: Request, { params }: RouteContext<"/offers/import/[id]/file">) {
  const db = await requestDb();
  const file = await getPdfFile(db, (await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${file.filename.replace(/[^\w.-]+/g, "_")}"`,
      "cache-control": "private, no-store",
    },
  });
}
