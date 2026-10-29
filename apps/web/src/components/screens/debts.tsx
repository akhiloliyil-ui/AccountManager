"use client";

import Link from "next/link";
import { CalendarClock, HandCoins } from "lucide-react";
import { convertMinor } from "@gpa/core";
import type { AccountView, TxView } from "@/lib/types";
import { useApp } from "../providers";
import { Amount, BackLink, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "../ui";

export function DebtsScreen({ owed, receivable, upcoming }: { owed: AccountView[]; receivable: AccountView[]; upcoming: TxView[] }) {
  const { base, currency } = useApp();
  const totalOwed = owed.reduce((s, a) => s + Math.min(0, a.balanceBase), 0);
  const totalLent = receivable.reduce((s, a) => s + Math.max(0, a.balanceBase), 0);
  const byAccount = new Map<string, TxView[]>();
  const debtIds = new Set(owed.concat(receivable).map((a) => a.id));
  for (const t of upcoming) {
    // A repayment belongs to the debt it pays into, not to the account it is paid from.
    const id = t.toAccountId && debtIds.has(t.toAccountId) ? t.toAccountId : debtIds.has(t.accountId) ? t.accountId : undefined;
    if (id) byAccount.set(id, [...(byAccount.get(id) ?? []), t]);
  }

  if (!owed.length && !receivable.length) {
    return (
      <div>
        <BackLink href="/accounts">Accounts</BackLink>
        <EmptyState
          icon={<HandCoins size={22} />}
          title="No debts tracked"
          body="Add a loan, credit card or overdraft account, or money you lent under Friends. Record repayments as transfers into them."
          action={<ButtonLink href="/accounts">Add an account</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href="/accounts">Accounts</BackLink>
      <PageHeader title="Debts" subtitle="Loans, cards and overdrafts you owe, and money owed to you." />

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">You owe</p>
          <Amount minor={-totalOwed} currency={base.code} tone="expense" className="text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Owed to you</p>
          <Amount minor={totalLent} currency={base.code} tone="income" className="text-xl font-semibold" />
        </Card>
      </div>

      {[
        { title: "You owe", list: owed, repay: true },
        { title: "Owed to you", list: receivable, repay: false },
      ].map(
        ({ title, list, repay }) =>
          list.length > 0 && (
            <section key={title}>
              <SectionTitle title={title} />
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((a) => {
                  const outstanding = repay ? Math.max(0, -a.balance) : Math.max(0, a.balance);
                  const principal = a.limitAmount ?? 0;
                  const isCard = a.groupType === "credit_card";
                  const progress = principal && !isCard ? 1 - outstanding / principal : null;
                  const next = byAccount.get(a.id)?.[0];
                  const remaining = byAccount.get(a.id)?.length ?? 0;
                  return (
                    <Card key={a.id} className="flex flex-col p-4">
                      <Link href={`/accounts/${a.id}`} className="flex items-start justify-between gap-3 hover:underline">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{a.name}</p>
                          <p className="text-xs text-muted">
                            {a.groupName}
                            {a.counterparty && ` · ${a.counterparty}`}
                            {a.interestRate != null && ` · ${a.interestRate}%`}
                          </p>
                        </div>
                        <Amount minor={outstanding} currency={a.currency} tone={repay ? "expense" : "income"} className="font-semibold" />
                      </Link>
                      {progress !== null && (
                        <div className="mt-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {Math.round(Math.max(0, progress) * 100)}% {repay ? "repaid" : "returned"} of <Amount minor={principal} currency={a.currency} />
                          </p>
                        </div>
                      )}
                      {isCard && principal > 0 && (
                        <p className="mt-2 text-xs text-muted">
                          {outstanding > 0 && outstanding / principal < 0.01 ? "<1" : Math.round((outstanding / principal) * 100)}% of the <Amount minor={principal} currency={a.currency} /> limit used
                        </p>
                      )}
                      {next && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                          <CalendarClock size={13} /> Next {new Date(`${next.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}:{" "}
                          <Amount minor={next.toAccountId === a.id && next.toAmount ? next.toAmount : convertMinor(next.amount, currency(next.currency), currency(a.currency))} currency={a.currency} />
                          {remaining > 1 && ` · ${remaining} payments left`}
                        </p>
                      )}
                      {outstanding > 0 && (
                        <ButtonLink
                          variant="secondary"
                          className="mt-4 h-9 self-start"
                          href={repay ? `/transactions/new?type=transfer&to=${a.id}` : `/transactions/new?type=transfer&account=${a.id}`}
                        >
                          {repay ? "Record a repayment" : "Record money received"}
                        </ButtonLink>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ),
      )}
      <p className="text-xs text-muted">
        Repayments are transfers into the debt account, so they reduce what you owe without counting as spending. Book interest or fees as an expense on the same account.
      </p>
    </div>
  );
}
