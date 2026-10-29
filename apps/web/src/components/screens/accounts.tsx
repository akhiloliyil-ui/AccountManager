"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ChevronRight, HandCoins, Pencil, Plus, Settings2, Trash2, TrendingUp } from "lucide-react";
import { formatCurrency, fromMinor, toMinor, type NetWorth } from "@gpa/core";
import { removeAccount, saveAccount, updateBalance } from "@/app/actions/money";
import { evaluateAmount, minorToInput } from "@/lib/calc";
import type { AccountGroupRow, AccountView, TxView } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { TxRow } from "../ledger";
import { useApp } from "../providers";
import { Amount, BackLink, Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Sheet, Switch } from "../ui";

export const GROUP_TYPE_LABELS: Record<AccountGroupRow["type"], string> = {
  cash: "Cash",
  bank: "Bank account",
  credit_card: "Credit card",
  debit_card: "Debit card",
  savings: "Savings",
  prepaid: "Prepaid / top-up",
  investment: "Investments",
  overdraft: "Overdraft",
  loan: "Loan",
  insurance: "Insurance",
  receivable: "Money lent (friends)",
  other: "Other",
};

export function AccountsScreen({
  accounts,
  groups,
  worth,
  series,
}: {
  accounts: AccountView[];
  groups: AccountGroupRow[];
  worth: NetWorth;
  series: { date: string; worth: NetWorth }[];
}) {
  const { base } = useApp();
  const [editing, setEditing] = useState<AccountView | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const shown = accounts.filter((a) => showArchived || !a.archived);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        action={
          <div className="flex gap-2">
            <ButtonLink href="/settings/account-groups" variant="secondary" aria-label="Account groups" className="px-3">
              <Settings2 size={16} />
            </ButtonLink>
            <Button onClick={() => setEditing("new")}>
              <Plus size={18} /> <span className="hidden sm:inline">Add account</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface py-3 text-center">
        <div>
          <p className="text-xs text-muted">Assets</p>
          <Amount minor={worth.assets} currency={base.code} tone="income" className="text-[13px] font-semibold sm:text-base" />
        </div>
        <div>
          <p className="text-xs text-muted">Liabilities</p>
          <Amount minor={worth.liabilities} currency={base.code} tone="expense" className="text-[13px] font-semibold sm:text-base" />
        </div>
        <div>
          <p className="text-xs text-muted">Total</p>
          <Amount minor={worth.total} currency={base.code} className="text-[13px] font-semibold sm:text-base" />
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp size={16} /> Net worth, last 12 months
          </p>
          <Link href="/debts" className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong">
            <HandCoins size={15} /> Debts
          </Link>
        </div>
        <NetWorthLine points={series.map((s) => ({ date: s.date, value: s.worth.total }))} />
      </Card>

      {groups.map((g) => {
        const list = shown.filter((a) => a.groupId === g.id);
        if (!list.length) return null;
        const total = list.filter((a) => a.includeInTotals).reduce((s, a) => s + a.balanceBase, 0);
        return (
          <section key={g.id}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{g.name}</h2>
              <Amount minor={total} currency={base.code} tone={total < 0 ? "expense" : "none"} className="text-sm text-muted" />
            </div>
            <Card className="divide-y divide-border">
              {list.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className={clsx("flex items-center gap-3 px-4 py-3 hover:bg-surface-2", a.archived && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted">
                      {a.currency}
                      {!a.includeInTotals && " · not in totals"}
                      {a.archived && " · archived"}
                      {a.limitAmount ? ` · ${a.groupType === "credit_card" ? "limit" : "principal"} ${formatCurrency(a.limitAmount, { code: a.currency, decimals: 2 })}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Amount minor={a.balance} currency={a.currency} tone={a.balance < 0 ? "expense" : "income"} className="text-sm font-semibold" />
                    {a.currency !== base.code && <Amount minor={a.balanceBase} currency={base.code} className="block text-[11px] text-muted" />}
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              ))}
            </Card>
          </section>
        );
      })}

      {accounts.some((a) => a.archived) && (
        <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-muted hover:text-text">
          {showArchived ? "Hide" : "Show"} archived accounts
        </button>
      )}

      {editing && <AccountForm account={editing === "new" ? null : editing} groups={groups} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** One series, so no legend: the card title names it. Handles negative net worth with a zero line. */
function NetWorthLine({ points }: { points: { date: string; value: number }[] }) {
  const { base } = useApp();
  const [active, setActive] = useState<number | null>(null);
  const w = 600;
  const h = 160;
  const pad = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values, 1);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad + ((max - v) * (h - 2 * pad)) / (max - min || 1);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const shownPoint = points[active ?? points.length - 1];

  return (
    <div>
      <p className="mb-2 text-sm">
        <span className="text-muted">{shownPoint && new Date(`${shownPoint.date}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} </span>
        {shownPoint && <Amount minor={shownPoint.value} currency={base.code} className="font-semibold" />}
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Net worth by month" onMouseLeave={() => setActive(null)}>
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.date}>
            <rect x={x(i) - (w / points.length) / 2} y={0} width={w / points.length} height={h} fill="transparent" onMouseEnter={() => setActive(i)} />
            {active === i && <line x1={x(i)} x2={x(i)} y1={0} y2={h} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {points.filter((_, i) => i % 3 === 0 || i === points.length - 1).map((p) => (
          <span key={p.date}>{new Date(`${p.date}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
        ))}
      </div>
    </div>
  );
}

export function AccountForm({ account, groups, onClose }: { account: AccountView | null; groups: AccountGroupRow[]; onClose: () => void }) {
  const router = useRouter();
  const { currencies, currency } = useApp();
  const { pending, run } = useAction();
  const [groupId, setGroupId] = useState(account?.groupId ?? groups[0]?.id ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [code, setCode] = useState(account?.currency ?? currencies.find((c) => c.isBase)?.code ?? "AED");
  const [opening, setOpening] = useState(account ? minorToInput(account.openingBalance, currency(account.currency).decimals) : "");
  const [limit, setLimit] = useState(account?.limitAmount ? minorToInput(account.limitAmount, currency(account.currency).decimals) : "");
  const [rate, setRate] = useState(account?.interestRate?.toString() ?? "");
  const [counterparty, setCounterparty] = useState(account?.counterparty ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  const [inTotals, setInTotals] = useState(account?.includeInTotals ?? true);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const type = groups.find((g) => g.id === groupId)?.type;
  const debtLike = type === "loan" || type === "credit_card" || type === "overdraft" || type === "receivable";
  const decimals = currency(code).decimals;

  const submit = () => {
    const openingValue = opening.trim() ? evaluateAmount(opening) : 0;
    const limitValue = limit.trim() ? evaluateAmount(limit) : null;
    if (openingValue === null) return run(async () => ({ ok: false as const, error: "Opening balance is not a number" }));
    run(
      () =>
        saveAccount(account?.id ?? null, {
          groupId,
          name,
          currency: code,
          openingBalance: toMinor(openingValue, decimals),
          limitAmount: limitValue === null ? null : toMinor(Math.abs(limitValue), decimals),
          interestRate: rate.trim() ? Number(rate) : null,
          counterparty: counterparty.trim() || null,
          note: note.trim() || null,
          includeInTotals: inTotals,
          archived,
        }),
      {
        success: account ? "Account saved" : "Account added",
        onDone: (id) => {
          onClose();
          if (!account) router.push(`/accounts/${id}`);
        },
      },
    );
  };

  return (
    <Sheet open onClose={onClose} title={account ? "Edit account" : "Add account"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Group">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary Account" autoFocus />
        </Field>
        <Field label="Currency" hint={account ? "Fixed once the account has transactions." : undefined}>
          <Select value={code} onChange={(e) => setCode(e.target.value)}>
            {currencies
              .filter((c) => c.active || c.code === code)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Opening balance" hint={debtLike && type !== "receivable" ? "Money owed is negative, e.g. -119568" : "Balance before the first transaction you record"}>
          <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="tabular" />
        </Field>
        {debtLike && (
          <>
            <Field label={type === "credit_card" ? "Credit limit" : "Original amount"}>
              <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Optional" className="tabular" />
            </Field>
            <Field label={type === "receivable" ? "Owed by" : "Lender"}>
              <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Optional" />
            </Field>
          </>
        )}
        {(type === "loan" || type === "savings" || type === "overdraft") && (
          <Field label="Interest rate (% a year)">
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Optional" />
          </Field>
        )}
        <Field label="Note" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Account number ending, branch…" />
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          Include in totals and net worth
          <Switch checked={inTotals} onChange={setInTotals} label="Include in totals" />
        </label>
        {account && (
          <label className="flex items-center justify-between gap-3 text-sm">
            Archived (hidden from pickers)
            <Switch checked={archived} onChange={setArchived} label="Archived" />
          </label>
        )}
      </div>
      <Button className="mt-5 w-full" disabled={pending} onClick={submit}>
        {account ? "Save" : "Add account"}
      </Button>
    </Sheet>
  );
}

export function AccountDetailScreen({
  account,
  rows,
  groups,
  adjustments,
  inflow,
  outflow,
  accounts,
}: {
  account: AccountView;
  rows: (TxView & { delta: number; runningBalance: number })[];
  groups: AccountGroupRow[];
  adjustments: number;
  inflow: number;
  outflow: number;
  accounts: AccountView[];
}) {
  const router = useRouter();
  const { today, currency } = useApp();
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [valuing, setValuing] = useState(false);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const investment = account.groupType === "investment";
  const owed = account.balance < 0;
  const limit = account.limitAmount ?? 0;
  const past = rows.filter((r) => r.date <= today);
  const future = rows.filter((r) => r.date > today);

  return (
    <div className="space-y-6">
      <BackLink href="/accounts">Accounts</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {account.groupName} · {account.currency}
            {account.counterparty && ` · ${account.counterparty}`}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-[28px]">{account.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Edit
          </Button>
          <Button
            variant="danger"
            aria-label="Delete account"
            className="px-3"
            disabled={pending}
            onClick={() =>
              confirm(`Delete "${account.name}" and all ${rows.length} of its transactions? Archive it instead to keep history.`) &&
              run(() => removeAccount(account.id), { success: "Account deleted", onDone: () => router.push("/accounts") })
            }
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-sm text-muted">{owed ? "Owed" : "Balance"} today</p>
          <Amount minor={account.balance} currency={account.currency} tone={owed ? "expense" : "none"} className="text-2xl font-semibold" />
          {limit > 0 && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={clsx("h-full rounded-full", account.groupType === "credit_card" ? "bg-expense" : "bg-primary")}
                  style={{
                    width: `${Math.min(100, (account.groupType === "credit_card" ? Math.max(0, -account.balance) / limit : 1 - Math.max(0, -account.balance) / limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {account.groupType === "credit_card" ? (
                  <>
                    <Amount minor={limit + Math.min(0, account.balance)} currency={account.currency} /> available of <Amount minor={limit} currency={account.currency} />
                  </>
                ) : (
                  <>
                    {Math.round((1 - Math.max(0, -account.balance) / limit) * 100)}% repaid of <Amount minor={limit} currency={account.currency} />
                  </>
                )}
              </p>
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-muted">Money in</p>
          <Amount minor={inflow} currency={account.currency} tone="income" className="font-semibold" />
          <p className="mt-2 text-xs text-muted">Money out</p>
          <Amount minor={-outflow} currency={account.currency} tone="expense" className="text-[13px] font-semibold sm:text-base" />
        </div>
        <div>
          <p className="text-xs text-muted">{investment ? "Gain / loss (revaluations)" : "Adjustments"}</p>
          <Amount minor={adjustments} currency={account.currency} tone="auto" signed className="font-semibold" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" className="h-9" onClick={() => setValuing(true)}>
              {investment ? "Update value" : "Reconcile"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <ButtonLink variant="secondary" href={`/transactions/new?type=expense&account=${account.id}`}>
          Expense
        </ButtonLink>
        <ButtonLink variant="secondary" href={`/transactions/new?type=income&account=${account.id}`}>
          Income
        </ButtonLink>
        <ButtonLink variant="secondary" href={owed ? `/transactions/new?type=transfer&to=${account.id}` : `/transactions/new?type=transfer&account=${account.id}`}>
          {owed ? "Pay off" : "Transfer"}
        </ButtonLink>
        <ButtonLink variant="secondary" href={`/import?account=${account.id}`}>
          Import statement
        </ButtonLink>
      </div>

      {future.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            Scheduled <Badge>{future.length}</Badge>
          </h2>
          <Card className="divide-y divide-border">
            {[...future].reverse().slice(0, 6).map((r) => (
              <TxRow key={r.id} tx={r} accountById={accountById} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        {past.length ? (
          <Card className="divide-y divide-border">
            {past.slice(0, 200).map((r) => (
              <div key={r.id} className="flex items-center">
                <div className="min-w-0 flex-1">
                  <TxRow tx={r} accountById={accountById} />
                </div>
                <div className="hidden w-32 shrink-0 pr-4 text-right text-xs sm:block">
                  <p className="text-muted">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}</p>
                  <Amount minor={r.runningBalance} currency={account.currency} className="text-muted" />
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-muted">No transactions yet. Opening balance: <Amount minor={account.openingBalance} currency={account.currency} /></p>
        )}
      </section>

      {editing && <AccountForm account={account} groups={groups} onClose={() => setEditing(false)} />}
      {valuing && <BalanceSheet account={account} investment={investment} decimals={currency(account.currency).decimals} onClose={() => setValuing(false)} />}
    </div>
  );
}

function BalanceSheet({ account, investment, decimals, onClose }: { account: AccountView; investment: boolean; decimals: number; onClose: () => void }) {
  const { today } = useApp();
  const { pending, run } = useAction();
  const [value, setValue] = useState(String(fromMinor(account.balance, decimals)));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState(investment ? "Market value update" : "Reconciled with statement");

  return (
    <Sheet open onClose={onClose} title={investment ? "Update market value" : "Reconcile balance"}>
      <p className="mb-4 text-sm text-muted">
        GPA books the difference as an adjustment, which changes the balance and net worth but is not counted as income or spending.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${investment ? "Value" : "Actual balance"} (${account.currency})`}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="tabular" autoFocus />
        </Field>
        <Field label="As of">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-5 w-full"
        disabled={pending}
        onClick={() => {
          const v = evaluateAmount(value);
          if (v === null) return;
          run(() => updateBalance({ accountId: account.id, balance: toMinor(v, decimals), date, note }), {
            onDone: onClose,
            success: "Balance updated",
          });
        }}
      >
        Save
      </Button>
    </Sheet>
  );
}
