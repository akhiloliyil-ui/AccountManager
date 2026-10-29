import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guessMapping, headerSignature, matchSavedFormat, parseCsv } from "@gpa/core";
import type { DbHandle } from "./index";
import { createAccount, deleteAccount } from "./services/money";
import { deleteImportFormat, listImportFormats, renameImportFormat, saveImportFormat } from "./services/statements";
import { testDb } from "./test-utils";

let h: DbHandle;
let bank = "";
beforeAll(async () => {
  h = await testDb();
  bank = await createAccount(h.db, { groupId: "g-accounts", name: "ENBD Current", currency: "AED" });
});
afterAll(() => h.close());

const grid = parseCsv("Statement for 1234\nTxn Date,Narration,Withdrawal,Deposit,Balance\n01/10/2026,SALARY,,100,100\n");

describe("saved import formats", () => {
  it("remembers a layout after an import, and refreshes it on the next", async () => {
    const mapping = guessMapping(grid);
    const signature = headerSignature(grid[mapping.headerRow]!);
    await saveImportFormat(h.db, { signature, mapping, accountId: bank });
    await saveImportFormat(h.db, { signature, mapping: { ...mapping, dateFormat: "MDY" }, accountId: bank });
    const [format] = await listImportFormats(h.db);
    expect(format).toMatchObject({ name: "ENBD Current statement", useCount: 2, accountId: bank, signature });
    expect(format!.mapping.dateFormat).toBe("MDY");
    expect(matchSavedFormat(parseCsv("Txn Date,Narration,Withdrawal,Deposit,Balance\n02/11/2026,RENT,50,,50\n"), [format!])?.mapping.headerRow).toBe(0);
  });

  it("ignores broken mappings, and can be renamed or removed", async () => {
    await saveImportFormat(h.db, { signature: "x|y", mapping: { headerRow: 0, date: -1, description: 1, dateFormat: "DMY", invert: false }, accountId: bank });
    expect(await listImportFormats(h.db)).toHaveLength(1);
    const [format] = await listImportFormats(h.db);
    await expect(renameImportFormat(h.db, format!.id, " ")).rejects.toThrow(/Name the format/);
    await renameImportFormat(h.db, format!.id, "Emirates NBD (CSV)");
    expect((await listImportFormats(h.db))[0]!.name).toBe("Emirates NBD (CSV)");

    // Deleting the account keeps the format, just without a suggested account.
    await deleteAccount(h.db, bank);
    expect((await listImportFormats(h.db))[0]!.accountId).toBeNull();
    await deleteImportFormat(h.db, format!.id);
    expect(await listImportFormats(h.db)).toHaveLength(0);
  });
});
