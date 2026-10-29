"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Check, Split, TriangleAlert } from "lucide-react";
import { updateGrocerySettingsAction } from "@/app/actions/grocery";
import { quoteList } from "@/lib/grocery";
import type { GroceryList } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { GroceryNav } from "../grocery-nav";
import { useApp } from "../providers";
import { Badge, Card, EmptyState, Money, PageHeader, SectionTitle, Select, StoreDot, StoreName } from "../ui";

export function CompareScreen({ lists, currentWeekId }: { lists: GroceryList[]; currentWeekId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const { catalog, settings, productById, storeById } = useApp();
  const { pending, run } = useAction();
  const storeIds = settings.preferredStoreIds;

  const plannable = lists.filter((l) => l.items.some((i) => i.productId));
  const list = plannable.find((l) => l.id === params.get("list")) ?? plannable.find((l) => l.id === currentWeekId) ?? plannable[0];

  const toggleStore = (id: string) => {
    const on = storeIds.includes(id);
    if (on && storeIds.length <= 2) return;
    const next = on ? storeIds.filter((s) => s !== id) : [...storeIds, id];
    run(() => updateGrocerySettingsAction({ preferredStoreIds: catalog.stores.map((s) => s.id).filter((s) => next.includes(s)) }));
  };

  if (!list) {
    return (
      <div>
        <GroceryNav />
        <EmptyState icon={<Split size={22} />} title="Nothing to compare" body="Add products to a list to compare supermarket prices." />
      </div>
    );
  }

  const { comparison, unpricedCount } = quoteList(list, storeIds, catalog.prices);
  const { cheapest, mostExpensive, bestSplit, recommendSplit, splitSavingFils } = comparison;
  const max = Math.max(...comparison.stores.map((s) => s.estimatedFils), 1);
  const items = list.items.filter((i) => i.productId);

  return (
    <div className="space-y-8">
      <div>
        <GroceryNav />
        <PageHeader title="Compare" subtitle="Your basket priced at every store, offers applied." />
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <label className="block md:w-72">
          <span className="mb-1.5 block text-xs font-medium text-muted">Basket</span>
          <Select value={list.id} onChange={(e) => router.replace(`/compare?list=${e.target.value}`)}>
            {plannable.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.items.length} items)
              </option>
            ))}
          </Select>
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Stores (at least two)</span>
          <div className="flex flex-wrap gap-2">
            {catalog.stores.map((s) => {
              const on = storeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStore(s.id)}
                  disabled={pending}
                  aria-pressed={on}
                  className={clsx(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                    on ? "border-text bg-surface font-medium" : "border-border text-muted hover:text-text",
                  )}
                >
                  <StoreDot storeId={s.id} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {cheapest && mostExpensive && (
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-primary-soft/60 p-5">
            <p className="text-sm text-muted">Cheapest single store</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <StoreName storeId={cheapest.storeId} className="text-xl font-semibold" />
              <Money fils={cheapest.estimatedFils} className="text-2xl font-semibold" />
            </div>
            {mostExpensive.storeId !== cheapest.storeId && (
              <p className="mt-2 text-sm text-primary-strong">
                Saves <Money fils={mostExpensive.estimatedFils - cheapest.estimatedFils} className="font-semibold" /> against {storeById.get(mostExpensive.storeId)?.name}
              </p>
            )}
          </div>
          <ol className="divide-y divide-border">
            {comparison.stores.map((s, i) => (
              <li key={s.storeId} className="flex items-center gap-4 px-5 py-3.5">
                <span className="tabular w-4 text-sm text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <StoreName storeId={s.storeId} className="text-sm font-medium" />
                    <Money fils={s.estimatedFils} className="text-sm font-semibold" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={clsx("h-full rounded-full", i === 0 ? "bg-primary" : "bg-muted/40")} style={{ width: `${(s.estimatedFils / max) * 100}%` }} />
                  </div>
                  {s.missing.length > 0 && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-offer">
                      <TriangleAlert size={12} /> {s.missing.length} without price, estimated from other stores
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {bestSplit && cheapest && splitSavingFils > 0 && (
        <Card className="flex items-start gap-4 p-5">
          <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", recommendSplit ? "bg-primary text-on-primary" : "bg-surface-2 text-muted")}>
            <Split size={18} />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Split across {bestSplit.storeIds.map((id) => storeById.get(id)?.name).join(" + ")}</p>
              {recommendSplit ? <Badge tone="primary">Recommended</Badge> : <Badge>Small saving</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              <Money fils={bestSplit.totalFils} className="font-medium text-text" /> total, <Money fils={splitSavingFils} /> less than one store.{" "}
              {recommendSplit ? "Worth a second stop." : "Below your AED 10 or 5% threshold, so one store is simpler."}
            </p>
          </div>
        </Card>
      )}

      <section>
        <SectionTitle title="Item by item" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Item</th>
                {comparison.stores.map((s) => (
                  <th key={s.storeId} className="px-3 py-3 text-right font-medium">
                    <StoreName storeId={s.storeId} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, row) => {
                const lines = comparison.stores.map((s) => s.lines[row]!);
                const low = Math.min(...lines.map((l) => l.fils ?? Infinity));
                const product = productById.get(item.productId!);
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{product?.name ?? "Product"}</p>
                      <p className="text-xs text-muted">
                        {item.quantity}
                        {product?.soldBy === "kg" ? " kg" : " ×"}
                      </p>
                    </td>
                    {lines.map((l, i) => (
                      <td key={comparison.stores[i]!.storeId} className="px-3 py-3 text-right">
                        {l.fils === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={clsx("inline-flex items-center gap-1", l.fils === low && "font-semibold text-primary-strong")}>
                            {l.fils === low && <Check size={14} />}
                            <Money fils={l.fils} />
                          </span>
                        )}
                        {l.promoApplied && <span className="mt-0.5 block text-[11px] text-offer">offer</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {unpricedCount > 0 && (
          <p className="mt-3 text-sm text-muted">
            {unpricedCount} free-text item{unpricedCount > 1 ? "s are" : " is"} not priced and left out of the totals.
          </p>
        )}
      </section>
    </div>
  );
}
