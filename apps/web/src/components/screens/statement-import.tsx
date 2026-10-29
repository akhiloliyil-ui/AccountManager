"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Check, FileSpreadsheet, Pencil, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { guessMapping, headerSignature, normalizeStatement, type Cell, type ColumnMapping } from "@gpa/core";
import { commitStatementAction, deleteImportFormatAction, previewStatementAction, readStatement, renameImportFormatAction, undoImportAction } from "@/app/actions/imports";
import type { AccountView, PreviewLine } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { AccountSelect } from "./transaction-form";
import { categoryOptions } from "../ledger";
import { useApp } from "../providers";
import { Amount, Badge, Button, Card, Field, IconButton, PageHeader, Select, Switch } from "../ui";

export interface ImportBatchSummary {
  id: string;
  accountName: string;
  filename: string;
  importedCount: number;
  skippedCount: number;
  createdAt: Date;
}

export interface ImportFormatSummary {
  id: string;
  name: string;
  useCount: number;
  lastUsedAt: Date;
  accountId: string | null;
}

type Step = "file" | "map" | "review" | "done";

interface Choice {
  include: boolean;
  /** category id, "transfer:<accountId>", or "" for uncategorised. */
  target: string;
}

export function StatementImportScreen({
  accounts,
  batches,
  formats,
  initialAccountId,
}: {
  accounts: AccountView[];
  batches: ImportBatchSummary[];
  formats: ImportFormatSummary[];
  initialAccountId?: string;
}) {
  const { pending, run } = useAction();
  const { currency } = useApp();
  const [recognised, setRecognised] = useState<{ name: string; accountId: string | null } | null>(null);
  const [step, setStep] = useState<Step>("file");
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts.find((a) => a.groupType === "bank")?.id ?? accounts[0]?.id ?? "");
  const [file, setFile] = useState<{ filename: string; grid: Cell[][] } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [lines, setLines] = useState<PreviewLine[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [result, setResult] = useState<{ batchId: string; imported: number; skipped: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const account = accounts.find((a) => a.id === accountId);
  const decimals = currency(account?.currency ?? "AED").decimals;

  const normalized = useMemo(() => (file && mapping ? normalizeStatement(file.grid, mapping, decimals) : null), [file, mapping, decimals]);

  const upload = (f: File | undefined) => {
    if (!f) return;
    const form = new FormData();
    form.set("file", f);
    run(() => readStatement(form), {
      onDone: (data) => {
        setFile({ filename: data.filename, grid: data.grid });
        if (data.saved) {
          // A layout imported before: use its saved columns and go straight to review.
          const rows = normalizeStatement(data.grid, data.saved.mapping, decimals).rows;
          setMapping(data.saved.mapping);
          setRecognised({ name: data.saved.name, accountId: data.saved.accountId });
          if (rows.length) return preview(rows);
        } else {
          setMapping(guessMapping(data.grid));
          setRecognised(null);
        }
        setStep("map");
      },
    });
  };

  const preview = (rows = normalized?.rows, forAccount = accountId) => {
    if (!rows?.length) return;
    run(() => previewStatementAction(forAccount, rows), {
      onDone: (data) => {
        setLines(data);
        setChoices(data.map((l) => ({ include: !l.duplicate, target: l.suggestion?.categoryId ?? "" })));
        setStep("review");
      },
    });
  };
  const suggested = recognised?.accountId && recognised.accountId !== accountId ? accounts.find((a) => a.id === recognised.accountId) : undefined;

  const commit = () => {
    const chosen = lines
      .map((l, i) => ({ l, c: choices[i]! }))
      .filter(({ c }) => c.include)
      .map(({ l, c }) => ({
        date: l.date,
        description: l.description,
        amount: l.amount,
        hash: l.hash,
        categoryId: c.target && !c.target.startsWith("transfer:") ? c.target : null,
        transferAccountId: c.target.startsWith("transfer:") ? c.target.slice(9) : null,
      }));
    const format = mapping && file ? { signature: headerSignature(file.grid[mapping.headerRow] ?? []), mapping } : undefined;
    run(() => commitStatementAction({ accountId, filename: file!.filename, rowCount: lines.length, lines: chosen, format }), {
      onDone: (data) => {
        setResult(data);
        setStep("done");
      },
    });
  };

  const reset = () => {
    setStep("file");
    setFile(null);
    setMapping(null);
    setLines([]);
    setResult(null);
    setRecognised(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Import bank statement" subtitle="CSV or Excel (.xlsx, .xls) from any bank. Re-importing the same file never creates duplicates." />
      <Steps step={step} />

      {step === "file" && (
        <Card className="space-y-5 p-5">
          <Field label="Statement belongs to" className="max-w-md">
            <div className="rounded-xl border border-border px-3">
              <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
            </div>
          </Field>
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
              <FileSpreadsheet size={22} />
            </span>
            <p className="mt-3 font-semibold">Choose the exported statement</p>
            <p className="mt-1 text-sm text-muted">Download it from online banking as CSV or Excel. Up to 15 MB.</p>
            <input ref={input} type="file" accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <Button className="mt-5" disabled={pending || !accountId} onClick={() => input.current?.click()}>
              <Upload size={16} /> {pending ? "Reading…" : "Choose file"}
            </Button>
          </div>
        </Card>
      )}

      {step === "map" && file && mapping && (
        <MapStep grid={file.grid} filename={file.filename} mapping={mapping} onChange={setMapping} normalized={normalized} currencyCode={account?.currency ?? "AED"} onBack={reset} onNext={() => preview()} pending={pending} />
      )}

      {step === "review" && recognised && (
        <Card className="flex flex-wrap items-center gap-3 border-primary/40 bg-primary-soft/40 p-4">
          <Sparkles size={18} className="shrink-0 text-primary-strong" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            Recognised <b>{recognised.name}</b>: columns matched as last time.
            {suggested && <> Last imported into {suggested.name}.</>}
          </p>
          {suggested && (
            <Button
              variant="secondary"
              className="h-9"
              disabled={pending}
              onClick={() => {
                setAccountId(suggested.id);
                preview(normalized?.rows, suggested.id);
              }}
            >
              Use {suggested.name}
            </Button>
          )}
          <Button variant="ghost" className="h-9" onClick={() => setStep("map")}>
            Adjust columns
          </Button>
        </Card>
      )}

      {step === "review" && (
        <ReviewStep lines={lines} choices={choices} setChoices={setChoices} accounts={accounts.filter((a) => a.id !== accountId)} currencyCode={account?.currency ?? "AED"} onBack={() => setStep("map")} onCommit={commit} pending={pending} />
      )}

      {step === "done" && result && (
        <Card className="flex flex-col items-center p-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-on-primary">
            <Check size={22} />
          </span>
          <p className="mt-3 text-lg font-semibold">
            {result.imported} transaction{result.imported === 1 ? "" : "s"} imported
          </p>
          {result.skipped > 0 && <p className="text-sm text-muted">{result.skipped} already existed and were skipped.</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              Import another
            </Button>
            <Link href={`/accounts/${accountId}`} className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary">
              Open account
            </Link>
          </div>
        </Card>
      )}

      {step === "file" && formats.length > 0 && <SavedFormats formats={formats} accounts={accounts} />}

      {batches.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Recent imports</h2>
          <Card className="divide-y divide-border">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.filename}</p>
                  <p className="text-xs text-muted">
                    {b.accountName} · {b.importedCount} imported{b.skippedCount ? `, ${b.skippedCount} skipped` : ""} ·{" "}
                    {b.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="h-9"
                  disabled={pending}
                  onClick={() => confirm(`Remove the ${b.importedCount} transactions imported from ${b.filename}?`) && run(() => undoImportAction(b.id), { success: "Import undone" })}
                >
                  <RotateCcw size={15} /> Undo
                </Button>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const all: [Step, string][] = [
    ["file", "File"],
    ["map", "Columns"],
    ["review", "Review"],
    ["done", "Done"],
  ];
  const at = all.findIndex(([s]) => s === step);
  return (
    <ol className="flex gap-2 text-xs font-medium">
      {all.map(([s, label], i) => (
        <li key={s} className={clsx("flex-1 rounded-full py-1.5 text-center", i <= at ? "bg-primary-soft text-primary-strong" : "bg-surface-2 text-muted")}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function MapStep({
  grid,
  filename,
  mapping,
  onChange,
  normalized,
  currencyCode,
  onBack,
  onNext,
  pending,
}: {
  grid: Cell[][];
  filename: string;
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  normalized: ReturnType<typeof normalizeStatement> | null;
  currencyCode: string;
  onBack: () => void;
  onNext: () => void;
  pending: boolean;
}) {
  const header = grid[mapping.headerRow] ?? [];
  const width = Math.max(...grid.slice(0, 30).map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => ({ i, label: header[i] || `Column ${i + 1}` }));
  const split = mapping.amount === undefined;
  const set = (patch: Partial<ColumnMapping>) => onChange({ ...mapping, ...patch });
  const colSelect = (value: number | undefined, onPick: (v: number | undefined) => void, optional = false) => (
    <Select value={value ?? ""} onChange={(e) => onPick(e.target.value === "" ? undefined : Number(e.target.value))}>
      {optional && <option value="">None</option>}
      {cols.map((c) => (
        <option key={c.i} value={c.i}>
          {c.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <p className="text-sm text-muted">
          <span className="font-medium text-text">{filename}</span> · {grid.length} rows. Columns were detected automatically; correct them if needed.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Header row">
            <Select value={mapping.headerRow} onChange={(e) => onChange({ ...guessMapping(grid.slice(Number(e.target.value))), headerRow: Number(e.target.value) })}>
              {grid.slice(0, 25).map((r, i) => (
                <option key={i} value={i}>
                  Row {i + 1}: {r.slice(0, 3).join(" | ").slice(0, 40)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">{colSelect(mapping.date, (v) => set({ date: v ?? 0 }))}</Field>
          <Field label="Date order">
            <Select value={mapping.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as ColumnMapping["dateFormat"] })}>
              <option value="DMY">Day/Month/Year (UAE, India)</option>
              <option value="MDY">Month/Day/Year (US)</option>
              <option value="YMD">Year-Month-Day</option>
            </Select>
          </Field>
          <Field label="Description">{colSelect(mapping.description, (v) => set({ description: v ?? 0 }))}</Field>
          <Field label="Amounts are in">
            <Select
              value={split ? "split" : "single"}
              onChange={(e) =>
                e.target.value === "split"
                  ? set({ amount: undefined, debit: mapping.debit ?? mapping.amount ?? 0, credit: mapping.credit ?? 0 })
                  : set({ amount: mapping.amount ?? mapping.debit ?? 0, debit: undefined, credit: undefined })
              }
            >
              <option value="single">One signed column</option>
              <option value="split">Separate debit / credit columns</option>
            </Select>
          </Field>
          <Field label="Balance (optional)">{colSelect(mapping.balance, (v) => set({ balance: v }), true)}</Field>
          {split ? (
            <>
              <Field label="Money out (debit)">{colSelect(mapping.debit, (v) => set({ debit: v }), true)}</Field>
              <Field label="Money in (credit)">{colSelect(mapping.credit, (v) => set({ credit: v }), true)}</Field>
            </>
          ) : (
            <>
              <Field label="Amount">{colSelect(mapping.amount, (v) => set({ amount: v ?? 0 }))}</Field>
              <label className="flex items-center justify-between gap-3 self-end rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                Spending shows as positive
                <Switch checked={mapping.invert} onChange={(v) => set({ invert: v })} label="Flip amount sign" />
              </label>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {normalized?.rows.slice(0, 8).map((r) => (
              <tr key={r.line}>
                <td className="px-4 py-2 whitespace-nowrap">{r.date}</td>
                <td className="max-w-xs truncate px-4 py-2">{r.description}</td>
                <td className="px-4 py-2 text-right">
                  <Amount minor={r.amount} currency={currencyCode} tone="auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          {normalized?.rows.length ?? 0} transactions read
          {normalized?.errors.length ? (
            <span className="text-danger">
              {" "}
              · {normalized.errors.length} rows skipped (e.g. line {normalized.errors[0]!.line}: {normalized.errors[0]!.message})
            </span>
          ) : null}
        </p>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={pending || !normalized?.rows.length} onClick={onNext}>
          Check for duplicates and categories
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  lines,
  choices,
  setChoices,
  accounts,
  currencyCode,
  onBack,
  onCommit,
  pending,
}: {
  lines: PreviewLine[];
  choices: Choice[];
  setChoices: (c: Choice[]) => void;
  accounts: AccountView[];
  currencyCode: string;
  onBack: () => void;
  onCommit: () => void;
  pending: boolean;
}) {
  const { categories } = useApp();
  const options = { income: categoryOptions(categories, "income"), expense: categoryOptions(categories, "expense") };
  const included = choices.filter((c) => c.include).length;
  const dupes = lines.filter((l) => l.duplicate).length;
  const update = (i: number, patch: Partial<Choice>) => setChoices(choices.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="primary">{included} to import</Badge>
        {dupes > 0 && <Badge tone="offer">{dupes} already imported</Badge>}
        <Badge>{lines.filter((l) => l.suggestion).length} auto-categorised</Badge>
        <button className="ml-auto text-sm text-primary-strong" onClick={() => setChoices(choices.map((c, i) => ({ ...c, include: !lines[i]!.duplicate })))}>
          Select all new
        </button>
      </div>
      <Card className="divide-y divide-border">
        {lines.map((l, i) => {
          const c = choices[i]!;
          return (
            <div key={l.hash} className={clsx("grid gap-2 px-4 py-3 sm:grid-cols-[auto_1fr_minmax(180px,240px)] sm:items-center", !c.include && "opacity-55")}>
              <input type="checkbox" aria-label="Import this line" checked={c.include} onChange={(e) => update(i, { include: e.target.checked })} className="size-5 accent-[var(--primary)]" />
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{l.description}</p>
                  <Amount minor={l.amount} currency={currencyCode} tone="auto" className="text-sm font-semibold" />
                </div>
                <p className="text-xs text-muted">
                  {l.date}
                  {l.duplicate && <span className="text-offer"> · already imported</span>}
                  {l.suggestion && <span> · {l.suggestion.reason === "rule" ? "rule" : "learned from history"}</span>}
                </p>
              </div>
              <Select aria-label="Category" value={c.target} onChange={(e) => update(i, { target: e.target.value })} className="h-10">
                <option value="">Uncategorised</option>
                <optgroup label={l.kind === "expense" ? "Expense" : "Income"}>
                  {options[l.kind].map(({ parent, children }) => [
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>,
                    ...children.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {`${parent.name} / ${ch.name}`}
                      </option>
                    )),
                  ])}
                </optgroup>
                <optgroup label={l.amount < 0 ? "Transfer to" : "Transfer from"}>
                  {accounts.map((a) => (
                    <option key={a.id} value={`transfer:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-muted">Card payments and moves between your own accounts belong under Transfer, so they are not counted as spending.</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={pending || !included} onClick={onCommit}>
          Import {included} transaction{included === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

/** Layouts learned from earlier imports. Statements in these layouts skip column matching. */
function SavedFormats({ formats, accounts }: { formats: ImportFormatSummary[]; accounts: AccountView[] }) {
  const { isAdmin } = useApp();
  const { pending, run } = useAction();
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <section>
      <h2 className="mb-1 text-[15px] font-semibold">Saved formats</h2>
      <p className="mb-3 text-sm text-muted">Statements in these layouts are recognised and skip column matching. New layouts are saved after their first import.</p>
      <Card className="divide-y divide-border">
        {formats.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-muted">
                Used {f.useCount} time{f.useCount === 1 ? "" : "s"} · last {f.lastUsedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {f.accountId && name.get(f.accountId) ? ` · ${name.get(f.accountId)}` : ""}
              </p>
            </div>
            {isAdmin && (
              <>
                <IconButton
                  label={`Rename ${f.name}`}
                  disabled={pending}
                  onClick={() => {
                    const next = prompt("Name this format, e.g. the bank and account type", f.name);
                    if (next && next !== f.name) run(() => renameImportFormatAction(f.id, next), { success: "Format renamed" });
                  }}
                >
                  <Pencil size={15} />
                </IconButton>
                <IconButton
                  label={`Forget ${f.name}`}
                  disabled={pending}
                  onClick={() => confirm(`Forget “${f.name}”? Its next statement will ask you to match columns again.`) && run(() => deleteImportFormatAction(f.id), { success: "Format forgotten" })}
                >
                  <Trash2 size={15} />
                </IconButton>
              </>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
