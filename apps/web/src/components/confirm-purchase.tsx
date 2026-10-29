"use client";

import { useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import { compareBasket, convertMinor, toMinor, type ReceiptMatch } from "@gpa/core";
import { confirmPurchaseAction, saveReceiptPricesAction, scanReceiptAction } from "@/app/actions/grocery";
import { evaluateAmount, minorToInput } from "@/lib/calc";
import type { AccountView, CategoryRow, GroceryList, ListItem } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { AccountSelect } from "./screens/transaction-form";
import { useApp } from "./providers";
import { Button, Field, Input, Money, Select, Sheet, Switch } from "./ui";

/**
 * Basket -> expense: books the ticked items as one expense on the chosen account, pre-filled
 * with the estimate at the chosen store. The paid amount is what the receipt says.
 */
export function ConfirmPurchase({
  open,
  onClose,
  list,
  basket,
  accounts,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  list: GroceryList;
  basket: ListItem[];
  accounts: AccountView[];
  categories: CategoryRow[];
}) {
  const { catalog, settings, today, currency, productById } = useApp();
  const { pending, run } = useAction();
  const priced = basket.filter((i) => i.productId).map((i) => ({ productId: i.productId!, quantity: i.quantity }));
  const comparison = compareBasket(priced, catalog.prices, settings.preferredStoreIds);

  const [storeId, setStoreId] = useState(comparison.cheapest?.storeId ?? "");
  const [accountId, setAccountId] = useState(settings.defaultAccountId ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(settings.groceryCategoryId);
  const [date, setDate] = useState(today);
  const [amountText, setAmountText] = useState("");
  const [receipt, setReceipt] = useState<ReceiptMatch | null>(null);
  const [savePrices, setSavePrices] = useState(true);
  const camera = useRef<HTMLInputElement>(null);
  const scan = useAction();

  const estimateAt = (id: string) => compareBasket(priced, catalog.prices, [id]).stores[0]?.estimatedFils ?? 0;
  const estimate = storeId ? estimateAt(storeId) : (comparison.cheapest?.estimatedFils ?? 0);
  const account = accounts.find((a) => a.id === accountId);
  const accountCurrency = currency(account?.currency ?? "AED");
  const estimateInAccount = convertMinor(estimate, currency("AED"), accountCurrency);
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  const scanReceipt = async (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set("file", await shrinkPhoto(file));
    scan.run(() => scanReceiptAction(form), {
      onDone: (match) => {
        setReceipt(match);
        if (match.totalMinor) setAmountText(minorToInput(match.totalMinor, accountCurrency.decimals));
        if (match.date) setDate(match.date);
        if (match.storeId) setStoreId(match.storeId);
      },
    });
  };
  const priceUpdates =
    receipt && storeId && (!receipt.currency || receipt.currency === "AED")
      ? receipt.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, priceFils: l.unitMinor }))
      : [];

  const submit = () => {
    const typed = amountText.trim() ? evaluateAmount(amountText) : null;
    const amount = typed !== null ? toMinor(typed, accountCurrency.decimals) : estimateInAccount;
    run(
      () =>
        confirmPurchaseAction({
          listId: list.id,
          storeId: storeId || null,
          accountId,
          amount,
          date,
          categoryId,
        }),
      {
        success: "Purchase booked as an expense",
        onDone: () => {
          // Receipt prices become the store's shelf prices for the matched products.
          if (savePrices && priceUpdates.length) run(() => saveReceiptPricesAction(storeId, priceUpdates), { success: `${priceUpdates.length} prices updated from the receipt` });
          setAmountText("");
          setReceipt(null);
          onClose();
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Confirm purchase">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanReceipt(e.target.files?.[0])} />
      {receipt ? (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary-soft/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ScanLine size={16} className="text-primary-strong" aria-hidden /> Receipt read
            {receipt.storeName ? ` · ${receipt.storeName}` : ""}
          </p>
          <p className="mt-0.5 text-muted">
            {receipt.lines.length} line{receipt.lines.length === 1 ? "" : "s"}, {receipt.lines.filter((l) => l.productId).length} matched to your catalogue. Check the
            amount and date below.
          </p>
          {priceUpdates.length > 0 && (
            <label className="mt-2 flex items-center justify-between gap-3">
              <span>Update {catalog.stores.find((s) => s.id === storeId)?.name ?? "store"} prices from this receipt</span>
              <Switch checked={savePrices} onChange={setSavePrices} label="Update prices from this receipt" />
            </label>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-muted">Show lines</summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {receipt.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {l.name}
                    {l.productId && <span className="text-muted"> → {productById.get(l.productId)?.name}</span>}
                  </span>
                  <span className="tabular shrink-0">
                    {l.quantity !== 1 ? `${l.quantity} × ` : ""}
                    {minorToInput(l.unitMinor, 2)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <Button variant="secondary" className="mb-4 w-full" disabled={scan.pending} onClick={() => camera.current?.click()}>
          <Camera size={16} /> {scan.pending ? "Reading receipt…" : "Scan receipt"}
        </Button>
      )}
      <ul className="mb-4 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-surface-2 p-3 text-sm">
        {basket.map((i) => (
          <li key={i.id} className="flex justify-between gap-3">
            <span className="truncate">{i.productId ? productById.get(i.productId)?.name : i.text}</span>
            <span className="tabular text-muted">× {i.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store">
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Other / not listed</option>
            {catalog.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {priced.length ? ` · est. AED ${(estimateAt(s.id) / 100).toFixed(2)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid from">
          <div className="rounded-xl border border-border px-3">
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </div>
        </Field>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {expenseCategories
              .filter((c) => !c.parentId)
              .map((p) => [
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>,
                ...expenseCategories
                  .filter((c) => c.parentId === p.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${p.name} / ${c.name}`}
                    </option>
                  )),
              ])}
          </Select>
        </Field>
        <Field
          label={`Amount paid (${accountCurrency.code})`}
          hint={
            <>
              Estimate <Money fils={estimate} />
              {basket.length > priced.length && `, ${basket.length - priced.length} unpriced item(s) not included`}. Leave empty to use it.
            </>
          }
          className="sm:col-span-2"
        >
          <Input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder={minorToInput(estimateInAccount, accountCurrency.decimals)}
            className="tabular text-lg font-semibold"
          />
        </Field>
      </div>

      <Button className="mt-5 w-full" disabled={pending || !accountId} onClick={submit}>
        Book expense
      </Button>
    </Sheet>
  );
}

/** Phone photos are several MB; 1600px JPEG is plenty to read a receipt and fits upload limits. */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "receipt.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // a format the browser can't draw: send as is
  }
}
