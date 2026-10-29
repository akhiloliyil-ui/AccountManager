import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { guessMapping, normalizeStatement } from "@gpa/core";
import { extractPdfText, readStatementFile, type DbHandle } from "./index";
import { getCatalog } from "./services/grocery";
import { createAccount, createTransaction, listTransactions } from "./services/money";
import {
  addPdfLine,
  createPdfImport,
  discardPdfImport,
  getPdfImport,
  publishPdfImport,
  updatePdfImport,
  updatePdfLine,
} from "./services/pdf-offers";
import { commitStatement, createRule, previewStatement, undoImportBatch } from "./services/statements";
import { makePdf, testDb } from "./test-utils";

let h: DbHandle;
beforeAll(async () => {
  h = await testDb();
});
afterAll(() => h.close());

const csv = `Account Statement
Txn Date,Value Date,Narration,Withdrawal,Deposit,Balance
01/10/2026,01/10/2026,SALARY OCT 2026,,"10,500.00","15,500.00"
02/10/2026,02/10/2026,POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI,27.34,,"15,472.66"
02/10/2026,02/10/2026,POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI,27.34,,"15,445.32"
04/10/2026,04/10/2026,SHAWARMA HOUSE JLT 5521,64.50,,"15,380.82"
05/10/2026,05/10/2026,TRANSFER TO CARD,"1,200.00",,"14,180.82"
`;

async function load(bytes: Uint8Array, filename: string) {
  const grid = await readStatementFile(bytes, filename);
  return normalizeStatement(grid, guessMapping(grid)).rows;
}

describe("bank statement import", () => {
  let account: string;
  let card: string;

  beforeAll(async () => {
    account = await createAccount(h.db, { groupId: "g-accounts", name: "Salary Account", currency: "AED" });
    card = await createAccount(h.db, { groupId: "g-card", name: "Card", currency: "AED" });
    // History teaches the importer that this restaurant is eating out (no seeded rule covers it).
    await createTransaction(h.db, {
      type: "expense",
      date: "2026-09-10",
      accountId: card,
      amount: 3000,
      categoryId: "e-food--eating-out",
      description: "SHAWARMA HOUSE JLT 1234",
    });
  });

  it("previews with rule and history suggestions", async () => {
    const preview = await previewStatement(h.db, account, await load(new TextEncoder().encode(csv), "statement.csv"));
    expect(preview.map((p) => [p.kind, p.amount, p.suggestion?.categoryId ?? null, p.duplicate])).toEqual([
      ["income", 1050000, "i-salary", false],
      ["expense", -2734, "e-shopping--grocery", false],
      ["expense", -2734, "e-shopping--grocery", false],
      ["expense", -6450, "e-food--eating-out", false],
      ["expense", -120000, null, false],
    ]);
    expect(preview[3]!.suggestion!.reason).toBe("history");
  });

  it("commits, flags re-imports as duplicates, and undoes a batch", async () => {
    const rows = await load(new TextEncoder().encode(csv), "statement.csv");
    const preview = await previewStatement(h.db, account, rows);
    const lines = preview.map((p, i) => ({
      date: p.date,
      description: p.description,
      amount: p.amount,
      hash: p.hash,
      categoryId: p.suggestion?.categoryId ?? null,
      transferAccountId: i === 4 ? card : null,
    }));
    const first = await commitStatement(h.db, { accountId: account, filename: "statement.csv", rowCount: rows.length, lines });
    expect(first).toMatchObject({ imported: 5, skipped: 0 });

    const booked = await listTransactions(h.db, { accountId: account });
    expect(booked.find((t) => t.type === "transfer")).toMatchObject({ toAccountId: card, amount: 120000 });
    expect(booked.filter((t) => t.categoryId === "e-shopping--grocery")).toHaveLength(2);

    const again = await previewStatement(h.db, account, rows);
    expect(again.every((p) => p.duplicate)).toBe(true);
    const second = await commitStatement(h.db, { accountId: account, filename: "statement.csv", rowCount: rows.length, lines });
    expect(second).toMatchObject({ imported: 0, skipped: 5 });

    expect(await undoImportBatch(h.db, first.batchId)).toBe(5);
    expect(await listTransactions(h.db, { accountId: account })).toEqual([]);
  });

  it("reads the same statement from an Excel workbook with real date cells", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Transaction Date", "Description", "Amount (AED)"],
      [new Date(Date.UTC(2026, 9, 2)), "CARREFOUR MOE", -27.34],
      [new Date(Date.UTC(2026, 9, 3)), "REFUND AMAZON", 99.5],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Statement");
    const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const rows = await load(bytes, "statement.xlsx");
    expect(rows.map((r) => [r.date, r.amount])).toEqual([
      ["2026-10-02", -2734],
      ["2026-10-03", 9950],
    ]);
  });

  it("applies user rules ahead of the seeded ones", async () => {
    await createRule(h.db, { pattern: "carrefour moe", categoryId: "e-household--kitchen" });
    const preview = await previewStatement(h.db, account, await load(new TextEncoder().encode(csv), "statement.csv"));
    expect(preview[1]!.suggestion).toEqual({ categoryId: "e-household--kitchen", reason: "rule" });
  });
});

describe("promotion PDF upload -> review -> publish", () => {
  const flyer = makePdf([
    "LULU WEEKLY SAVER",
    "Al Rawabi Fresh Milk 2L AED 8.95 10.50",
    "India Gate Basmati Rice 5kg AED 34.50",
    "Samsung Galaxy Buds AED 299.00",
  ]);

  it("extracts the text layer of a real PDF", async () => {
    const { text, pages } = await extractPdfText(flyer);
    expect(pages).toBe(1);
    expect(text).toContain("Al Rawabi Fresh Milk 2L AED 8.95 10.50");
  });

  it("creates a review with matched and unmatched lines and publishes only reviewed ones", async () => {
    const { text, pages } = await extractPdfText(flyer);
    const { id, lines } = await createPdfImport(h.db, { filename: "lulu-weekly.pdf", bytes: flyer, text, pages, validTo: "2026-11-04" });
    expect(lines).toBe(3);

    const review = (await getPdfImport(h.db, id))!;
    expect(review.import.storeId).toBe("lulu");
    expect(review.lines.map((l) => [l.productId, l.include])).toEqual([
      ["milk", true],
      ["rice", true],
      [null, false],
    ]);

    // Reviewer corrects the rice price and adds a line the parser could not read.
    await updatePdfLine(h.db, review.lines[1]!.id, { priceFils: 3450, regularFils: 3995 });
    await addPdfLine(h.db, id, { productId: "eggs", priceFils: 1650, regularFils: 1850 });
    await updatePdfImport(h.db, id, { validTo: "2026-11-04" });

    expect(await publishPdfImport(h.db, id, "2026-10-29")).toEqual({ published: 3 });
    const catalog = await getCatalog(h.db, "2026-10-29");
    const price = (productId: string) => catalog.prices.find((p) => p.storeId === "lulu" && p.productId === productId)!;
    expect(price("milk")).toMatchObject({ priceFils: 1050, promo: { type: "price_cut", priceFils: 895 }, source: "pdf", promoValidTo: "2026-11-04" });
    expect(price("rice")).toMatchObject({ priceFils: 3995, promo: { type: "price_cut", priceFils: 3450 } });
    expect(catalog.offers.find((o) => o.productId === "eggs" && o.storeId === "lulu")!.source).toBe("lulu-weekly.pdf");

    await expect(publishPdfImport(h.db, id)).rejects.toThrow("Already published");
  });

  it("requires a store and at least one matched line", async () => {
    const empty = makePdf(["Nothing priced here"]);
    const { text, pages } = await extractPdfText(empty);
    const { id } = await createPdfImport(h.db, { filename: "scan.pdf", bytes: empty, text, pages });
    await expect(publishPdfImport(h.db, id)).rejects.toThrow("Choose which store");
    await updatePdfImport(h.db, id, { storeId: "union" });
    await expect(publishPdfImport(h.db, id)).rejects.toThrow("at least one line");
    await discardPdfImport(h.db, id);
    expect((await getPdfImport(h.db, id))!.import.status).toBe("discarded");
  });
});
