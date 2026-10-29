import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPdfImport } from "@gpa/db";
import { PdfReviewScreen } from "@/components/screens/pdf-import";
import { requestSession } from "@/lib/server/db";

export const metadata: Metadata = { title: "Review offers" };

export default async function Page({ params }: PageProps<"/offers/import/[id]">) {
  const { db } = await requestSession();
  const { id } = await params;
  const found = await getPdfImport(db, id);
  if (!found) notFound();
  return <PdfReviewScreen imp={found.import} lines={found.lines} />;
}
