"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { ArrowRight, Repeat } from "lucide-react";
import type { AccountView, CategoryRow, TxView } from "@/lib/types";
import { useApp } from "./providers";
import { Amount } from "./ui";

/** "🍜 Food" over "Family" for a subcategory, as in Money Manager's list. */
export function useCategoryLabel() {
  const { categoryById } = useApp();
  return (id: string | null | undefined) => {
    const cat = id ? categoryById.get(id) : undefined;
    if (!cat) return { top: "Uncategorised", sub: null as string | null, emoji: null as string | null };
    const parent = cat.parentId ? categoryById.get(cat.parentId) : undefined;
    return parent
      ? { top: parent.name, sub: cat.name, emoji: parent.emoji }
      : { top: cat.name, sub: null, emoji: cat.emoji };
  };
}

export function categoryOptions(categories: CategoryRow[], kind: "income" | "expense") {
  const parents = categories.filter((c) => c.kind === kind && !c.parentId);
  return parents.map((p) => ({ parent: p, children: categories.filter((c) => c.parentId === p.id) }));
}

export function TxRow({ tx, accountById, href }: { tx: TxView; accountById: Map<string, AccountView>; href?: string }) {
  const label = useCategoryLabel();
  const { user } = useApp();
  const from = accountById.get(tx.accountId)?.name ?? "Another account";
  const to = tx.toAccountId ? (accountById.get(tx.toAccountId)?.name ?? "Another account") : null;
  const cat = tx.type === "transfer" ? { top: "Transfer", sub: null, emoji: null } : tx.type === "adjustment" ? { top: "Adjustment", sub: null, emoji: null } : label(tx.categoryId);
  const title = tx.note || cat.sub || cat.top;

  return (
    <Link href={href ?? `/transactions/${tx.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <div className="w-24 shrink-0 text-xs leading-snug text-muted sm:w-32">
        <p className="truncate">
          {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
          {cat.top}
        </p>
        {cat.sub && <p className="truncate">{cat.sub}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {title}
          {tx.scheduleNo && (
            <span className="ml-1 text-muted">
              ({tx.scheduleNo}/{tx.scheduleCount})
            </span>
          )}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted">
          {to ? (
            <>
              {from} <ArrowRight size={12} className="shrink-0" /> {to}
            </>
          ) : (
            from
          )}
          {tx.createdByName && tx.createdByName !== user.displayName && <span className="ml-1 shrink-0">· by {tx.createdByName}</span>}
          {tx.source === "import" && <span className="ml-1 rounded bg-surface-2 px-1">imported</span>}
          {tx.source === "basket" && <span className="ml-1 rounded bg-primary-soft px-1 text-primary-strong">basket</span>}
          {tx.scheduleId && <Repeat size={11} className="ml-1 shrink-0" aria-label="Scheduled" />}
        </p>
      </div>
      <div className="text-right">
        <Amount
          minor={tx.amount}
          currency={tx.currency}
          tone={tx.type === "income" ? "income" : tx.type === "expense" ? "expense" : tx.type === "adjustment" ? "auto" : "none"}
          signed={tx.type === "adjustment"}
          className={clsx("text-sm font-semibold", tx.type === "transfer" && "text-muted")}
        />
        {tx.type === "transfer" && tx.toCurrency && tx.toCurrency !== tx.currency && tx.toAmount && (
          <p className="text-[11px] text-muted">
            → <Amount minor={tx.toAmount} currency={tx.toCurrency} />
          </p>
        )}
        {tx.feeAmount > 0 && (
          <p className="text-[11px] text-muted">
            fee <Amount minor={tx.feeAmount} currency={tx.currency} />
          </p>
        )}
      </div>
    </Link>
  );
}

/** Income / Exp. / Total strip in the base currency. */
export function TotalsBar({ income, expense }: { income: number; expense: number }) {
  const { base } = useApp();
  return (
    <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface py-3 text-center">
      <div>
        <p className="text-xs text-muted">Income</p>
        <Amount minor={income} currency={base.code} tone="income" className="text-[13px] font-semibold sm:text-base" />
      </div>
      <div>
        <p className="text-xs text-muted">Exp.</p>
        <Amount minor={expense} currency={base.code} tone="expense" className="text-[13px] font-semibold sm:text-base" />
      </div>
      <div>
        <p className="text-xs text-muted">Total</p>
        <Amount minor={income - expense} currency={base.code} className="text-[13px] font-semibold sm:text-base" />
      </div>
    </div>
  );
}

export function monthLabel(iso: string, style: "long" | "short" = "short") {
  return new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: style, year: "numeric" });
}
