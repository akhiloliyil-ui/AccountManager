import type { Metadata } from "next";
import { listPdfImports } from "@gpa/db";
import { PdfUploadScreen } from "@/components/screens/pdf-import";
import { requestDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Upload PDF" };

export default async function Page() {
  const db = await requestDb();
  return <PdfUploadScreen imports={await listPdfImports(db)} />;
}
