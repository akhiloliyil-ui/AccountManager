"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronRight, ExternalLink, FileText, FileUp, Plus, Trash2, Upload } from "lucide-react";
import { aedToFils, type Promo } from "@gpa/core";
import {
  addPdfLineAction,
  discardPdfImportAction,
  publishPdfImportAction,
  updatePdfImportAction,
  updatePdfLineAction,
  uploadPromotionPdf,
} from "@/app/actions/imports";
import { describePromo } from "@/lib/grocery";
import type { PdfImportRow, PdfLineRow } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { useApp } from "../providers";
import { BackLink, Badge, Button, Card, EmptyState, Field, Input, Money, PageHeader, Select } from "../ui";

type ImportSummary = PdfImportRow & { lineCount: number };

const statusTone = { review: "offer", published: "primary", discarded: "neutral" } as const;

export function PdfUploadScreen({ imports }: { imports: ImportSummary[] }) {
  const router = useRouter();
  const { catalog, today } = useApp();
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [validTo, setValidTo] = useState("");

  const pick = (f: File | undefined) => {
    if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) setFile(f);
  };

  const upload = () => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("storeId", storeId);
    form.set("validTo", validTo);
    run(() => uploadPromotionPdf(form), { onDone: ({ id }) => router.push(`/offers/import/${id}`) });
  };

  return (
    <div className="space-y-6">
      <BackLink href="/offers">Offers</BackLink>
      <PageHeader title="Upload a promotion PDF" subtitle="GPA reads the flyer's text and proposes offers. Nothing goes live until you review it." />

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={clsx("flex flex-col items-center border-2 border-dashed px-6 py-10 text-center transition-colors", dragging ? "border-primary bg-primary-soft/50" : "border-border")}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Upload size={22} />
        </span>
        <p className="mt-3 font-semibold">{file ? file.name : "Drop a flyer PDF here"}</p>
        <p className="mt-1 text-sm text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Saved from WhatsApp, email or a supermarket website. Up to 15 MB."}</p>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          onClick={() => input.current?.click()}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
        >
          <FileUp size={16} /> {file ? "Choose another" : "Choose PDF"}
        </button>

        {file && (
          <div className="mt-6 grid w-full max-w-lg gap-3 text-left sm:grid-cols-2">
            <Field label="Store" hint="Leave on auto to detect it from the flyer.">
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Detect automatically</option>
                {catalog.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Offers valid until">
              <Input type="date" min={today} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </Field>
            <Button className="sm:col-span-2" disabled={pending} onClick={upload}>
              {pending ? "Reading PDF…" : "Upload and review"}
            </Button>
          </div>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Recent uploads</h2>
        {imports.length ? (
          <Card className="divide-y divide-border">
            {imports.map((imp) => (
              <Link key={imp.id} href={`/offers/import/${imp.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <FileText size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{imp.filename}</p>
                  <p className="text-xs text-muted">
                    {imp.storeId ? (catalog.stores.find((s) => s.id === imp.storeId)?.name ?? imp.storeId) : "Store not set"} · {imp.lineCount} lines ·{" "}
                    {imp.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <Badge tone={statusTone[imp.status]}>{imp.status}</Badge>
                <ChevronRight size={16} className="text-muted" />
              </Link>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-muted">No PDFs uploaded yet.</p>
        )}
      </section>
    </div>
  );
}

const PROMO_TYPES: { value: Promo["type"] | "none"; label: string }[] = [
  { value: "none", label: "Shelf price only" },
  { value: "price_cut", label: "Price cut" },
  { value: "percent_off", label: "% off" },
  { value: "multi_buy", label: "Multi-buy" },
  { value: "bogo", label: "Buy 1 get 1" },
];

export function PdfReviewScreen({ imp, lines }: { imp: PdfImportRow; lines: PdfLineRow[] }) {
  const router = useRouter();
  const { catalog, productById } = useApp();
  const { pending, run } = useAction();
  const locked = imp.status !== "review";
  const ready = lines.filter((l) => l.include && l.productId).length;

  return (
    <div className="space-y-6">
      <BackLink href="/offers/import">Uploads</BackLink>
      <PageHeader
        title="Review offers"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {imp.filename} · {imp.pageCount} page{imp.pageCount === 1 ? "" : "s"}
            <Badge tone={statusTone[imp.status]}>{imp.status}</Badge>
            {imp.status !== "discarded" && (
              <a href={`/offers/import/${imp.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-strong">
                Open PDF <ExternalLink size={12} />
              </a>
            )}
          </span>
        }
      />

      {imp.textLength < 40 && (
        <Card className="border-offer/40 bg-offer-soft p-4 text-sm">
          This PDF has little or no selectable text, which usually means the flyer is made of images. Add its offers by hand below.
        </Card>
      )}

      <Card className="grid gap-3 p-4 sm:grid-cols-3 sm:items-end">
        <Field label="Store">
          <Select disabled={locked || pending} value={imp.storeId ?? ""} onChange={(e) => run(() => updatePdfImportAction(imp.id, { storeId: e.target.value || null }))}>
            <option value="">Choose store</option>
            {catalog.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Offers valid until">
          <Input
            type="date"
            disabled={locked || pending}
            defaultValue={imp.validTo ?? ""}
            onBlur={(e) => e.target.value !== (imp.validTo ?? "") && run(() => updatePdfImportAction(imp.id, { validTo: e.target.value || null }))}
          />
        </Field>
        {!locked && (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending || !ready} onClick={() => run(() => publishPdfImportAction(imp.id), { success: "Offers published", onDone: () => router.push("/offers") })}>
              Publish {ready} offer{ready === 1 ? "" : "s"}
            </Button>
            <Button
              variant="danger"
              aria-label="Discard upload"
              className="px-3"
              disabled={pending}
              onClick={() => confirm("Discard this upload? Its file is deleted.") && run(() => discardPdfImportAction(imp.id), { onDone: () => router.push("/offers/import") })}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        )}
      </Card>

      {lines.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="No priced lines found" body="Add the flyer's offers by hand below." />
      ) : (
        <div className="space-y-3">
          {lines.map((l) => (
            <LineEditor key={`${l.id}-${l.productId}-${l.priceFils}-${l.regularFils}-${l.include}-${JSON.stringify(l.promo)}`} line={l} locked={locked} />
          ))}
        </div>
      )}

      {!locked && <AddLine importId={imp.id} />}

      {imp.status === "published" && (
        <p className="text-sm text-muted">
          Published lines now price your lists and comparisons{imp.validTo ? ` until ${imp.validTo}` : ""}.{" "}
          {lines
            .filter((l) => l.include && l.productId)
            .slice(0, 3)
            .map((l) => productById.get(l.productId!)?.name)
            .join(", ")}
          …
        </p>
      )}
    </div>
  );
}

function LineEditor({ line, locked }: { line: PdfLineRow; locked: boolean }) {
  const { catalog } = useApp();
  const { pending, run } = useAction();
  const [price, setPrice] = useState((line.priceFils / 100).toFixed(2));
  const [regular, setRegular] = useState(line.regularFils ? (line.regularFils / 100).toFixed(2) : "");
  const promoType = line.promo?.type ?? "none";
  const save = (patch: Parameters<typeof updatePdfLineAction>[1]) => run(() => updatePdfLineAction(line.id, patch));

  const setPromo = (type: Promo["type"] | "none") => {
    const priceFils = aedToFils(Number(price) || 0);
    const promo: Promo | null =
      type === "none"
        ? null
        : type === "price_cut"
          ? { type, priceFils }
          : type === "percent_off"
            ? { type, percent: line.promo?.type === "percent_off" ? line.promo.percent : 10 }
            : type === "multi_buy"
              ? { type, qty: line.promo?.type === "multi_buy" ? line.promo.qty : 2, priceFils: priceFils * 2 }
              : { type };
    save({ promo });
  };

  return (
    <Card className={clsx("p-4", !line.include && "opacity-70")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label="Include this line"
          checked={line.include}
          disabled={locked || pending}
          onChange={(e) => save({ include: e.target.checked })}
          className="mt-1 size-5 accent-[var(--primary)]"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">{line.name}</p>
            <p className="truncate font-mono text-xs text-muted" title={line.rawText}>
              line {line.line}: {line.rawText}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.3fr]">
            <Select
              aria-label="Catalogue product"
              disabled={locked || pending}
              value={line.productId ?? ""}
              onChange={(e) => save({ productId: e.target.value || null, include: !!e.target.value })}
            >
              <option value="">Not matched — choose product</option>
              {catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.brand ? ` · ${p.brand}` : ""}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Offer price AED"
              inputMode="decimal"
              disabled={locked || pending}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => {
                const fils = aedToFils(Number(price) || 0);
                if (fils > 0 && fils !== line.priceFils)
                  save({ priceFils: fils, promo: line.promo?.type === "price_cut" ? { type: "price_cut", priceFils: fils } : undefined });
              }}
            />
            <Input
              aria-label="Regular price AED"
              placeholder="Was"
              inputMode="decimal"
              disabled={locked || pending}
              value={regular}
              onChange={(e) => setRegular(e.target.value)}
              onBlur={() => {
                const fils = regular.trim() ? aedToFils(Number(regular) || 0) : null;
                if (fils !== line.regularFils) save({ regularFils: fils });
              }}
            />
            <Select aria-label="Promotion" disabled={locked || pending} value={promoType} onChange={(e) => setPromo(e.target.value as Promo["type"] | "none")}>
              {PROMO_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted">
            {line.promo ? describePromo(line.promo) : "Updates the shelf price"}
            {line.regularFils ? (
              <>
                {" "}
                · was <Money fils={line.regularFils} />
              </>
            ) : null}
            {line.matchScore != null && line.productId && ` · matched ${Math.round(Math.min(1, line.matchScore) * 100)}%`}
          </p>
        </div>
      </div>
    </Card>
  );
}

function AddLine({ importId }: { importId: string }) {
  const { catalog } = useApp();
  const { pending, run } = useAction();
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [regular, setRegular] = useState("");

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <Plus size={16} /> Add an offer by hand
      </p>
      <form
        className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const priceFils = aedToFils(Number(price) || 0);
          const regularFils = regular ? aedToFils(Number(regular) || 0) : null;
          if (!productId || priceFils <= 0) return;
          run(
            () =>
              addPdfLineAction(importId, {
                productId,
                priceFils,
                regularFils,
                promo: regularFils && regularFils > priceFils ? { type: "price_cut", priceFils } : null,
              }),
            {
              onDone: () => {
                setProductId("");
                setPrice("");
                setRegular("");
              },
            },
          );
        }}
      >
        <Select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Product</option>
          {catalog.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input aria-label="Offer price" placeholder="Offer AED" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input aria-label="Was price" placeholder="Was AED" inputMode="decimal" value={regular} onChange={(e) => setRegular(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={pending}>
          Add
        </Button>
      </form>
    </Card>
  );
}
