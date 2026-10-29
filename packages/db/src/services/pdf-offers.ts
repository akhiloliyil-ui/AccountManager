import { asc, desc, eq, inArray } from "drizzle-orm";
import { matchProduct, parseOfferText, todayIso, type Promo } from "@gpa/core";
import type { Db } from "../client";
import { pdfImportLines, pdfImports, products, storePrices, stores } from "../schema";
import { ValidationError } from "./money";

/**
 * Promotion PDF pipeline: upload -> text extraction -> candidate offers matched to the catalogue
 * -> human review -> publish into store prices. Nothing reaches price comparisons before review.
 */

export type PdfImportRow = Omit<typeof pdfImports.$inferSelect, "file">;
export type PdfLineRow = typeof pdfImportLines.$inferSelect;

export async function createPdfImport(
  db: Db,
  input: { filename: string; bytes: Uint8Array; text: string; pages: number; storeId?: string | null; validTo?: string | null },
): Promise<{ id: string; lines: number }> {
  const candidates = parseOfferText(input.text);
  const catalog = await db.select({ id: products.id, name: products.name, brand: products.brand }).from(products);
  const storeId = input.storeId ?? (await guessStore(db, `${input.filename}\n${input.text.slice(0, 2000)}`));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pdfImports)
      .values({
        filename: input.filename,
        storeId,
        pageCount: input.pages,
        validTo: input.validTo ?? null,
        file: input.bytes,
        textLength: input.text.trim().length,
      })
      .returning({ id: pdfImports.id });
    if (candidates.length) {
      await tx.insert(pdfImportLines).values(
        candidates.map((c) => {
          const match = matchProduct(c.name, catalog.map((p) => ({ ...p, brand: p.brand ?? undefined })));
          return {
            importId: row!.id,
            line: c.line,
            rawText: c.text,
            name: c.name,
            productId: match?.productId ?? null,
            matchScore: match?.score ?? null,
            priceFils: c.priceFils,
            regularFils: c.regularFils ?? null,
            promo: c.promo ?? null,
            // Unmatched lines start excluded; the reviewer opts them in after choosing a product.
            include: !!match,
          };
        }),
      );
    }
    return { id: row!.id, lines: candidates.length };
  });
}

async function guessStore(db: Db, text: string): Promise<string | null> {
  const all = await db.select({ id: stores.id, name: stores.name }).from(stores);
  const lower = text.toLowerCase();
  return all.find((s) => lower.includes(s.name.toLowerCase()) || lower.includes(s.id))?.id ?? null;
}

export async function listPdfImports(db: Db): Promise<(PdfImportRow & { lineCount: number })[]> {
  const rows = await db
    .select({
      id: pdfImports.id,
      filename: pdfImports.filename,
      storeId: pdfImports.storeId,
      status: pdfImports.status,
      pageCount: pdfImports.pageCount,
      validTo: pdfImports.validTo,
      textLength: pdfImports.textLength,
      createdAt: pdfImports.createdAt,
      publishedAt: pdfImports.publishedAt,
    })
    .from(pdfImports)
    .orderBy(desc(pdfImports.createdAt))
    .limit(30);
  if (!rows.length) return [];
  const lines = await db
    .select({ importId: pdfImportLines.importId })
    .from(pdfImportLines)
    .where(inArray(pdfImportLines.importId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, lineCount: lines.filter((l) => l.importId === r.id).length }));
}

export async function getPdfImport(db: Db, id: string): Promise<{ import: PdfImportRow; lines: PdfLineRow[] } | null> {
  const [row] = await db
    .select({
      id: pdfImports.id,
      filename: pdfImports.filename,
      storeId: pdfImports.storeId,
      status: pdfImports.status,
      pageCount: pdfImports.pageCount,
      validTo: pdfImports.validTo,
      textLength: pdfImports.textLength,
      createdAt: pdfImports.createdAt,
      publishedAt: pdfImports.publishedAt,
    })
    .from(pdfImports)
    .where(eq(pdfImports.id, id));
  if (!row) return null;
  const lines = await db.select().from(pdfImportLines).where(eq(pdfImportLines.importId, id)).orderBy(asc(pdfImportLines.line));
  return { import: row, lines };
}

export async function getPdfFile(db: Db, id: string): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const [row] = await db.select({ filename: pdfImports.filename, file: pdfImports.file }).from(pdfImports).where(eq(pdfImports.id, id));
  return row?.file ? { filename: row.filename, bytes: row.file } : null;
}

export async function updatePdfImport(db: Db, id: string, patch: { storeId?: string | null; validTo?: string | null }) {
  await db.update(pdfImports).set(patch).where(eq(pdfImports.id, id));
}

export interface LinePatch {
  productId?: string | null;
  name?: string;
  priceFils?: number;
  regularFils?: number | null;
  promo?: Promo | null;
  include?: boolean;
}

export async function updatePdfLine(db: Db, lineId: string, patch: LinePatch) {
  if (patch.priceFils !== undefined && (!Number.isInteger(patch.priceFils) || patch.priceFils <= 0)) {
    throw new ValidationError("Enter a price above zero");
  }
  await db.update(pdfImportLines).set(patch).where(eq(pdfImportLines.id, lineId));
}

/** Adds a line by hand, for flyers whose prices are images without a text layer. */
export async function addPdfLine(db: Db, importId: string, input: { productId: string; priceFils: number; regularFils?: number | null; promo?: Promo | null }) {
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product) throw new ValidationError("Choose a product");
  const existing = await db.select({ line: pdfImportLines.line }).from(pdfImportLines).where(eq(pdfImportLines.importId, importId));
  const [row] = await db
    .insert(pdfImportLines)
    .values({
      importId,
      line: existing.reduce((m, l) => Math.max(m, l.line), 0) + 1,
      rawText: "(added by hand)",
      name: product.name,
      productId: product.id,
      priceFils: input.priceFils,
      regularFils: input.regularFils ?? null,
      promo: input.promo ?? null,
      include: true,
    })
    .returning();
  return row!.id;
}

/**
 * Publishes the included, matched lines as store prices. A line with a regular price stores that
 * as the shelf price and the offer as its promo; otherwise the offer price becomes the shelf price.
 */
export async function publishPdfImport(db: Db, id: string, today = todayIso()): Promise<{ published: number }> {
  const found = await getPdfImport(db, id);
  if (!found) throw new ValidationError("Import not found");
  const { import: imp, lines } = found;
  if (imp.status === "published") throw new ValidationError("Already published");
  if (!imp.storeId) throw new ValidationError("Choose which store this flyer is from");
  const ready = lines.filter((l) => l.include && l.productId);
  if (!ready.length) throw new ValidationError("Include at least one line matched to a product");

  await db.transaction(async (tx) => {
    for (const l of ready) {
      const promo: Promo | null = l.promo ?? (l.regularFils && l.regularFils > l.priceFils ? { type: "price_cut", priceFils: l.priceFils } : null);
      const values = {
        priceFils: promo ? (l.regularFils ?? l.priceFils) : l.priceFils,
        promo,
        promoValidTo: promo ? imp.validTo : null,
        source: "pdf" as const,
        sourceLabel: imp.filename,
        pdfImportId: imp.id,
        observedAt: today,
      };
      await tx
        .insert(storePrices)
        .values({ productId: l.productId!, storeId: imp.storeId!, ...values })
        .onConflictDoUpdate({ target: [storePrices.productId, storePrices.storeId], set: values });
    }
    await tx.update(pdfImports).set({ status: "published", publishedAt: new Date() }).where(eq(pdfImports.id, id));
  });
  return { published: ready.length };
}

export async function discardPdfImport(db: Db, id: string) {
  await db.update(pdfImports).set({ status: "discarded", file: null }).where(eq(pdfImports.id, id));
}
