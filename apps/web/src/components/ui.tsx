"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { formatCurrency, type Fils } from "@gpa/core";
import { useApp } from "./providers";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-2xl border border-border bg-surface", className)} {...props} />;
}

export function SectionTitle({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
      <ChevronLeft size={16} /> {children}
    </Link>
  );
}

const buttonStyles = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  secondary: "border border-border bg-surface text-text hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "border border-border bg-surface text-danger hover:bg-danger-soft",
  income: "bg-income text-white hover:opacity-90",
  expense: "bg-expense text-white hover:opacity-90",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={clsx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={clsx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function IconButton({ label, className, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx("grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40", className)}
      {...props}
    />
  );
}

/** Grocery money: AED fils. */
export function Money({ fils, className }: { fils: Fils; className?: string }) {
  return <Amount minor={fils} currency="AED" className={className} />;
}

/** Any currency, in minor units. `tone` colours income blue and expense red as in the ledger. */
export function Amount({
  minor,
  currency,
  tone = "none",
  signed = false,
  className,
}: {
  minor: number;
  currency: string;
  tone?: "income" | "expense" | "auto" | "none";
  signed?: boolean;
  className?: string;
}) {
  const { currency: lookup } = useApp();
  const resolved = tone === "auto" ? (minor < 0 ? "expense" : minor > 0 ? "income" : "none") : tone;
  return (
    <span
      className={clsx(
        "tabular whitespace-nowrap",
        resolved === "income" && "text-income",
        resolved === "expense" && "text-expense",
        className,
      )}
    >
      {formatCurrency(minor, lookup(currency), { useSymbol: true, signed })}
    </span>
  );
}

export function StoreDot({ storeId, className }: { storeId: string; className?: string }) {
  const { storeById } = useApp();
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: storeById.get(storeId)?.color ?? "var(--muted)" }}
    />
  );
}

export function StoreName({ storeId, className }: { storeId: string; className?: string }) {
  const { storeById } = useApp();
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <StoreDot storeId={storeId} />
      {storeById.get(storeId)?.name ?? storeId}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; tone?: "income" | "expense" }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={clsx("inline-flex rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "h-9 flex-1 rounded-lg px-4 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted hover:text-text",
              active && (o.tone === "income" ? "text-income" : o.tone === "expense" ? "text-expense" : "text-text"),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Tone = "neutral" | "primary" | "offer" | "danger" | "income" | "expense";

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-surface-2 text-muted",
    primary: "bg-primary-soft text-primary-strong",
    offer: "bg-offer-soft text-offer",
    danger: "bg-danger-soft text-danger",
    income: "bg-income-soft text-income",
    expense: "bg-expense-soft text-expense",
  };
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Budget ring: spent arc on top of the projected arc. */
export function BudgetRing({
  spent,
  projected,
  budget,
  size = 148,
  status,
  children,
}: {
  spent: number;
  projected: number;
  budget: number;
  size?: number;
  status: "ok" | "warning" | "over";
  children?: ReactNode;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = (v: number) => Math.max(0, Math.min(1, budget ? v / budget : 0));
  const color = status === "over" ? "var(--danger)" : status === "warning" ? "var(--offer)" : "var(--primary)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac(projected) * c} ${c}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac(spent) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function QtyStepper({
  value,
  step = 1,
  unit,
  onChange,
  disabled,
}: {
  value: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-xl border border-border bg-surface">
      <button
        aria-label="Decrease quantity"
        disabled={disabled}
        onClick={() => onChange(value - step)}
        className="grid size-9 place-items-center text-muted hover:text-text disabled:opacity-40"
      >
        <Minus size={16} />
      </button>
      <span className="tabular min-w-10 text-center text-sm font-medium">
        {value}
        {unit && <span className="text-muted"> {unit}</span>}
      </span>
      <button
        aria-label="Increase quantity"
        disabled={disabled}
        onClick={() => onChange(value + step)}
        className="grid size-9 place-items-center text-muted hover:text-text disabled:opacity-40"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-strong">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ forms */

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-primary disabled:opacity-60";

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(inputClass, "pr-8", className)} {...props} />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-border")}
    >
      <span className={clsx("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** Modal panel: a bottom sheet on phones, a centred dialog on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-text backdrop:bg-black/40 md:m-auto md:rounded-3xl",
        wide ? "md:max-w-2xl" : "md:max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 className="font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

export function MonthNav({ label, prevHref, nextHref }: { label: ReactNode; prevHref: string; nextHref: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={prevHref} aria-label="Previous" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
        <ChevronLeft size={20} />
      </Link>
      <span className="min-w-28 text-center text-[15px] font-semibold">{label}</span>
      <Link href={nextHref} aria-label="Next" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
        <ChevronRight size={20} />
      </Link>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-surface-2" />
      <div className="h-40 rounded-2xl bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface-2" />
    </div>
  );
}
