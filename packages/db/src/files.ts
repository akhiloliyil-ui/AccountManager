import { parseCsv, type Cell } from "@gpa/core";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Text layer of a PDF, one line per text row, pages separated by blank lines. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js takes ownership of the buffer, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { text: (text as string[]).join("\n\n"), pages: totalPages };
}

const SPREADSHEET = /\.(xlsx|xlsm|xls|ods)$/i;

/** Reads a CSV or spreadsheet statement into a grid of trimmed strings (first sheet). */
export async function readStatementFile(bytes: Uint8Array, filename: string): Promise<Cell[][]> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("File is larger than 15 MB");
  if (!SPREADSHEET.test(filename)) {
    return parseCsv(new TextDecoder("utf-8").decode(bytes));
  }
  const XLSX = await import("xlsx");
  const book = XLSX.read(bytes, { type: "array", cellDates: false, raw: false });
  const sheet = book.Sheets[book.SheetNames[0]!];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return rows
    .map((r) =>
      r.map((c) => {
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        // Excel dates arrive as serial numbers; statement.parseDate understands them.
        return String(c ?? "").trim();
      }),
    )
    .filter((r) => r.some((c) => c !== ""));
}
