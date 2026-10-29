"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic, useState } from "react";
import { clsx } from "clsx";
import { Bookmark, Check, Plus, Receipt, Scale, Search, ShoppingCart, Trash2 } from "lucide-react";
import {
  addItemAction,
  deleteListAction,
  removeItemAction,
  saveAsTemplateAction,
  setCheckedAction,
  setQuantityAction,
  createListAction,
} from "@/app/actions/grocery";
import type { ActionResult } from "@/lib/action-result";
import { periodLabel, quoteList } from "@/lib/grocery";
import type { AccountView, GroceryList, ListItem } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { ConfirmPurchase } from "../confirm-purchase";
import { useApp, useToast } from "../providers";
import { Amount, BackLink, Badge, Button, ButtonLink, Card, EmptyState, Money, QtyStepper, StoreDot, StoreName } from "../ui";

type Change =
  | { kind: "toggle"; itemId: string }
  | { kind: "qty"; itemId: string; quantity: number }
  | { kind: "remove"; itemId: string }
  | { kind: "add"; item: ListItem };

function apply(list: GroceryList, change: Change): GroceryList {
  switch (change.kind) {
    case "toggle":
      return { ...list, items: list.items.map((i) => (i.id === change.itemId ? { ...i, checked: !i.checked } : i)) };
    case "qty":
      return { ...list, items: list.items.map((i) => (i.id === change.itemId ? { ...i, quantity: Math.max(0.5, change.quantity) } : i)) };
    case "remove":
      return { ...list, items: list.items.filter((i) => i.id !== change.itemId) };
    case "add":
      return { ...list, items: [...list.items, change.item] };
  }
}

export function ListDetailScreen({ list: serverList, accounts }: { list: GroceryList; accounts: AccountView[] }) {
  const autoFocus = useSearchParams().get("add") === "1";
  const router = useRouter();
  const toast = useToast();
  const { catalog, settings, categories, productById, storeById } = useApp();
  const { pending, run } = useAction();
  const [list, change] = useOptimistic(serverList, apply);
  const [shopMode, setShopMode] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /** Applies the change on screen at once, then saves it; the server refresh replaces the optimistic copy. */
  const mutate = (c: Change, action: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      change(c);
      const result = await action();
      if (!result.ok) toast("error", result.error);
    });

  const open = { items: list.items.filter((i) => !i.purchaseId) };
  const quote = quoteList(list, settings.preferredStoreIds, catalog.prices);
  const openQuote = quoteList(open, settings.preferredStoreIds, catalog.prices);
  const cheapest = openQuote.comparison.cheapest;
  const basket = list.items.filter((i) => i.checked && !i.purchaseId);
  const bought = list.items.filter((i) => i.purchaseId);

  const groups = [...catalog.categories, { id: "other", name: "Other" }]
    .map((c) => ({
      ...c,
      items: open.items
        .filter((i) => (i.productId ? productById.get(i.productId)?.categoryId : "other") === c.id)
        .sort((a, b) => (shopMode ? Number(a.checked) - Number(b.checked) : 0)),
    }))
    .filter((g) => g.items.length);

  return (
    <div>
      <BackLink href="/lists">Lists</BackLink>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-[28px]">{list.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {periodLabel(list)} · {list.items.length} items{list.type !== "saved" && bought.length > 0 && ` · ${bought.length} bought`}
          </p>
        </div>
        <div className="flex gap-2">
          {list.type === "saved" ? (
            <Button disabled={pending} onClick={() => run(() => createListAction("weekly", "This week", list.id), { onDone: (id) => router.push(`/lists/${id}`) })}>
              Use for this week
            </Button>
          ) : (
            <>
              <Button variant={shopMode ? "primary" : "secondary"} onClick={() => setShopMode((v) => !v)} aria-pressed={shopMode}>
                <ShoppingCart size={16} /> {shopMode ? "Shopping" : "Shop mode"}
              </Button>
              <Button
                variant="secondary"
                aria-label="Save as template"
                title="Save as template"
                disabled={pending}
                onClick={() => run(() => saveAsTemplateAction(list.id, `${list.name} template`), { success: "Saved as a template", onDone: (id) => router.push(`/lists/${id}`) })}
                className="px-3"
              >
                <Bookmark size={16} />
              </Button>
            </>
          )}
          <Button
            variant="danger"
            aria-label="Delete list"
            title="Delete list"
            className="px-3"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete "${list.name}"? Expenses already booked from it stay in your transactions.`)) {
                run(() => deleteListAction(list.id), { onDone: () => router.push("/lists") });
              }
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {!shopMode && <AddItem autoFocus={autoFocus} onAdd={(item) => mutate({ kind: "add", item: { id: `tmp-${Date.now()}`, productId: item.productId ?? null, text: item.text ?? null, quantity: 1, checked: false, purchaseId: null } }, () => addItemAction(list.id, item))} />}

      {list.type !== "saved" && basket.length > 0 && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-primary/30 bg-primary-soft/60 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-on-primary">
            <Receipt size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {basket.length} item{basket.length > 1 ? "s" : ""} in the basket
            </p>
            <p className="text-sm text-muted">Paid at the till? Book it as one expense and keep the budget real.</p>
          </div>
          <Button onClick={() => setConfirming(true)}>Confirm purchase</Button>
        </Card>
      )}

      {open.items.length === 0 && bought.length === 0 ? (
        <EmptyState icon={<Plus size={22} />} title="Nothing on this list yet" body="Search for a product above or type any item." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.id}>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.name}</h2>
              <Card className="divide-y divide-border">
                {g.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    shopMode={shopMode}
                    showCheck={list.type !== "saved"}
                    fils={openQuote.itemFils.get(item.id) ?? null}
                    best={item.productId ? quote.cheapestStoreByProduct.get(item.productId) : undefined}
                    cheapestStoreId={cheapest?.storeId}
                    onToggle={() => mutate({ kind: "toggle", itemId: item.id }, () => setCheckedAction(item.id, !item.checked))}
                    onQty={(q) => mutate({ kind: "qty", itemId: item.id, quantity: q }, () => setQuantityAction(item.id, q))}
                    onRemove={() => mutate({ kind: "remove", itemId: item.id }, () => removeItemAction(item.id))}
                  />
                ))}
              </Card>
            </section>
          ))}

          {list.purchases.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Bought</h2>
              <Card className="divide-y divide-border">
                {list.purchases.map((p) => {
                  const items = list.items.filter((i) => i.purchaseId === p.id);
                  return (
                    <Link key={p.id} href={`/transactions/${p.transactionId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      <Check size={18} className="text-primary-strong" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {p.storeId ? (storeById.get(p.storeId)?.name ?? "Store") : "Shop"} · {new Date(`${p.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {items.map((i) => (i.productId ? productById.get(i.productId)?.name : i.text)).join(", ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <Amount minor={p.amount} currency={p.currency} tone="expense" className="text-sm font-semibold" />
                        <p className="text-[11px] text-muted">
                          est. <Money fils={p.estimatedFils} />
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </Card>
            </section>
          )}
        </div>
      )}

      {cheapest && open.items.length > 0 && (
        <div className="sticky z-20 mt-6 md:bottom-4" style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}>
          <Card className="flex items-center gap-3 p-3 pl-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {bought.length ? "Still to buy" : "Est. total"} at <StoreName storeId={cheapest.storeId} className="font-medium text-text" />
                {openQuote.unpricedCount > 0 && ` · ${openQuote.unpricedCount} unpriced`}
              </p>
              <Money fils={cheapest.estimatedFils} className="text-lg font-semibold" />
            </div>
            <ButtonLink href={`/compare?list=${list.id}`}>
              <Scale size={16} /> Compare
            </ButtonLink>
          </Card>
        </div>
      )}

      {confirming && (
        <ConfirmPurchase open onClose={() => setConfirming(false)} list={list} basket={basket} accounts={accounts} categories={categories} />
      )}
    </div>
  );
}

function ItemRow({
  item,
  shopMode,
  showCheck,
  fils,
  best,
  cheapestStoreId,
  onToggle,
  onQty,
  onRemove,
}: {
  item: ListItem;
  shopMode: boolean;
  showCheck: boolean;
  fils: number | null;
  best?: { storeId: string; fils: number };
  cheapestStoreId?: string;
  onToggle: () => void;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  const { productById, storeById } = useApp();
  const product = item.productId ? productById.get(item.productId) : undefined;
  const byKg = product?.soldBy === "kg";
  const name = product?.name ?? item.text ?? "Item";
  const saving = item.id.startsWith("tmp-");

  const meta = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {shopMode && (
        <span className="tabular font-medium text-text">
          {item.quantity}
          {byKg ? " kg" : " ×"}
        </span>
      )}
      {product?.brand && <span>{product.brand}</span>}
      {!product && <Badge>No price</Badge>}
      {best && best.storeId !== cheapestStoreId && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <StoreDot storeId={best.storeId} className="size-2" /> Cheaper at {storeById.get(best.storeId)?.name}
        </span>
      )}
    </div>
  );

  return (
    <div className={clsx("flex gap-3 px-3 md:items-center md:px-4", shopMode ? "items-center py-4" : "items-start py-3", item.checked && "opacity-55", saving && "animate-pulse")}>
      {showCheck && (
        <button
          role="checkbox"
          aria-checked={item.checked}
          aria-label={`Mark ${name} as ${item.checked ? "not in basket" : "in basket"}`}
          onClick={onToggle}
          disabled={saving}
          className={clsx(
            "grid shrink-0 place-items-center rounded-full border-2 transition-colors",
            shopMode ? "size-8" : "mt-0.5 size-6 md:mt-0",
            item.checked ? "border-primary bg-primary text-on-primary" : "border-border hover:border-primary",
          )}
        >
          {item.checked && <Check size={shopMode ? 18 : 14} strokeWidth={3} />}
        </button>
      )}

      {/* Mobile: name + price on top, details + stepper below. Desktop: one line. */}
      <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
        <div className="flex items-start justify-between gap-3 md:min-w-0 md:flex-1 md:flex-col md:items-stretch md:gap-0.5">
          {product ? (
            <Link href={`/products/${product.id}`} className={clsx("line-clamp-2 font-medium hover:underline", item.checked && "line-through")}>
              {name}
            </Link>
          ) : (
            <p className={clsx("line-clamp-2 font-medium", item.checked && "line-through")}>{name}</p>
          )}
          <span className="shrink-0 text-sm font-semibold md:hidden">{fils !== null ? <Money fils={fils} /> : <span className="text-muted">—</span>}</span>
          <div className="hidden md:block">{meta}</div>
        </div>

        <div className={clsx("mt-2 flex items-center justify-between gap-3 md:mt-0", shopMode && "md:hidden")}>
          <div className="md:hidden">{meta}</div>
          {!shopMode && (
            <div className="flex shrink-0 items-center gap-1">
              <QtyStepper value={item.quantity} step={byKg ? 0.5 : 1} unit={byKg ? "kg" : undefined} onChange={onQty} disabled={saving} />
              <button
                aria-label={`Remove ${name}`}
                onClick={onRemove}
                disabled={saving}
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="hidden w-24 text-right text-sm font-semibold md:block">{fils !== null ? <Money fils={fils} /> : <span className="text-muted">—</span>}</div>
      </div>
    </div>
  );
}

function AddItem({ autoFocus, onAdd }: { autoFocus: boolean; onAdd: (item: { productId?: string; text?: string }) => void }) {
  const { searchProducts } = useApp();
  const [query, setQuery] = useState("");
  const results = searchProducts(query);

  const add = (item: { productId?: string; text?: string }) => {
    onAdd(item);
    setQuery("");
  };

  return (
    <div className="relative mb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) add({ productId: results[0].id });
          else if (query.trim()) add({ text: query.trim() });
        }}
      >
        <label className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-surface px-4 focus-within:border-primary">
          <Search size={18} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add milk, rice, eggs…"
            autoFocus={autoFocus}
            aria-label="Search products to add"
            className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
        </label>
      </form>

      {query.trim() && (
        <Card className="absolute inset-x-0 top-14 z-20 overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          {results.map((p) => (
            <button key={p.id} onClick={() => add({ productId: p.id })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
              <Plus size={16} className="text-primary-strong" />
              <span className="flex-1">
                <span className="font-medium">{p.name}</span>
                {p.brand && <span className="text-sm text-muted"> · {p.brand}</span>}
              </span>
            </button>
          ))}
          <button
            onClick={() => add({ text: query.trim() })}
            className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left text-sm text-muted hover:bg-surface-2"
          >
            <Plus size={16} /> Add “{query.trim()}” as a free-text item
          </button>
        </Card>
      )}
    </div>
  );
}
