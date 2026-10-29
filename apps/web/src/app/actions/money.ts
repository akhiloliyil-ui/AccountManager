"use server";

import {
  addCurrency,
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

export async function saveTransaction(id: string | null, input: TxInput) {
  return runAction(async (db) => {
    if (id) {
      await updateTransaction(db, id, input);
      return [id];
    }
    return createTransaction(db, input);
  });
}

export async function removeTransaction(id: string, scope: "one" | "following" | "all" = "one") {
  return runAction((db) => deleteTransaction(db, id, scope));
}

export async function saveAccount(id: string | null, input: AccountInput) {
  return runAction(async (db) => {
    if (id) {
      await updateAccount(db, id, input);
      return id;
    }
    return createAccount(db, input);
  });
}

export async function removeAccount(id: string) {
  return runAction((db) => deleteAccount(db, id));
}

export async function updateBalance(input: { accountId: string; balance: number; date: string; note?: string }) {
  return runAction((db) => setAccountBalance(db, input));
}

export async function saveAccountGroup(id: string | null, input: { name: string; type: AccountGroupType }) {
  return runAction(async (db) => {
    if (id) {
      await updateAccountGroup(db, id, input);
      return id;
    }
    return createAccountGroup(db, input);
  });
}

export async function removeAccountGroup(id: string) {
  return runAction((db) => deleteAccountGroup(db, id));
}

export async function reorderItems(table: "account_groups" | "accounts" | "categories", ids: string[]) {
  return runAction((db) => reorder(db, table, ids));
}

export async function saveCategory(
  id: string | null,
  input: { kind: "income" | "expense"; name: string; emoji?: string | null; parentId?: string | null },
) {
  return runAction(async (db) => {
    if (id) {
      await updateCategory(db, id, input);
      return id;
    }
    return createCategory(db, input);
  });
}

export async function removeCategory(id: string) {
  return runAction((db) => deleteCategory(db, id));
}

export async function saveCurrency(code: string, patch: { perBase?: number; active?: boolean; symbol?: string; name?: string }) {
  return runAction((db) => updateCurrency(db, code, patch));
}

export async function addNewCurrency(input: { code: string; name: string; symbol: string; decimals: number; perBase: number }) {
  return runAction((db) => addCurrency(db, input));
}

export async function makeBaseCurrency(code: string) {
  return runAction((db) => setBaseCurrency(db, code));
}

export async function updateRatesNow() {
  return runAction((db) => updateRatesOnline(db));
}

export async function setRatesAutoUpdate(on: boolean) {
  return runAction((db) => setSettings(db, { fxAutoUpdate: on }));
}

export async function saveRule(input: { pattern: string; categoryId: string }) {
  return runAction((db) => createRule(db, input));
}

export async function removeRule(id: string) {
  return runAction((db) => deleteRule(db, id));
}
