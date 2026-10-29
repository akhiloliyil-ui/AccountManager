import { describe, expect, it } from "vitest";
import {
  detectDateFormat,
  guessMapping,
  importHashes,
  normalizeDescription,
  normalizeStatement,
  parseCsv,
  parseDate,
  suggestCategory,
} from "./index";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n29/10/2026,"CARREFOUR, MOE",-27.34\r\n"28/10/2026","He said ""hi""",10\r\n');
    expect(rows).toEqual([
      ["Date", "Description", "Amount"],
      ["29/10/2026", "CARREFOUR, MOE", "-27.34"],
      ["28/10/2026", 'He said "hi"', "10"],
    ]);
  });

  it("detects semicolons and tabs", () => {
    expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
    expect(parseCsv("a\tb\n1\t2")[1]).toEqual(["1", "2"]);
  });
});

describe("parseDate", () => {
  it.each([
    ["29/10/2026", "DMY", "2026-10-29"],
    ["10/29/2026", "MDY", "2026-10-29"],
    ["29-10-26", "DMY", "2026-10-29"],
    ["2026-10-29", "DMY", "2026-10-29"],
    ["2026-10-29T08:15:00Z", "DMY", "2026-10-29"],
    ["29 Oct 2026", "DMY", "2026-10-29"],
    ["29-OCT-2026", "DMY", "2026-10-29"],
    ["Oct 29, 2026", "DMY", "2026-10-29"],
    ["29/10/2026 14:05", "DMY", "2026-10-29"],
    ["46324", "DMY", "2026-10-29"],
    ["31/02/2026", "DMY", null],
    ["Opening balance", "DMY", null],
  ] as const)("%s (%s)", (input, format, expected) => {
    expect(parseDate(input, format)).toBe(expected);
  });

  it("detects the day/month order", () => {
    expect(detectDateFormat(["01/02/2026", "13/02/2026"])).toBe("DMY");
    expect(detectDateFormat(["02/13/2026", "02/01/2026"])).toBe("MDY");
    expect(detectDateFormat(["01/02/2026"])).toBe("DMY");
  });
});

const bankCsv = `Account Statement
Account: Salary Account ****1234
Txn Date,Value Date,Narration,Withdrawal,Deposit,Balance
01/10/2026,01/10/2026,SALARY OCT 2026,,"10,500.00","15,500.00"
02/10/2026,02/10/2026,POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI,27.34,,"15,472.66"
02/10/2026,02/10/2026,POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI,27.34,,"15,445.32"
05/10/2026,05/10/2026,DEWA BILL PAYMENT,412.10,,"15,033.22"
,,Closing balance,,,"15,033.22"
`;

describe("statement normalisation", () => {
  const rows = parseCsv(bankCsv);
  const mapping = guessMapping(rows);

  it("finds the header row and the debit/credit columns", () => {
    expect(mapping).toMatchObject({ headerRow: 2, date: 0, description: 2, debit: 3, credit: 4, balance: 5, dateFormat: "DMY" });
    expect(mapping.amount).toBeUndefined();
  });

  it("produces signed amounts and skips footer lines", () => {
    const { rows: out, errors } = normalizeStatement(rows, mapping);
    expect(errors).toEqual([]);
    expect(out.map((r) => [r.date, r.amount])).toEqual([
      ["2026-10-01", 1050000],
      ["2026-10-02", -2734],
      ["2026-10-02", -2734],
      ["2026-10-05", -41210],
    ]);
    expect(out[0]!.balance).toBe(1550000);
  });

  it("uses a single signed amount column and can invert it", () => {
    const card = parseCsv("Transaction Date,Description,Amount\n27/10/2026,Talabat,30.40\n28/10/2026,Payment received,-500");
    const m = guessMapping(card);
    expect(m.amount).toBe(2);
    const inverted = normalizeStatement(card, { ...m, invert: true }).rows;
    expect(inverted.map((r) => r.amount)).toEqual([-3040, 50000]);
  });

  it("reports unreadable dates", () => {
    const bad = parseCsv("Date,Description,Amount\nyesterday,Coffee,-12");
    expect(normalizeStatement(bad, guessMapping(bad)).errors).toEqual([{ line: 2, message: 'Unreadable date "yesterday"' }]);
  });

  it("fingerprints duplicates but keeps identical lines in one file apart", () => {
    const { rows: out } = normalizeStatement(rows, mapping);
    const first = importHashes("acc-1", out);
    expect(new Set(first).size).toBe(4);
    expect(importHashes("acc-1", out)).toEqual(first);
    expect(importHashes("acc-2", out)[0]).not.toBe(first[0]);
  });

  it("normalises merchant text", () => {
    expect(normalizeDescription("POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI")).toBe("carrefour moe dubai");
  });
});

describe("suggestCategory", () => {
  const rules = [
    { pattern: "carrefour", categoryId: "grocery" },
    { pattern: "carrefour moe parking", categoryId: "parking" },
    { pattern: "salary", categoryId: "salary", kind: "income" as const },
  ];
  const history = [{ description: "TALABAT DUBAI 1234", categoryId: "eating-out", kind: "expense" as const }];

  it("prefers the longest matching rule", () => {
    expect(suggestCategory("CARREFOUR MOE PARKING", "expense", rules, [])).toEqual({ categoryId: "parking", reason: "rule" });
    expect(suggestCategory("Carrefour City", "expense", rules, [])?.categoryId).toBe("grocery");
  });

  it("respects the rule kind", () => {
    expect(suggestCategory("SALARY REVERSAL", "expense", rules, [])).toBeNull();
  });

  it("learns from history by merchant prefix", () => {
    expect(suggestCategory("TALABAT DUBAI 9876", "expense", [], history)).toEqual({ categoryId: "eating-out", reason: "history" });
    expect(suggestCategory("TALABAT DUBAI 9876", "income", [], history)).toBeNull();
  });
});
