"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { FileUp } from "lucide-react";
import { GroceryNav } from "../grocery-nav";
import { OfferCard } from "../offer-card";
import { useApp } from "../providers";
import { ButtonLink, PageHeader, StoreDot } from "../ui";

export function OffersScreen({ weeklyListId }: { weeklyListId: string | null }) {
  const { catalog } = useApp();
  const [storeId, setStoreId] = useState<string | null>(null);
  const shown = catalog.offers
    .filter((o) => !storeId || o.storeId === storeId)
    .sort((a, b) => (a.validTo ?? "9999").localeCompare(b.validTo ?? "9999"));

  return (
    <div>
      <GroceryNav />
      <PageHeader
        title="Offers"
        subtitle="Live promotions from reviewed supermarket PDFs, ending soonest first."
        action={
          <ButtonLink href="/offers/import" className="shrink-0">
            <FileUp size={16} /> <span className="hidden sm:inline">Upload PDF</span>
          </ButtonLink>
        }
      />

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip active={!storeId} onClick={() => setStoreId(null)}>
          All stores
        </Chip>
        {catalog.stores.map((s) => (
          <Chip key={s.id} active={storeId === s.id} onClick={() => setStoreId(s.id)}>
            <StoreDot storeId={s.id} /> {s.name}
          </Chip>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {shown.map((o) => (
          <OfferCard key={`${o.storeId}-${o.productId}`} offer={o} weeklyListId={weeklyListId} />
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted">No live offers{storeId ? " from this store" : ""}. Upload a promotion PDF to add some.</p>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
        active ? "bg-text text-bg" : "border border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
