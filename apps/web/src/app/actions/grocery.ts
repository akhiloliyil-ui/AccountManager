"use server";

import {
  addItem,
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

export async function createListAction(type: ListType, name: string, fromId?: string | null) {
  return runAction((db) => createList(db, { type, name, fromId }));
}

export async function renameListAction(id: string, name: string) {
  return runAction((db) => renameList(db, id, name));
}

export async function deleteListAction(id: string) {
  return runAction((db) => deleteList(db, id));
}

export async function addItemAction(listId: string, item: { productId?: string | null; text?: string | null; quantity?: number }) {
  return runAction((db) => addItem(db, listId, item));
}

export async function setQuantityAction(itemId: string, quantity: number) {
  return runAction((db) => setQuantity(db, itemId, quantity));
}

export async function setCheckedAction(itemId: string, checked: boolean) {
  return runAction((db) => setChecked(db, itemId, checked));
}

export async function removeItemAction(itemId: string) {
  return runAction((db) => removeItem(db, itemId));
}

export async function saveAsTemplateAction(listId: string, name: string) {
  return runAction((db) => saveAsTemplate(db, listId, name));
}

export async function updateGrocerySettingsAction(patch: Partial<GrocerySettings>) {
  return runAction((db) => updateGrocerySettings(db, patch));
}

export async function confirmPurchaseAction(input: ConfirmPurchaseInput) {
  return runAction((db) => confirmPurchase(db, input));
}

export async function setShelfPriceAction(input: { productId: string; storeId: string; priceFils: number }) {
  return runAction((db) => setShelfPrice(db, input));
}

export async function createProductAction(input: {
  name: string;
  brand?: string | null;
  categoryId: string;
  packSize?: number;
  packUnit?: "piece" | "kg" | "g" | "L" | "ml" | "pack";
  soldBy?: "each" | "kg";
}) {
  return runAction((db) => createProduct(db, input));
}
