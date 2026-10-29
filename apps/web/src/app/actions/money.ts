"use server";

import {
  addCurrency,
  assertAdmin,
  assertCanWrite,
  assertCanWriteTransaction,
  createAccount,
  createAccountGroup,
  createCategory,
  createRule,
  createTransaction,
  deleteAccount,
  deleteAccountGroup,
  deleteCategory,
  deleteRule,
  deleteTransaction,
  reorder,
  setAccountBalance,
  setBaseCurrency,
  setBudget,
  setSettings,
  updateAccount,
  updateAccountGroup,
  updateCategory,
  updateCurrency,
  updateRatesOnline,
  updateTransaction,
  type AccountGroupType,
  type AccountInput,
  type TxInput,
} from "@gpa/db";
import { runAction } from "@/lib/server/action";

/* Who may do what: Write users change transactions on their own accounts; Read users change nothing; account
   setup, categories, currencies, rules and settings are for admins. Checked here, on the server, for every call. */

export async function saveTransaction(id: string | null, input: TxInput) {
  return runAction(async (db, access) => {
    assertCanWrite(access, [input.accountId, input.toAccountId]);
    // Only what a person types: import and basket bookkeeping is set by those flows themselves.
    const clean: TxInput = { ...input, source: undefined, importBatchId: undefined, importHash: undefined, by: access.userId };
    if (id) {
      await assertCanWriteTransaction(db, access, id);
      await updateTransaction(db, id, clean);
      return [id];
    }
    return createTransaction(db, clean);
  });
}

export async function removeTransaction(id: string, scope: "one" | "following" | "all" = "one") {
  return runAction(async (db, access) => {
    await assertCanWriteTransaction(db, access, id);
    return deleteTransaction(db, id, scope);
  });
}

export async function saveAccount(id: string | null, input: AccountInput) {
  return runAction(async (db, access) => {
    assertAdmin(access);
    if (id) {
      await updateAccount(db, id, input);
      return id;
    }
    return createAccount(db, input);
  });
}

export async function removeAccount(id: string) {
  return runAction((db, access) => (assertAdmin(access), deleteAccount(db, id)));
}

export async function updateBalance(input: { accountId: string; balance: number; date: string; note?: string }) {
  return runAction((db, access) => (assertCanWrite(access, [input.accountId]), setAccountBalance(db, { ...input, by: access.userId })));
}

export async function saveAccountGroup(id: string | null, input: { name: string; type: AccountGroupType }) {
  return runAction(async (db, access) => {
    assertAdmin(access);
    if (id) {
      await updateAccountGroup(db, id, input);
      return id;
    }
    return createAccountGroup(db, input);
  });
}

export async function removeAccountGroup(id: string) {
  return runAction((db, access) => (assertAdmin(access), deleteAccountGroup(db, id)));
}

export async function reorderItems(table: "account_groups" | "accounts" | "categories", ids: string[]) {
  return runAction((db, access) => (assertAdmin(access), reorder(db, table, ids)));
}

export async function saveCategory(
  id: string | null,
  input: { kind: "income" | "expense"; name: string; emoji?: string | null; parentId?: string | null },
) {
  return runAction(async (db, access) => {
    assertAdmin(access);
    if (id) {
      await updateCategory(db, id, input);
      return id;
    }
    return createCategory(db, input);
  });
}

export async function removeCategory(id: string) {
  return runAction((db, access) => (assertAdmin(access), deleteCategory(db, id)));
}

export async function saveCurrency(code: string, patch: { perBase?: number; active?: boolean; symbol?: string; name?: string }) {
  return runAction((db, access) => (assertAdmin(access), updateCurrency(db, code, patch)));
}

export async function addNewCurrency(input: { code: string; name: string; symbol: string; decimals: number; perBase: number }) {
  return runAction((db, access) => (assertAdmin(access), addCurrency(db, input)));
}

export async function makeBaseCurrency(code: string) {
  return runAction((db, access) => (assertAdmin(access), setBaseCurrency(db, code)));
}

export async function updateRatesNow() {
  return runAction((db, access) => (assertAdmin(access), updateRatesOnline(db)));
}

export async function setRatesAutoUpdate(on: boolean) {
  return runAction((db, access) => (assertAdmin(access), setSettings(db, { fxAutoUpdate: on })));
}

export async function saveRule(input: { pattern: string; categoryId: string }) {
  return runAction((db, access) => (assertAdmin(access), createRule(db, input)));
}

export async function removeRule(id: string) {
  return runAction((db, access) => (assertAdmin(access), deleteRule(db, id)));
}

/** Monthly budget for an expense category, in base-currency minor units; null removes it. Admins only (checked in setBudget). */
export async function setBudgetAction(categoryId: string, amount: number | null) {
  return runAction((db, access) => setBudget(db, access, categoryId, amount));
}
