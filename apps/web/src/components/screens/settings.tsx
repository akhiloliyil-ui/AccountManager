"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, Coins, Download, FolderTree, Landmark, LockKeyhole, LogOut, Pencil, Plus, RefreshCw, ShoppingBasket, Trash2, Wand2 } from "lucide-react";
import { aedToFils } from "@gpa/core";
import { changePasscodeAction, signOut, signOutOtherDevices } from "@/app/actions/auth";
import { updateGrocerySettingsAction } from "@/app/actions/grocery";
import {
  addNewCurrency,
  makeBaseCurrency,
  removeAccountGroup,
  removeCategory,
  removeRule,
  reorderItems,
  saveAccountGroup,
  saveCategory,
  saveCurrency,
  saveRule,
  setRatesAutoUpdate,
  updateRatesNow,
} from "@/app/actions/money";
import type { AccountGroupRow, AccountView, CategoryRow, CurrencyRow, RuleRow } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { categoryOptions } from "../ledger";
import { InstallCard } from "../pwa";
import { useApp } from "../providers";
import { GROUP_TYPE_LABELS } from "./accounts";
import { BackLink, Badge, Button, Card, Field, IconButton, Input, PageHeader, Segmented, Select, Sheet, Switch } from "../ui";

export function SettingsHub() {
  const items: { href: string; icon: ReactNode; title: string; body: string; download?: boolean }[] = [
    { href: "/settings/categories", icon: <FolderTree size={18} />, title: "Categories", body: "Income and expense categories and subcategories" },
    { href: "/settings/account-groups", icon: <Landmark size={18} />, title: "Account groups", body: "Cash, cards, savings, loans, investments…" },
    { href: "/settings/currencies", icon: <Coins size={18} />, title: "Currencies", body: "AED, INR and others, base currency and exchange rates" },
    { href: "/settings/rules", icon: <Wand2 size={18} />, title: "Auto-categorise rules", body: "How imported statement lines get their category" },
    { href: "/settings/grocery", icon: <ShoppingBasket size={18} />, title: "Grocery", body: "Budget, stores, purchase category and default account" },
    { href: "/settings/security", icon: <LockKeyhole size={18} />, title: "Passcode & sign-in", body: "Change the passcode, sign out other devices" },
    { href: "/api/export/transactions", icon: <Download size={18} />, title: "Export transactions (CSV)", body: "Every transaction, for backup or spreadsheets", download: true },
  ];
  return (
    <div>
      <PageHeader title="Settings" />
      <InstallCard />
      <Card className="divide-y divide-border">
        {items.map((i) => (
          <Link key={i.href} href={i.href} prefetch={i.download ? false : undefined} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">{i.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="text-sm text-muted">{i.body}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        ))}
      </Card>
      <p className="mt-4 text-xs text-muted">Data is stored in PostgreSQL. Back up the database (or this CSV) regularly.</p>
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="secondary">
          <LogOut size={16} /> Sign out
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ security */

export function SecuritySettings() {
  const { pending, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  return (
    <div className="space-y-4">
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader title="Passcode & sign-in" subtitle="One passcode for the household. Devices stay signed in for 60 days." />
      <Card className="p-4">
        <p className="mb-3 font-medium">Change passcode</p>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changePasscodeAction(current, next, repeat), {
              success: "Passcode changed. Other devices will need the new one.",
              onDone: () => [setCurrent, setNext, setRepeat].forEach((set) => set("")),
            });
          }}
        >
          <Field label="Current passcode">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New passcode">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          </Field>
          <Field label="Repeat new passcode">
            <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          </Field>
          <Button type="submit" className="sm:col-span-3 sm:justify-self-start" disabled={pending}>
            Change passcode
          </Button>
        </form>
      </Card>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Lost a phone?</p>
          <p className="text-sm text-muted">Sign out every other device. This one stays signed in.</p>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => confirm("Sign out every other device?") && run(() => signOutOtherDevices(), { success: "Other devices signed out" })}
        >
          Sign out other devices
        </Button>
      </Card>
    </div>
  );
}


function Mover({ ids, index, table }: { ids: string[]; index: number; table: "categories" | "account_groups" }) {
  const { pending, run } = useAction();
  const move = (to: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    run(() => reorderItems(table, next));
  };
  return (
    <>
      <IconButton label="Move up" disabled={pending || index === 0} onClick={() => move(index - 1)}>
        <ArrowUp size={16} />
      </IconButton>
      <IconButton label="Move down" disabled={pending || index === ids.length - 1} onClick={() => move(index + 1)}>
        <ArrowDown size={16} />
      </IconButton>
    </>
  );
}

/* ------------------------------------------------------------------ categories */

export function CategoriesSettings() {
  const { categories } = useApp();
  const { pending, run } = useAction();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: CategoryRow | null; parentId: string | null } | null>(null);
  const options = categoryOptions(categories, kind);
  const parentIds = options.map((o) => o.parent.id);

  return (
    <div>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Categories"
        action={
          <Button onClick={() => setEditing({ row: null, parentId: null })}>
            <Plus size={18} /> <span className="hidden sm:inline">Add</span>
          </Button>
        }
      />
      <Segmented
        label="Kind"
        className="mb-4"
        value={kind}
        onChange={setKind}
        options={[
          { value: "expense", label: "Expense", tone: "expense" },
          { value: "income", label: "Income", tone: "income" },
        ]}
      />
      <Card className="divide-y divide-border">
        {options.map(({ parent, children }, index) => (
          <div key={parent.id}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button onClick={() => setOpen(open === parent.id ? null : parent.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium">
                  {parent.emoji && <span className="mr-1.5">{parent.emoji}</span>}
                  {parent.name}
                  {children.length > 0 && <span className="text-muted"> ({children.length})</span>}
                </p>
                {children.length > 0 && <p className="truncate text-xs text-muted">{children.map((c) => c.name).join(", ")}</p>}
              </button>
              <IconButton label={`Edit ${parent.name}`} onClick={() => setEditing({ row: parent, parentId: null })}>
                <Pencil size={16} />
              </IconButton>
              <Mover ids={parentIds} index={index} table="categories" />
            </div>
            {open === parent.id && (
              <div className="border-t border-border bg-surface-2/50 px-3 py-2">
                {children.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 py-1 pl-6">
                    <span className="flex-1 text-sm">{c.name}</span>
                    <IconButton label={`Edit ${c.name}`} onClick={() => setEditing({ row: c, parentId: parent.id })}>
                      <Pencil size={15} />
                    </IconButton>
                    <Mover ids={children.map((x) => x.id)} index={i} table="categories" />
                  </div>
                ))}
                <button onClick={() => setEditing({ row: null, parentId: parent.id })} className="ml-6 flex items-center gap-1.5 py-2 text-sm font-medium text-primary-strong">
                  <Plus size={15} /> Add subcategory
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-muted">Tap a category to manage its subcategories. Deleting a category leaves its transactions uncategorised.</p>

      {editing && (
        <CategoryForm
          kind={kind}
          row={editing.row}
          parentId={editing.parentId}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(input) => run(() => saveCategory(editing.row?.id ?? null, { kind, parentId: editing.parentId, ...input }), { onDone: () => setEditing(null) })}
          onDelete={
            editing.row
              ? () =>
                  confirm(`Delete "${editing.row!.name}"${editing.parentId ? "" : " and its subcategories"}?`) &&
                  run(() => removeCategory(editing.row!.id), { success: "Category deleted", onDone: () => setEditing(null) })
              : undefined
          }
        />
      )}
    </div>
  );
}

function CategoryForm({
  kind,
  row,
  parentId,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  kind: "income" | "expense";
  row: CategoryRow | null;
  parentId: string | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { name: string; emoji: string | null }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [emoji, setEmoji] = useState(row?.emoji ?? "");
  return (
    <Sheet open onClose={onClose} title={`${row ? "Edit" : "New"} ${parentId ? "subcategory" : `${kind} category`}`}>
      <form
        className="grid gap-3 sm:grid-cols-[96px_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, emoji: parentId ? null : emoji || null });
        }}
      >
        {!parentId && (
          <Field label="Emoji">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder="🛒" className="text-center text-lg" />
          </Field>
        )}
        <Field label="Name" className={parentId ? "sm:col-span-2" : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" className="flex-1" disabled={pending}>
            Save
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" aria-label="Delete" className="px-3" disabled={pending} onClick={onDelete}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ account groups */

const GROUP_KINDS = [
  { value: "default", label: "Default" },
  { value: "credit_card", label: "Account group for credit cards" },
  { value: "debit_card", label: "Account group for debit cards" },
] as const;

export function AccountGroupsSettings({ groups, accounts }: { groups: AccountGroupRow[]; accounts: AccountView[] }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState<AccountGroupRow | "new" | null>(null);
  const ids = groups.map((g) => g.id);
  return (
    <div>
      <BackLink href="/accounts">Accounts</BackLink>
      <PageHeader
        title="Account groups"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={18} /> <span className="hidden sm:inline">Add</span>
          </Button>
        }
      />
      <Card className="divide-y divide-border">
        {groups.map((g, i) => {
          const count = accounts.filter((a) => a.groupId === g.id).length;
          return (
            <div key={g.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-muted">
                  {count} account{count === 1 ? "" : "s"}
                </p>
              </div>
              {g.type !== "other" && <Badge tone={g.type === "credit_card" || g.type === "loan" || g.type === "overdraft" ? "expense" : "income"}>{GROUP_TYPE_LABELS[g.type]}</Badge>}
              <IconButton label={`Edit ${g.name}`} onClick={() => setEditing(g)}>
                <Pencil size={16} />
              </IconButton>
              <Mover ids={ids} index={i} table="account_groups" />
            </div>
          );
        })}
      </Card>
      {editing && (
        <GroupForm
          group={editing === "new" ? null : editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(input) => run(() => saveAccountGroup(editing === "new" ? null : editing.id, input), { onDone: () => setEditing(null) })}
          onDelete={editing !== "new" ? () => run(() => removeAccountGroup(editing.id), { success: "Group deleted", onDone: () => setEditing(null) }) : undefined}
        />
      )}
    </div>
  );
}

function GroupForm({
  group,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  group: AccountGroupRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { name: string; type: AccountGroupRow["type"] }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [type, setType] = useState<AccountGroupRow["type"]>(group?.type ?? "other");
  const quick = GROUP_KINDS.find((k) => k.value === type)?.value ?? (type === "other" ? "default" : null);
  return (
    <Sheet open onClose={onClose} title="Account group">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, type });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account type name" autoFocus />
        <div className="space-y-2">
          {GROUP_KINDS.map((k) => (
            <label key={k.value} className="flex items-center gap-3 text-sm">
              <input type="radio" name="kind" checked={quick === k.value} onChange={() => setType(k.value === "default" ? "other" : k.value)} className="size-5 accent-[var(--income)]" />
              {k.label}
            </label>
          ))}
        </div>
        <Field label="Or a specific type (drives debts, investments and net worth views)">
          <Select value={type} onChange={(e) => setType(e.target.value as AccountGroupRow["type"])}>
            {Object.entries(GROUP_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="income" className="flex-1" disabled={pending}>
            Save
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" aria-label="Delete group" className="px-3" disabled={pending} onClick={onDelete}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ currencies */

export interface FxStatus {
  autoUpdate: boolean;
  updatedAt: string | null;
  publishedAt: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CurrenciesSettings({ currencies, fx }: { currencies: CurrencyRow[]; fx: FxStatus }) {
  const { pending, run } = useAction();
  const base = currencies.find((c) => c.isBase)!;
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Currencies"
        subtitle={`Totals, stats and net worth are shown in ${base.code}.`}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} /> <span className="hidden sm:inline">Add</span>
          </Button>
        }
      />
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Update rates online</p>
            <p className="text-sm text-muted">
              Checks ExchangeRate-API’s daily rates twice a day. Off means GPA never goes online and you type rates yourself.
            </p>
          </div>
          <Switch
            checked={fx.autoUpdate}
            label="Update rates online automatically"
            onChange={(on) =>
              // Switching on also fetches straight away, so a failure shows now rather than silently later.
              run(() => setRatesAutoUpdate(on), { onDone: () => (on ? run(() => updateRatesNow(), { success: "Rates updated, and will stay current" }) : undefined) })
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <Button variant="secondary" className="h-9" disabled={pending} onClick={() => run(() => updateRatesNow(), { success: "Exchange rates updated" })}>
            <RefreshCw size={15} className={clsx(pending && "animate-spin")} /> Update now
          </Button>
          <span>
            {fx.updatedAt ? `Last updated ${when(fx.updatedAt)}` : "Never updated online"}
            {fx.publishedAt && ` · rates published ${when(fx.publishedAt)}`}
          </span>
        </div>
      </Card>
      <Card className="divide-y divide-border">
        {currencies.map((c) => (
          <CurrencyRowEditor key={`${c.code}-${c.perBase}`} c={c} base={base} pending={pending} run={run} />
        ))}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Changing a rate, by hand or online, re-values totals in {base.code} everywhere (including past months). Transfers between currencies keep the amount actually
        received. Currencies the rate service doesn’t list keep the rate you typed.
      </p>
      {adding && <AddCurrency onClose={() => setAdding(false)} base={base.code} />}
    </div>
  );
}

function CurrencyRowEditor({ c, base, pending, run }: { c: CurrencyRow; base: CurrencyRow; pending: boolean; run: ReturnType<typeof useAction>["run"] }) {
  const [rate, setRate] = useState(String(Number(c.perBase.toPrecision(8))));
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="w-40 min-w-0">
        <p className="font-medium">
          {c.code} <span className="text-muted">{c.symbol}</span>
        </p>
        <p className="truncate text-xs text-muted">{c.name}</p>
      </div>
      {c.isBase ? (
        <Badge tone="primary">Base currency</Badge>
      ) : (
        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(rate);
            if (v > 0) run(() => saveCurrency(c.code, { perBase: v }), { success: `${c.code} rate saved` });
          }}
        >
          <span className="text-muted">1 {base.code} =</span>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-28 tabular" aria-label={`${c.code} per ${base.code}`} />
          <span className="text-muted">{c.code}</span>
          {Number(rate) !== c.perBase && (
            <Button type="submit" className="h-9" disabled={pending}>
              Save
            </Button>
          )}
        </form>
      )}
      <div className="ml-auto flex items-center gap-3">
        {!c.isBase && (
          <button className="text-xs text-muted hover:text-text" disabled={pending} onClick={() => confirm(`Make ${c.code} the base currency?`) && run(() => makeBaseCurrency(c.code))}>
            Make base
          </button>
        )}
        {!c.isBase && <Switch checked={c.active} onChange={(v) => run(() => saveCurrency(c.code, { active: v }))} label={`${c.code} in use`} />}
      </div>
    </div>
  );
}

function AddCurrency({ onClose, base }: { onClose: () => void; base: string }) {
  const { pending, run } = useAction();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [rate, setRate] = useState("");
  return (
    <Sheet open onClose={onClose} title="Add currency">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addNewCurrency({ code, name: name || code.toUpperCase(), symbol: symbol || code.toUpperCase(), decimals: 2, perBase: Number(rate) }), { onDone: onClose });
        }}
      >
        <Field label="ISO code">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder="QAR" autoFocus />
        </Field>
        <Field label="Symbol">
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="QR" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Qatari Riyal" />
        </Field>
        <Field label={`Units per 1 ${base}`}>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.99" />
        </Field>
        <Button type="submit" className="sm:col-span-2" disabled={pending}>
          Add currency
        </Button>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ rules */

export function RulesSettings({ rules }: { rules: RuleRow[] }) {
  const { categories, categoryById } = useApp();
  const { pending, run } = useAction();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const label = (id: string) => {
    const c = categoryById.get(id);
    const p = c?.parentId ? categoryById.get(c.parentId) : undefined;
    return c ? (p ? `${p.name} / ${c.name}` : c.name) : "Deleted category";
  };

  return (
    <div>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader title="Auto-categorise rules" subtitle="When an imported line's description contains the text, it gets the category. The longest match wins." />
      <Card className="mb-5 p-4">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveRule({ pattern, categoryId }), {
              success: "Rule added",
              onDone: () => setPattern(""),
            });
          }}
        >
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Description contains, e.g. carrefour" aria-label="Description contains" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
            <option value="">Category</option>
            {(["expense", "income"] as const).map((kind) => (
              <optgroup key={kind} label={kind === "expense" ? "Expense" : "Income"}>
                {categoryOptions(categories, kind).flatMap(({ parent, children }) => [
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>,
                  ...children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${parent.name} / ${c.name}`}
                    </option>
                  )),
                ])}
              </optgroup>
            ))}
          </Select>
          <Button type="submit" disabled={pending || !pattern.trim() || !categoryId}>
            Add rule
          </Button>
        </form>
      </Card>
      <Card className="divide-y divide-border">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm">{r.pattern}</code>
            <span className="text-muted">→</span>
            <span className={clsx("min-w-0 flex-1 truncate text-sm", r.kind === "income" ? "text-income" : "text-text")}>{label(r.categoryId)}</span>
            <IconButton label={`Delete rule ${r.pattern}`} disabled={pending} onClick={() => run(() => removeRule(r.id))}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-muted">Without a rule, GPA also learns from how you categorised the same merchant before.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ grocery */

export function GrocerySettings({ accounts }: { accounts: AccountView[] }) {
  const { settings, catalog, categories } = useApp();
  const { pending, run } = useAction();
  const [budget, setBudget] = useState(String(settings.groceryBudgetFils / 100));
  const expense = categoryOptions(categories, "expense");

  return (
    <div>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader title="Grocery" />
      <Card className="space-y-4 p-5">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(budget);
            if (v >= 0) run(() => updateGrocerySettingsAction({ groceryBudgetFils: aedToFils(v) }), { success: "Budget saved" });
          }}
        >
          <Field label="Monthly grocery budget (AED)" className="flex-1">
            <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="tabular" />
          </Field>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
        <Field label="Purchases are booked to" hint="Spending in this category (and its subcategories) counts against the grocery budget.">
          <Select value={settings.groceryCategoryId} disabled={pending} onChange={(e) => run(() => updateGrocerySettingsAction({ groceryCategoryId: e.target.value }), { success: "Saved" })}>
            {expense.flatMap(({ parent, children }) => [
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>,
              ...children.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${parent.name} / ${c.name}`}
                </option>
              )),
            ])}
          </Select>
        </Field>
        <Field label="Default account for new transactions and purchases">
          <Select value={settings.defaultAccountId ?? ""} disabled={pending} onChange={(e) => run(() => updateGrocerySettingsAction({ defaultAccountId: e.target.value || null }), { success: "Saved" })}>
            <option value="">First account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Stores to compare (at least two)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.stores.map((s) => {
              const on = settings.preferredStoreIds.includes(s.id);
              return (
                <label key={s.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
                  </span>
                  <Switch
                    checked={on}
                    label={s.name}
                    onChange={(v) => {
                      const next = v ? [...settings.preferredStoreIds, s.id] : settings.preferredStoreIds.filter((x) => x !== s.id);
                      run(() => updateGrocerySettingsAction({ preferredStoreIds: catalog.stores.map((x) => x.id).filter((x) => next.includes(x)) }));
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
