"use server";

import {
  addItem,
  getCatalog,
  ValidationError,
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
import { matchReceipt } from "@gpa/core";
import { runAction } from "@/lib/server/action";
import { readReceipt } from "@/lib/server/receipt";

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

/* ------------------------------------------------------------------ receipts */

const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

/** Reads a receipt photo with AI and matches it to the catalogue. The browser shrinks photos before sending. */
export async function scanReceiptAction(form: FormData) {
  return runAction(async (db, access) => {
    assertCanWrite(access);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Take or choose a photo of the receipt");
    if (file.size > RECEIPT_MAX_BYTES) throw new ValidationError("That photo is too large. Try again; the app shrinks photos before sending.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isWebp = new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) throw new ValidationError("Use a JPEG, PNG or WebP photo");

    let reading;
    try {
      reading = await readReceipt(bytes);
    } catch (error) {
      console.error("[gpa] receipt reading failed", error);
      const text = String(error instanceof Error ? error.message : error);
      if (/credit card|customer_verification|billing|quota|credits/i.test(text)) {
        throw new ValidationError("Receipt reading needs AI Gateway billing switched on in Vercel (a card on file). Enter the amount by hand for now.");
      }
      if (/auth|api key|oidc|credential|unauthori[sz]ed|forbidden/i.test(text)) {
        throw new ValidationError("Receipt reading isn't set up on this server yet (AI Gateway credentials). Enter the amount by hand.");
      }
      throw new ValidationError("Couldn't read the receipt. Try a sharper, well-lit photo, or enter the amount by hand.");
    }
    if (!reading.items.length && reading.total === null) throw new ValidationError("That doesn't look like a receipt. Try another photo.");
    const catalog = await getCatalog(db);
    return matchReceipt(reading, { stores: catalog.stores, products: catalog.products });
  });
}

/** Records shelf prices from a receipt for the products it matched. */
export async function saveReceiptPricesAction(storeId: string, prices: { productId: string; priceFils: number }[]) {
  return runAction(async (db, access) => {
    assertCanWrite(access);
    let saved = 0;
    for (const p of prices.slice(0, 200)) {
      if (!Number.isInteger(p.priceFils) || p.priceFils <= 0) continue;
      await setShelfPrice(db, { productId: p.productId, storeId, priceFils: p.priceFils });
      saved += 1;
    }
    return saved;
  });
}
