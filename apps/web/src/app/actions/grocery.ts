"use server";

import {
  addItem,
  assertAdmin,
  assertCanWrite,
  confirmPurchase,
  createList,
  createProduct,
  deleteList,
  removeItem,
  renameList,
  saveAsTemplate,
  setChecked,
  setQuantity,
  setShelfPrice,
  updateGrocerySettings,
  type ConfirmPurchaseInput,
  type GrocerySettings,
  type ListType,
} from "@gpa/db";
import { runAction } from "@/lib/server/action";

/* Grocery lists, prices and offers are shared by the household: Write users and admins change them, Read users
   only look. Paying for a basket also needs access to the account it is paid from. */

export async function createListAction(type: ListType, name: string, fromId?: string | null) {
  return runAction((db, access) => (assertCanWrite(access), createList(db, { type, name, fromId })));
}

export async function renameListAction(id: string, name: string) {
  return runAction((db, access) => (assertCanWrite(access), renameList(db, id, name)));
}

export async function deleteListAction(id: string) {
  return runAction((db, access) => (assertCanWrite(access), deleteList(db, id)));
}

export async function addItemAction(listId: string, item: { productId?: string | null; text?: string | null; quantity?: number }) {
  return runAction((db, access) => (assertCanWrite(access), addItem(db, listId, item)));
}

export async function setQuantityAction(itemId: string, quantity: number) {
  return runAction((db, access) => (assertCanWrite(access), setQuantity(db, itemId, quantity)));
}

export async function setCheckedAction(itemId: string, checked: boolean) {
  return runAction((db, access) => (assertCanWrite(access), setChecked(db, itemId, checked)));
}

export async function removeItemAction(itemId: string) {
  return runAction((db, access) => (assertCanWrite(access), removeItem(db, itemId)));
}

export async function saveAsTemplateAction(listId: string, name: string) {
  return runAction((db, access) => (assertCanWrite(access), saveAsTemplate(db, listId, name)));
}

export async function updateGrocerySettingsAction(patch: Partial<GrocerySettings>) {
  return runAction(async (db, access) => {
    // Choosing which stores to compare is everyday shopping; the budget, category and default account are admin settings.
    const storesOnly = Object.keys(patch).every((k) => k === "preferredStoreIds");
    if (storesOnly) assertCanWrite(access);
    else assertAdmin(access);
    return updateGrocerySettings(db, patch);
  });
}

export async function confirmPurchaseAction(input: ConfirmPurchaseInput) {
  return runAction((db, access) => (assertCanWrite(access, [input.accountId]), confirmPurchase(db, { ...input, by: access.userId })));
}

export async function setShelfPriceAction(input: { productId: string; storeId: string; priceFils: number }) {
  return runAction((db, access) => (assertCanWrite(access), setShelfPrice(db, input)));
}

export async function createProductAction(input: {
  name: string;
  brand?: string | null;
  categoryId: string;
  packSize?: number;
  packUnit?: "piece" | "kg" | "g" | "L" | "ml" | "pack";
  soldBy?: "each" | "kg";
}) {
  return runAction((db, access) => (assertCanWrite(access), createProduct(db, input)));
}
