"use client";

import { useState } from "react";
import { compareBasket, convertMinor, toMinor } from "@gpa/core";
import { confirmPurchaseAction } from "@/app/actions/grocery";
import { evaluateAmount, minorToInput } from "@/lib/calc";
import type { AccountView, CategoryRow, GroceryList, ListItem } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { AccountSelect } from "./screens/transaction-form";
import { useApp } from "./providers";
import { Button, Field, Input, Money, Select, Sheet } from "./ui";

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

  const estimateAt = (id: string) => compareBasket(priced, catalog.prices, [id]).stores[0]?.estimatedFils ?? 0;
  const estimate = storeId ? estimateAt(storeId) : (comparison.cheapest?.estimatedFils ?? 0);
  const account = accounts.find((a) => a.id === accountId);
  const accountCurrency = currency(account?.currency ?? "AED");
  const estimateInAccount = convertMinor(estimate, currency("AED"), accountCurrency);
  const expenseCategories = categories.filter((c) => c.kind === "expense");

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
          setAmountText("");
          onClose();
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Confirm purchase">
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
