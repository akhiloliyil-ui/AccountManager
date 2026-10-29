"use server";

import type { Promo, StatementRow } from "@gpa/core";
import {
  addPdfLine,
  assertCanWrite,
  assertCanWriteImportBatch,
  commitStatement,
  createPdfImport,
  discardPdfImport,
  extractPdfText,
  MAX_UPLOAD_BYTES,
  previewStatement,
  publishPdfImport,
  readStatementFile,
  undoImportBatch,
  updatePdfImport,
  updatePdfLine,
  ValidationError,
  type CommitLine,
  type LinePatch,
} from "@gpa/db";
import { runAction } from "@/lib/server/action";

function fileFrom(form: FormData): File {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ValidationError("Choose a file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Files must be 15 MB or smaller");
  return file;
}

/** Statement step 1: read a CSV/Excel file into a grid for column mapping in the browser. */
export async function readStatement(form: FormData) {
  return runAction(async (_db, access) => {
    assertCanWrite(access);
    const file = fileFrom(form);
    if (!/\.(csv|txt|xlsx|xlsm|xls|ods)$/i.test(file.name)) throw new ValidationError("Upload a CSV or Excel statement");
    const grid = await readStatementFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (grid.length < 2) throw new ValidationError("No rows found in this file");
    return { filename: file.name, grid: grid.slice(0, 5000) };
  });
}

export async function previewStatementAction(accountId: string, rows: StatementRow[]) {
  return runAction((db, access) => (assertCanWrite(access, [accountId]), previewStatement(db, accountId, rows)));
}

export async function commitStatementAction(input: { accountId: string; filename: string; rowCount: number; lines: CommitLine[] }) {
  // Lines booked as transfers touch a second account, which must be the person's too.
  return runAction((db, access) => (assertCanWrite(access, [input.accountId, ...input.lines.map((l) => l.transferAccountId)]), commitStatement(db, { ...input, by: access.userId })));
}

export async function undoImportAction(batchId: string) {
  return runAction(async (db, access) => {
    await assertCanWriteImportBatch(db, access, batchId);
    return undoImportBatch(db, batchId);
  });
}

/** Promotion PDF: store the file, read its text layer and propose offers for review. */
export async function uploadPromotionPdf(form: FormData) {
  return runAction(async (db, access) => {
    assertCanWrite(access);
    const file = fileFrom(form);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new ValidationError("That file is not a PDF");
    let extracted: { text: string; pages: number };
    try {
      extracted = await extractPdfText(bytes);
    } catch {
      throw new ValidationError("This PDF could not be read. It may be encrypted or damaged.");
    }
    const storeId = (form.get("storeId") as string | null) || null;
    const validTo = (form.get("validTo") as string | null) || null;
    return createPdfImport(db, { filename: file.name, bytes, ...extracted, storeId, validTo });
  });
}

export async function updatePdfImportAction(id: string, patch: { storeId?: string | null; validTo?: string | null }) {
  return runAction((db, access) => (assertCanWrite(access), updatePdfImport(db, id, patch)));
}

export async function updatePdfLineAction(lineId: string, patch: LinePatch) {
  return runAction((db, access) => (assertCanWrite(access), updatePdfLine(db, lineId, patch)));
}

export async function addPdfLineAction(importId: string, input: { productId: string; priceFils: number; regularFils?: number | null; promo?: Promo | null }) {
  return runAction((db, access) => (assertCanWrite(access), addPdfLine(db, importId, input)));
}

export async function publishPdfImportAction(id: string) {
  return runAction((db, access) => (assertCanWrite(access), publishPdfImport(db, id)));
}

export async function discardPdfImportAction(id: string) {
  return runAction((db, access) => (assertCanWrite(access), discardPdfImport(db, id)));
}
