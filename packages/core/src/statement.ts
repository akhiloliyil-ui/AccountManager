import { parseAmount, toMinor, type Minor } from "./currency";
import { isValidIso } from "./dates";

/**
 * Bank statement import: CSV parsing, header and column detection, date-format detection,
 * normalisation into signed amounts (negative = money out) and duplicate hashes.
 * Excel files are turned into the same string[][] grid before reaching this module.
 */

export type Cell = string;
export type DateFormat = "DMY" | "MDY" | "YMD";

/** RFC 4180-ish CSV parser with delimiter detection (comma, semicolon, tab, pipe). */
export function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(src);
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    // Count only delimiters outside quotes.
    const count = sample.replace(/"[^"]*"/g, "").split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function makeIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isValidIso(iso) ? iso : null;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Parses a statement date: "29/10/2026", "10-29-26", "2026-10-29", "29 Oct 2026", "Oct 29, 2026",
 * "29-OCT-2026", an Excel serial ("46324"), each optionally followed by a time.
 */
export function parseDate(input: string, format: DateFormat = "DMY"): string | null {
  const s = input.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?(Z|[+-]\d{2}:?\d{2})?$/i, "").trim();
  if (!s) return null;

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    return serial > 20000 && serial < 80000 ? excelSerialToIso(serial) : null;
  }

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return makeIso(+m[1]!, +m[2]!, +m[3]!);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1]!, +m[2]!, +m[3]!];
    return format === "MDY" ? makeIso(y, a, b) : makeIso(y, b, a);
  }

  m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, 3)];
    return month ? makeIso(+m[3]!, month, +m[1]!) : null;
  }

  m = s.match(/^([A-Za-z]{3,9})[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?[\s,\-/.]+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase().slice(0, 3)];
    return month ? makeIso(+m[3]!, month, +m[2]!) : null;
  }
  return null;
}

/** Picks DMY or MDY from numeric dates: a first part above 12 settles it; UAE/India default to DMY. */
export function detectDateFormat(samples: string[]): DateFormat {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1]! > 12) dmy++;
    if (+m[2]! > 12) mdy++;
  }
  return mdy > dmy ? "MDY" : "DMY";
}

export interface ColumnMapping {
  headerRow: number;
  date: number;
  description: number;
  /** Single signed amount column... */
  amount?: number;
  /** ...or separate money-out / money-in columns. */
  debit?: number;
  credit?: number;
  balance?: number;
  dateFormat: DateFormat;
  /** Flip the sign of a single amount column (credit-card exports often show spend as positive). */
  invert: boolean;
}

const HEADER_PATTERNS = {
  date: /^(txn |transaction |value |posting |post |booking )?date|^date/i,
  description: /description|narration|details|particulars|merchant|remarks|payee|memo|reference/i,
  debit: /debit|withdrawal|money out|paid out|dr\b|spent/i,
  credit: /credit|deposit|money in|paid in|cr\b|received/i,
  amount: /^(?!.*date).*(amount|value|txn amt)/i,
  balance: /balance/i,
};

/** Index of the header row: the first row in the top 25 that names a date column and an amount-ish column. */
export function detectHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = rows[i]!;
    const hasDate = cells.some((c) => HEADER_PATTERNS.date.test(c) && c.length < 40);
    const hasMoney = cells.some((c) =>
      [HEADER_PATTERNS.amount, HEADER_PATTERNS.debit, HEADER_PATTERNS.credit].some((p) => p.test(c)),
    );
    if (hasDate && hasMoney) return i;
  }
  return 0;
}

/**
 * A statement layout's fingerprint: its header cells, trimmed and lowercased. Two files from the same bank
 * export share it even when the rows (and the account details above the header) differ.
 */
export function headerSignature(header: Cell[]): string {
  return header.map((c) => c.trim().toLowerCase().replace(/\s+/g, " ")).join("|").replace(/\|+$/, "");
}

export interface SavedFormat {
  id: string;
  name: string;
  signature: string;
  /** The mapping as saved; headerRow is re-found in each new file. */
  mapping: ColumnMapping;
  accountId: string | null;
}

/** The saved format whose header appears in the first 25 rows, with headerRow set to where it is in this file. */
export function matchSavedFormat<F extends SavedFormat>(rows: Cell[][], formats: F[]): { format: F; mapping: ColumnMapping } | null {
  const bySignature = new Map(formats.map((f) => [f.signature, f]));
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const format = bySignature.get(headerSignature(rows[i]!));
    if (format) return { format, mapping: { ...format.mapping, headerRow: i } };
  }
  return null;
}

export function guessMapping(rows: Cell[][]): ColumnMapping {
  const headerRow = detectHeaderRow(rows);
  const header = rows[headerRow] ?? [];
  const find = (pattern: RegExp, exclude: number[] = []) =>
    header.findIndex((c, i) => !exclude.includes(i) && pattern.test(c));

  const date = Math.max(0, find(HEADER_PATTERNS.date));
  const balance = find(HEADER_PATTERNS.balance);
  const used = [date, balance];
  let debit = find(HEADER_PATTERNS.debit, used);
  let credit = find(HEADER_PATTERNS.credit, [...used, debit]);
  let amount = find(HEADER_PATTERNS.amount, [...used, debit, credit]);
  if (debit >= 0 && credit < 0) {
    // A lone "Debit/Credit" style column is really a signed amount.
    amount = amount >= 0 ? amount : debit;
    debit = -1;
  }
  if (debit >= 0 && credit >= 0) amount = -1;

  let description = find(HEADER_PATTERNS.description, [date, debit, credit, amount, balance]);
  if (description < 0) {
    // Fall back to the column with the longest text in the first rows.
    const body = rows.slice(headerRow + 1, headerRow + 11);
    let longest = -1;
    header.forEach((_, i) => {
      if ([date, debit, credit, amount, balance].includes(i)) return;
      const len = body.reduce((sum, r) => sum + (r[i]?.length ?? 0), 0);
      if (longest < 0 || len > body.reduce((sum, r) => sum + (r[longest]?.length ?? 0), 0)) longest = i;
    });
    description = Math.max(0, longest);
  }

  const dateSamples = rows.slice(headerRow + 1, headerRow + 40).map((r) => r[date] ?? "");
  return {
    headerRow,
    date,
    description,
    amount: amount >= 0 ? amount : undefined,
    debit: debit >= 0 ? debit : undefined,
    credit: credit >= 0 ? credit : undefined,
    balance: balance >= 0 ? balance : undefined,
    dateFormat: detectDateFormat(dateSamples),
    invert: false,
  };
}

export interface StatementRow {
  /** 1-based line in the file, for error messages. */
  line: number;
  date: string;
  description: string;
  /** Signed minor units: negative = money out of the account. */
  amount: Minor;
  balance?: Minor;
}

export interface NormalizeResult {
  rows: StatementRow[];
  errors: { line: number; message: string }[];
}

export function normalizeStatement(rows: Cell[][], mapping: ColumnMapping, decimals = 2): NormalizeResult {
  const out: StatementRow[] = [];
  const errors: NormalizeResult["errors"] = [];
  rows.slice(mapping.headerRow + 1).forEach((cells, i) => {
    const line = mapping.headerRow + i + 2;
    const rawDate = cells[mapping.date] ?? "";
    const date = parseDate(rawDate, mapping.dateFormat);
    const description = (cells[mapping.description] ?? "").replace(/\s+/g, " ").trim();

    let amount: number | null = null;
    if (mapping.amount !== undefined) {
      amount = parseAmount(cells[mapping.amount] ?? "");
      if (amount !== null && mapping.invert) amount = -amount;
    } else {
      const debit = parseAmount(cells[mapping.debit ?? -1] ?? "");
      const credit = parseAmount(cells[mapping.credit ?? -1] ?? "");
      if (debit !== null || credit !== null) amount = (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0);
    }

    // Opening/closing balance lines and footers have no date or no amount; skip quietly when both are missing.
    if (!date && amount === null) return;
    if (!date) return void errors.push({ line, message: `Unreadable date "${rawDate}"` });
    if (amount === null) return void errors.push({ line, message: "No amount" });
    if (amount === 0) return;

    const balance = mapping.balance !== undefined ? parseAmount(cells[mapping.balance] ?? "") : null;
    out.push({
      line,
      date,
      description: description || "(no description)",
      amount: toMinor(amount, decimals),
      balance: balance === null ? undefined : toMinor(balance, decimals),
    });
  });
  return { rows: out, errors };
}

/** Lower-case, digits of card numbers and reference noise removed, so the same merchant matches. */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/\b(pos|purchase|card|debit|credit|txn|transaction|ref|no|num)\b[:#.]?/g, " ")
    .replace(/[x*]{2,}\d*/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a, hex. Stable across runtimes; good enough to fingerprint statement lines. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Duplicate fingerprints. Identical lines inside one file (two coffees on the same day)
 * get an occurrence suffix so the second is not mistaken for a re-import of the first.
 */
export function importHashes(accountId: string, rows: Pick<StatementRow, "date" | "amount" | "description">[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = `${accountId}|${r.date}|${r.amount}|${normalizeDescription(r.description)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return fnv1a(`${key}#${n}`) + fnv1a(`${n}#${key}`);
  });
}
