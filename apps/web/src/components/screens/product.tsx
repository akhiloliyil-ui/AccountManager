"use client";

import { useState } from "react";
import { Check, Plus, Tag } from "lucide-react";
import { aedToFils, lineCost, unitPrice } from "@gpa/core";
import { addItemAction, setShelfPriceAction } from "@/app/actions/grocery";
import { describePromo } from "@/lib/grocery";
import { useAction } from "@/lib/use-action";
import { useApp } from "../providers";
import { BackLink, Badge, Button, Card, EmptyState, Field, Input, Money, Select, StoreName } from "../ui";

export function ProductScreen({ productId, weeklyListId }: { productId: string; weeklyListId: string | null }) {
  const { productById, groceryCategoryById, catalog } = useApp();
  const { pending, run } = useAction();
  const [added, setAdded] = useState(false);
  const [storeId, setStoreId] = useState(catalog.stores[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const product = productById.get(productId);

  if (!product) {
    return <EmptyState icon={<Tag size={22} />} title="Product not found" body="It is not in the catalogue yet." />;
  }

  const rows = catalog.prices
    .filter((p) => p.productId === product.id)
    .map((p) => ({ ...p, now: lineCost(1, p.priceFils, p.promo) }))
    .sort((a, b) => a.now.fils - b.now.fils);
  const unitLabel = product.soldBy === "kg" ? "per kg" : `${product.packSize} ${product.packUnit}`;

  return (
    <div className="space-y-6">
      <BackLink href="/lists">Back</BackLink>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{groceryCategoryById.get(product.categoryId)?.name}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-[28px]">{product.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {product.brand ? `${product.brand} · ` : ""}
            {unitLabel}
          </p>
        </div>
        {weeklyListId && (
          <Button disabled={pending || added} onClick={() => run(() => addItemAction(weeklyListId, { productId: product.id }), { onDone: () => setAdded(true) })}>
            {added ? <Check size={16} /> : <Plus size={16} />} {added ? "Added to this week" : "Add to this week"}
          </Button>
        )}
      </div>

      <Card className="divide-y divide-border">
        {rows.map((p, i) => {
          const unit = unitPrice(p.now.fils, product);
          return (
            <div key={p.storeId} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StoreName storeId={p.storeId} className="font-medium" />
                  {i === 0 && <Badge tone="primary">Cheapest</Badge>}
                  {p.promo && <Badge tone="offer">{describePromo(p.promo)}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  <Money fils={unit.fils} /> per {unit.per} · {p.source === "pdf" ? "from PDF" : p.source === "manual" ? "entered" : p.source} {p.observedAt}
                </p>
              </div>
              <div className="text-right">
                <Money fils={p.now.fils} className="font-semibold" />
                {p.now.promoApplied && <Money fils={p.priceFils} className="block text-xs text-muted line-through" />}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="px-5 py-4 text-sm text-muted">No prices yet.</p>}
      </Card>

      <Card className="p-5">
        <p className="mb-3 font-semibold">Saw a different shelf price?</p>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const aed = Number(price);
            if (!(aed > 0)) return;
            run(() => setShelfPriceAction({ productId: product.id, storeId, priceFils: aedToFils(aed) }), {
              success: "Price updated",
              onDone: () => setPrice(""),
            });
          }}
        >
          <Field label="Store">
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {catalog.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Price (AED, ${product.soldBy === "kg" ? "per kg" : "per pack"})`}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Save price
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">Sample catalogue prices are illustrative until you record real ones or publish a reviewed PDF.</p>
      </Card>
    </div>
  );
}
