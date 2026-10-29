"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { CalendarCheck, CalendarClock, Check, CircleAlert } from "lucide-react";
import type { BillDue } from "@gpa/core";
import { markBillPaidAction, removeTransaction } from "@/app/actions/money";
import type { AccountView, Bill } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { useCategoryLabel } from "../ledger";
import { useApp } from "../providers";
import { Amount, BackLink, Button, Card, EmptyState, PageHeader, SectionTitle } from "../ui";

const GROUPS: { due: BillDue; title: string }[] = [
  { due: "overdue", title: "Overdue" },
  { due: "today", title: "Due today" },
  { due: "week", title: "Next 7 days" },
  { due: "later", title: "Later" },
];

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function BillRow({ bill, accountById, compact = false }: { bill: Bill; accountById: Map<string, AccountView>; compact?: boolean }) {
  const { canWrite } = useApp();
  const { pending, run } = useAction();
  const [done, setDone] = useState(false);
  const label = useCategoryLabel()(bill.categoryId);
  const late = bill.due === "overdue";
  const from = accountById.get(bill.accountId)?.name ?? "Another account";
  const to = bill.toAccountId ? (accountById.get(bill.toAccountId)?.name ?? "Another account") : null;

  return (
    <div className={clsx("flex items-center gap-3 px-4 py-3", done && "opacity-50")}>
      <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl", late ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
        {late ? <CircleAlert size={18} aria-hidden /> : <CalendarClock size={18} aria-hidden />}
      </span>
      <Link href={`/transactions/${bill.id}`} className="min-w-0 flex-1 hover:underline">
        <p className="truncate text-sm font-medium">
          {bill.note || label.sub || label.top}
          {bill.scheduleCount && bill.scheduleCount > 1 && (
            <span className="text-muted">
              {" "}
              ({bill.scheduleNo}/{bill.scheduleCount})
            </span>
          )}
        </p>
        <p className={clsx("truncate text-xs", late ? "text-danger" : "text-muted")}>
          {late ? `${bill.daysLate} day${bill.daysLate === 1 ? "" : "s"} overdue · ` : ""}
          {dayLabel(bill.date)} · {to ? `${from} → ${to}` : from}
        </p>
      </Link>
      <Amount minor={bill.amount} currency={bill.currency} className="text-sm font-semibold" />
      {canWrite && !done && (bill.due === "overdue" || bill.due === "today" || !compact) && (
        <Button
          variant="secondary"
          className="h-8 px-2.5 text-xs"
          disabled={pending}
          aria-label={`Mark ${bill.note || "payment"} on ${dayLabel(bill.date)} as paid`}
          onClick={() => run(() => markBillPaidAction(bill.id), { success: "Marked as paid", onDone: () => setDone(true) })}
        >
          <Check size={14} /> Paid
        </Button>
      )}
      {canWrite && !compact && !done && (
        <Button
          variant="ghost"
          className="h-8 px-2 text-xs text-muted"
          disabled={pending}
          onClick={() =>
            confirm("Skip this payment? It will be removed; the rest of the schedule stays.") &&
            run(() => removeTransaction(bill.id, "one"), { success: "Payment skipped", onDone: () => setDone(true) })
          }
        >
          Skip
        </Button>
      )}
    </div>
  );
}

export function BillsScreen({ bills, accounts }: { bills: Bill[]; accounts: AccountView[] }) {
  const { base, currency } = useApp();
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const toBase = (b: Bill) => Math.round((b.amount / currency(b.currency).perBase) * base.perBase);
  const dueNow = bills.filter((b) => b.due === "overdue" || b.due === "today");

  return (
    <div className="space-y-5">
      <BackLink href="/transactions">Transactions</BackLink>
      <PageHeader
        title="Bills"
        subtitle="Repeating payments and installments for the next 3 months. Tap Paid once each has gone through; they count in your balances from their date either way."
      />
      {bills.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={22} />}
          title="Nothing due"
          body="Repeating payments and installments (Rep/Inst when adding a transaction) appear here as their dates come up."
        />
      ) : (
        <>
          {dueNow.length > 0 && (
            <Card className="flex items-center justify-between gap-3 p-4">
              <p className="text-sm">
                <b>{dueNow.length}</b> to confirm now
              </p>
              <Amount minor={dueNow.reduce((s, b) => s + toBase(b), 0)} currency={base.code} className="font-semibold" />
            </Card>
          )}
          {GROUPS.map(({ due, title }) => {
            const list = bills.filter((b) => b.due === due);
            return (
              list.length > 0 && (
                <section key={due}>
                  <SectionTitle title={`${title} · ${list.length}`} />
                  <Card className="divide-y divide-border">
                    {list.map((b) => (
                      <BillRow key={b.id} bill={b} accountById={accountById} />
                    ))}
                  </Card>
                </section>
              )
            );
          })}
        </>
      )}
    </div>
  );
}

/** Home: what needs attention now and over the next week. */
export function BillsCard({ bills, accounts }: { bills: Bill[]; accounts: AccountView[] }) {
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const soon = bills.filter((b) => b.due !== "later").slice(0, 5);
  if (!soon.length) return null;
  const overdue = bills.filter((b) => b.due === "overdue").length;
  return (
    <section>
      <SectionTitle
        title={overdue ? `Bills · ${overdue} overdue` : "Bills this week"}
        action={
          <Link href="/transactions/bills" className="text-sm font-medium text-primary-strong hover:underline">
            All bills
          </Link>
        }
      />
      <Card className="divide-y divide-border">
        {soon.map((b) => (
          <BillRow key={b.id} bill={b} accountById={accountById} compact />
        ))}
      </Card>
    </section>
  );
}
