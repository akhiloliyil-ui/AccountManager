"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DatabaseBackup, Download, TriangleAlert, Upload } from "lucide-react";
import { restoreBackupAction } from "@/app/actions/auth";
import { useAction } from "@/lib/use-action";
import { BackLink, Button, ButtonLink, Card, PageHeader } from "../ui";

interface Summary {
  exportedAt: string;
  counts: Record<string, number>;
}

const SHOWN: [string, string][] = [
  ["transactions", "Transactions"],
  ["accounts", "Accounts"],
  ["users", "People"],
  ["budgets", "Budgets"],
  ["grocery_lists", "Grocery lists"],
  ["products", "Products"],
];

/** Reads the backup in the browser to show what's in it before anything is replaced. */
async function readSummary(file: File): Promise<Summary> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const text = gz ? await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text() : await file.text();
  const data = JSON.parse(text) as { format?: string; exportedAt?: string; tables?: Record<string, unknown[]> };
  if (data.format !== "gpa-backup" || !data.tables) throw new Error("not a backup");
  return { exportedAt: data.exportedAt ?? "", counts: Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])) };
}

export function BackupSettings({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (f: File | undefined) => {
    setFile(f ?? null);
    setSummary(null);
    setError(null);
    if (!f) return;
    try {
      setSummary(await readSummary(f));
    } catch {
      setError("This file isn't a GPA backup. Choose a file named like gpa-backup-2026-10-29.json.gz.");
    }
  };

  const restore = () => {
    if (!file || !summary) return;
    if (!confirm(`Replace ALL current data with this backup from ${new Date(summary.exportedAt).toLocaleString("en-GB")}? This can't be undone.`)) return;
    const form = new FormData();
    form.set("file", file);
    run(() => restoreBackupAction(form), {
      success: "Backup restored. Everyone, including you, signs in again.",
      onDone: () => router.replace("/login"),
    });
  };

  return (
    <div className="space-y-4">
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader title="Backup & restore" subtitle="One file with all your accounts, transactions, budgets, people and grocery data." />

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong">
            <DatabaseBackup size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Download a backup</p>
            <p className="text-sm text-muted">
              A compressed file (.json.gz) of everything. Keep it somewhere safe, such as your own cloud drive: it includes people&apos;s scrambled
              passwords. Flyer PDF files are left out to keep it small; the offers you reviewed are kept.
            </p>
            <ButtonLink href="/api/backup" prefetch={false} className="mt-3" download>
              <Download size={16} /> Download backup
            </ButtonLink>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <Upload size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Restore from a backup</p>
            {isOwner ? (
              <>
                <p className="text-sm text-muted">Replaces everything in GPA with the backup&apos;s data. If anything goes wrong part-way, nothing changes.</p>
                <label className="mt-3 block">
                  <span className="sr-only">Backup file</span>
                  <input
                    type="file"
                    accept=".gz,.json,application/gzip,application/json"
                    onChange={(e) => choose(e.target.files?.[0])}
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium"
                  />
                </label>
                {error && (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                  </p>
                )}
                {summary && (
                  <div className="mt-4 rounded-xl border border-border p-3">
                    <p className="text-sm">
                      Backup from <b>{new Date(summary.exportedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b>
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      {SHOWN.map(([key, label]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-muted">{label}</dt>
                          <dd className="tabular font-medium">{summary.counts[key] ?? 0}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 flex items-start gap-2 text-sm text-danger">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> Everything added since then will be lost, and everyone signs in again.
                    </p>
                    <Button variant="danger" className="mt-3" disabled={pending} onClick={restore}>
                      {pending ? "Restoring…" : "Restore this backup"}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Only the owner can restore a backup.</p>
            )}
          </div>
        </div>
      </Card>

      <p className="text-xs text-muted">
        Hosted on Neon? It also keeps its own short history of the database, which can be restored from Neon&apos;s dashboard. A downloaded backup is still
        the one you control.
      </p>
    </div>
  );
}
