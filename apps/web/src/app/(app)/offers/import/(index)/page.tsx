import type { Metadata } from "next";
import { listPdfImports } from "@gpa/db";
import { PdfUploadScreen } from "@/components/screens/pdf-import";
import { requestSession } from "@/lib/server/db";
import { AccessGuard } from "@/components/providers";

export const metadata: Metadata = { title: "Upload PDF" };

export default async function Page() {
  const { db } = await requestSession();
  return (
    <AccessGuard need="write" note="View only: your access is read-only.">
      <PdfUploadScreen imports={await listPdfImports(db)} />
    </AccessGuard>
  );
}
