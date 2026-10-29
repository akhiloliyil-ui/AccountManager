"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowDownUp, ChevronDown, Repeat, Trash2 } from "lucide-react";
import { convertMinor, fromMinor, toMinor } from "@gpa/core";
import { removeTransaction, saveTransaction } from "@/app/actions/money";
import { evaluateAmount, minorToInput } from "@/lib/calc";
import type { AccountView, TxInput, TxType, TxView } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { categoryOptions, useCategoryLabel } from "../ledger";
import { useApp } from "../providers";
import { Amount, BackLink, Button, Card, Input, Segmented, Select, Sheet } from "../ui";

export interface TransactionFormProps {
  tx?: TxView;
  accounts: AccountView[];
  defaults: { type?: TxType; accountId?: string; toAccountId?: string; date: string; categoryId?: string };
}

type Schedule = NonNullable<TxInput["schedule"]>;

export function TransactionForm({ tx, accounts, defaults }: TransactionFormProps) {
  const router = useRouter();
  const { currency, categories, settings, canWrite } = useApp();
  const { pending, run } = useAction();
  const label = useCategoryLabel();
  const editing = !!tx;

  const firstAccount = defaults.accountId ?? settings.defaultAccountId ?? accounts[0]?.id ?? "";
  const [type, setType] = useState<TxType>(tx?.type ?? defaults.type ?? "expense");
  const [date, setDate] = useState(tx?.date ?? defaults.date);
  const [accountId, setAccountId] = useState(tx?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(tx?.toAccountId ?? defaults.toAccountId ?? "");
  const [amountText, setAmountText] = useState(tx ? minorToInput(tx.amount, currency(tx.currency).decimals) : "");
  const [toAmountText, setToAmountText] = useState(tx?.toAmount && tx.toCurrency ? minorToInput(tx.toAmount, currency(tx.toCurrency).decimals) : "");
  const [feeText, setFeeText] = useState(tx?.feeAmount ? minorToInput(tx.feeAmount, currency(tx.currency).decimals) : "");
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? defaults.categoryId ?? null);
  const [note, setNote] = useState(tx?.note ?? "");
  const [description, setDescription] = useState(tx?.description ?? "");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const from = accountById.get(accountId);
  const to = accountById.get(toAccountId);
  const fromCurrency = currency(from?.currency ?? "AED");
  const toCurrency = to ? currency(to.currency) : null;
  const crossCurrency = type === "transfer" && toCurrency && toCurrency.code !== fromCurrency.code;
  const amount = evaluateAmount(amountText);
  const suggestedReceived = crossCurrency && amount ? convertMinor(toMinor(amount, fromCurrency.decimals), fromCurrency, toCurrency!) : null;
  const cat = label(categoryId);
  const tone = type === "income" ? "income" : type === "expense" ? "expense" : "primary";

  const changeType = (next: TxType) => {
    setType(next);
    if (categoryId && categories.find((c) => c.id === categoryId)?.kind !== next) setCategoryId(null);
  };

  const build = (): TxInput | string => {
    if (!from) return "Choose an account";
    if (amount === null || (type !== "adjustment" && amount <= 0)) return "Enter an amount above zero";
    const input: TxInput = {
      type,
      date,
      accountId,
      amount: toMinor(amount, fromCurrency.decimals),
      categoryId: type === "income" || type === "expense" ? categoryId : null,
      note,
      description,
      schedule: editing ? null : schedule,
    };
    if (type === "transfer") {
      if (!to) return "Choose the account the money goes to";
      input.toAccountId = toAccountId;
      if (crossCurrency) {
        const received = toAmountText.trim() ? evaluateAmount(toAmountText) : fromMinor(suggestedReceived ?? 0, toCurrency!.decimals);
        if (!received || received <= 0) return "Enter the amount received";
        input.toAmount = toMinor(received, toCurrency!.decimals);
      }
      const fee = feeText.trim() ? evaluateAmount(feeText) : 0;
      if (fee === null || fee < 0) return "Fee must be a number";
      input.feeAmount = toMinor(fee, fromCurrency.decimals);
    }
    return input;
  };

  const submit = (keepOpen: boolean) => {
    const input = build();
    if (typeof input === "string") {
      run(async () => ({ ok: false as const, error: input }));
      return;
    }
    run(() => saveTransaction(tx?.id ?? null, input), {
      success: editing ? "Saved" : schedule ? `Added ${schedule.count} transactions` : "Added",
      onDone: () => {
        if (keepOpen) {
          setAmountText("");
          setToAmountText("");
          setFeeText("");
          setNote("");
          setDescription("");
          setSchedule(null);
        } else router.push(`/transactions?m=${date.slice(0, 7)}`);
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={`/transactions?m=${date.slice(0, 7)}`}>Transactions</BackLink>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        {editing ? "Edit" : "New"} {type === "adjustment" ? "balance adjustment" : type}
      </h1>

      {type !== "adjustment" && (
        <Segmented
          label="Transaction type"
          className="mb-5 flex w-full"
          value={type}
          onChange={changeType}
          options={[
            { value: "income", label: "Income", tone: "income" },
            { value: "expense", label: "Expense", tone: "expense" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
      )}

      <Card className="divide-y divide-border">
        <Row label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="border-0 px-0" />
        </Row>

        <Row label="Amount">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">{fromCurrency.symbol}</span>
            <Input
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={() => amount !== null && setAmountText(String(Math.round(amount * 10 ** fromCurrency.decimals) / 10 ** fromCurrency.decimals))}
              placeholder={type === "adjustment" ? "e.g. -250 or 1200" : "0.00   (12+8.5 works)"}
              aria-label={`Amount in ${fromCurrency.code}`}
              className="tabular border-0 px-0 text-lg font-semibold"
              autoFocus={!editing}
            />
          </div>
          {amountText && amount === null && <p className="text-xs text-danger">Not a number or sum</p>}
        </Row>

        {(type === "income" || type === "expense") && (
          <Row label="Category">
            <button type="button" onClick={() => setPicking(true)} className="flex h-11 w-full items-center justify-between text-left text-sm">
              <span className={clsx(!categoryId && "text-muted")}>
                {categoryId ? (
                  <>
                    {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
                    {cat.top}
                    {cat.sub && <span className="text-muted"> / {cat.sub}</span>}
                  </>
                ) : (
                  "Choose a category"
                )}
              </span>
              <ChevronDown size={16} className="text-muted" />
            </button>
          </Row>
        )}

        <Row label={type === "transfer" ? "From" : "Account"}>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        </Row>

        {type === "transfer" && (
          <>
            <Row
              label="To"
              action={
                <button
                  type="button"
                  aria-label="Swap from and to"
                  onClick={() => {
                    setAccountId(toAccountId);
                    setToAccountId(accountId);
                    setToAmountText("");
                  }}
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"
                >
                  <ArrowDownUp size={18} />
                </button>
              }
            >
              <AccountSelect accounts={accounts.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} placeholder="Choose account" />
            </Row>
            {crossCurrency && (
              <Row label="Received">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">{toCurrency!.symbol}</span>
                  <Input
                    inputMode="decimal"
                    value={toAmountText}
                    onChange={(e) => setToAmountText(e.target.value)}
                    placeholder={suggestedReceived ? minorToInput(suggestedReceived, toCurrency!.decimals) : "0.00"}
                    aria-label={`Amount received in ${toCurrency!.code}`}
                    className="tabular border-0 px-0"
                  />
                </div>
                <p className="text-xs text-muted">
                  Leave empty to use your rate (1 {fromCurrency.code} = {(toCurrency!.perBase / fromCurrency.perBase).toFixed(4)} {toCurrency!.code}).
                </p>
              </Row>
            )}
            <Row label="Fees">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">{fromCurrency.symbol}</span>
                <Input inputMode="decimal" value={feeText} onChange={(e) => setFeeText(e.target.value)} placeholder="0.00" aria-label="Transfer fee" className="tabular border-0 px-0" />
              </div>
            </Row>
          </>
        )}

        <Row label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Monthly purchase" className="border-0 px-0" maxLength={200} />
        </Row>
        <Row label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Details, receipt items…"
            className="w-full resize-y bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
          />
        </Row>

        {!editing && type !== "adjustment" && <ScheduleRow schedule={schedule} onChange={setSchedule} amount={amount} symbol={fromCurrency.symbol} />}
      </Card>

      {editing && tx.scheduleId && (
        <p className="mt-3 text-sm text-muted">
          <Repeat size={14} className="mr-1 inline" /> Payment {tx.scheduleNo} of {tx.scheduleCount}. Changes apply to this one only.
        </p>
      )}
      {editing && tx.source === "basket" && <p className="mt-3 text-sm text-muted">Booked from a grocery basket. Deleting it puts the items back on the list as not bought.</p>}

      {!canWrite && <p className="mt-5 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">You have read-only access, so this can’t be changed.</p>}
      <div className={clsx("mt-5 flex gap-2", !canWrite && "hidden")}>
        <Button className="flex-1" variant={tone === "primary" ? "primary" : tone} disabled={pending} onClick={() => submit(false)}>
          Save
        </Button>
        {!editing && (
          <Button variant="secondary" disabled={pending} onClick={() => submit(true)}>
            Continue
          </Button>
        )}
        {editing && (
          <Button variant="danger" aria-label="Delete" disabled={pending} onClick={() => setConfirmDelete(true)} className="px-3">
            <Trash2 size={16} />
          </Button>
        )}
      </div>

      <CategoryPicker
        open={picking}
        kind={type === "income" ? "income" : "expense"}
        categories={categories}
        selected={categoryId}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setCategoryId(id);
          setPicking(false);
        }}
      />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete transaction?">
        <p className="text-sm text-muted">
          {tx?.amount !== undefined && <Amount minor={tx.amount} currency={tx.currency} className="font-medium text-text" />} on {tx?.date}
          {tx?.feeAmount ? ", with its fee" : ""}.
        </p>
        <div className="mt-4 grid gap-2">
          {(tx?.scheduleId ? (["one", "following", "all"] as const) : (["one"] as const)).map((scope) => (
            <Button
              key={scope}
              variant={scope === "one" ? "danger" : "secondary"}
              disabled={pending}
              onClick={() =>
                run(() => removeTransaction(tx!.id, scope), {
                  success: "Deleted",
                  onDone: () => router.push(`/transactions?m=${tx!.date.slice(0, 7)}`),
                })
              }
            >
              {scope === "one" ? (tx?.scheduleId ? "Only this payment" : "Delete") : scope === "following" ? "This and later payments" : `All ${tx?.scheduleCount} payments`}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-1.5">
      <span className="w-24 shrink-0 pt-3 text-sm text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: AccountView[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const groups = new Map<string, AccountView[]>();
  for (const a of accounts) groups.set(a.groupName, [...(groups.get(a.groupName) ?? []), a]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Account" className="border-0 px-0">
      {placeholder && <option value="">{placeholder}</option>}
      {[...groups.entries()].map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

function ScheduleRow({
  schedule,
  onChange,
  amount,
  symbol,
}: {
  schedule: Schedule | null;
  onChange: (s: Schedule | null) => void;
  amount: number | null;
  symbol: string;
}) {
  if (!schedule) {
    return (
      <button
        type="button"
        onClick={() => onChange({ mode: "installment", count: 3, frequency: "monthly" })}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-sm font-medium text-primary-strong"
      >
        <Repeat size={16} /> Repeat or split into installments
      </button>
    );
  }
  const per = amount && schedule.mode === "installment" ? amount / schedule.count : amount;
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Repeat size={16} /> Rep/Inst.
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-sm text-muted hover:text-text">
          Remove
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select aria-label="Mode" value={schedule.mode} onChange={(e) => onChange({ ...schedule, mode: e.target.value as Schedule["mode"] })}>
          <option value="installment">Installments</option>
          <option value="repeat">Repeat</option>
        </Select>
        <Input
          type="number"
          min={2}
          max={360}
          aria-label="Number of payments"
          value={schedule.count}
          onChange={(e) => onChange({ ...schedule, count: Math.max(1, Math.min(360, Number(e.target.value) || 1)) })}
        />
        <Select aria-label="Frequency" value={schedule.frequency} onChange={(e) => onChange({ ...schedule, frequency: e.target.value as Schedule["frequency"] })}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </Select>
      </div>
      <p className="text-xs text-muted">
        {schedule.count} {schedule.frequency} payments
        {per ? ` of ${symbol} ${per.toFixed(2)}` : ""}
        {schedule.mode === "installment" ? " (the total split; any remainder on the first)" : " each"}. Future dates are planned, not yet in balances.
      </p>
    </div>
  );
}

function CategoryPicker({
  open,
  kind,
  categories,
  selected,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: "income" | "expense";
  categories: ReturnType<typeof useApp>["categories"];
  selected: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const options = categoryOptions(categories, kind);
  const selectedParent = categories.find((c) => c.id === selected)?.parentId ?? selected;
  const [expanded, setExpanded] = useState<string | null>(selectedParent);
  const current = options.find((o) => o.parent.id === expanded);

  return (
    <Sheet open={open} onClose={onClose} title="Category" wide>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {options.map(({ parent, children }) => (
          <button
            key={parent.id}
            type="button"
            onClick={() => (children.length ? setExpanded(expanded === parent.id ? null : parent.id) : onPick(parent.id))}
            aria-expanded={children.length ? expanded === parent.id : undefined}
            className={clsx(
              "flex min-h-16 flex-col items-center justify-center gap-1 bg-surface px-2 py-3 text-center text-sm hover:bg-surface-2",
              (expanded === parent.id || selectedParent === parent.id) && "bg-primary-soft",
            )}
          >
            <span>
              {parent.emoji && <span className="mr-1">{parent.emoji}</span>}
              {parent.name}
            </span>
            {children.length > 0 && <ChevronDown size={14} className={clsx("text-muted transition-transform", expanded === parent.id && "rotate-180")} />}
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted">{current.parent.name}</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={selected === current.parent.id} onClick={() => onPick(current.parent.id)}>
              All of {current.parent.name}
            </Chip>
            {current.children.map((c) => (
              <Chip key={c.id} active={selected === c.id} onClick={() => onPick(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Add or rename categories in Settings → Categories.</p>
    </Sheet>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-sm",
        active ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
