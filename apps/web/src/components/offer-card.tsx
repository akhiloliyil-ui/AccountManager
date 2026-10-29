"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { addItemAction } from "@/app/actions/grocery";
import { describePromo, priceAt } from "@/lib/grocery";
import type { Offer } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { useApp } from "./providers";
import { Badge, Card, Money, StoreName } from "./ui";

function formatShortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function OfferCard({ offer, weeklyListId }: { offer: Offer; weeklyListId?: string | null }) {
  const { productById, catalog } = useApp();
  const { pending, run } = useAction();
  const [added, setAdded] = useState(false);
  const product = productById.get(offer.productId);
  if (!product) return null;

  // Price of the smallest quantity the promo needs, so "2 for AED 50" shows the bundle price.
  const qty = offer.promo.type === "multi_buy" ? offer.promo.qty : offer.promo.type === "bogo" ? 2 : 1;
  const quote = priceAt(catalog.prices, offer.productId, offer.storeId, qty);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <Badge tone="offer">{describePromo(offer.promo)}</Badge>
        {offer.validTo && <span className="text-xs text-muted">until {formatShortDate(offer.validTo)}</span>}
      </div>
      <Link href={`/products/${product.id}`} className="mt-3 block font-medium leading-snug hover:underline">
        {product.name}
      </Link>
      <p className="mt-0.5 text-sm text-muted">{product.brand ?? "Loose"}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0">
          <StoreName storeId={offer.storeId} className="text-xs text-muted" />
          {quote && (
            <p className="mt-1 text-sm">
              <Money fils={quote.fils} className="font-semibold" />
              {quote.promoApplied && <Money fils={quote.regularFils * qty} className="ml-2 text-xs text-muted line-through" />}
              {qty > 1 && <span className="text-xs text-muted"> for {qty}</span>}
            </p>
          )}
          <p className="mt-1 truncate text-[11px] text-muted" title={offer.source}>
            {offer.source}
          </p>
        </div>
        {weeklyListId && (
          <button
            aria-label={`Add ${product.name} to this week's list`}
            disabled={pending || added}
            onClick={() => run(() => addItemAction(weeklyListId, { productId: product.id, quantity: qty }), { onDone: () => setAdded(true) })}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong hover:bg-primary hover:text-on-primary"
          >
            {added ? <Check size={18} /> : <Plus size={18} />}
          </button>
        )}
      </div>
    </Card>
  );
}
