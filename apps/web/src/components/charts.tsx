"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { formatCurrency, type Currency } from "@gpa/core";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];
export const OTHER = "var(--series-other)";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Donut with a 2px surface gap between segments; the centre shows the hovered slice or the total. */
export function Donut({ slices, currency, size = 200 }: { slices: Slice[]; currency: Currency; size?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  const hovered = slices.find((s) => s.key === active);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label="Share by category">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={24} />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const dash = `${Math.max(0, len - gap)} ${c}`;
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.key ? 30 : 24}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                className="cursor-pointer transition-[stroke-width]"
              >
                <title>{`${s.label}: ${formatCurrency(s.value, currency, { useSymbol: true })} (${((s.value / total) * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="line-clamp-1 text-xs text-muted">{hovered ? hovered.label : "Total"}</span>
        <span className="tabular text-base font-semibold">{formatCurrency(hovered?.value ?? total, currency, { useSymbol: true })}</span>
        {hovered && total > 0 && <span className="text-xs text-muted">{((hovered.value / total) * 100).toFixed(1)}%</span>}
      </div>
    </div>
  );
}

export interface BarGroup {
  key: string;
  label: string;
  values: { series: string; value: number }[];
}

/** Grouped bars on one axis, 4px rounded tops, hover tooltip per group. */
export function GroupedBars({
  groups,
  series,
  currency,
  height = 200,
  onSelect,
}: {
  groups: BarGroup[];
  series: { key: string; label: string; color: string }[];
  currency: Currency;
  height?: number;
  onSelect?: (key: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)));
  const hovered = groups.find((g) => g.key === active);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="ml-auto min-h-4 text-text">
          {hovered && (
            <>
              <span className="font-medium">{hovered.label}</span>
              {hovered.values.map((v) => (
                <span key={v.series} className="ml-3 tabular">
                  {series.find((s) => s.key === v.series)?.label} {formatCurrency(v.value, currency, { useSymbol: true })}
                </span>
              ))}
            </>
          )}
        </span>
      </div>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border/70" />
        <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-muted tabular">{formatCurrency(max, currency, { useSymbol: true })}</span>
        <div className="flex h-full items-end gap-1 sm:gap-2">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              onMouseEnter={() => setActive(g.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(g.key)}
              onBlur={() => setActive(null)}
              onClick={() => onSelect?.(g.key)}
              aria-label={`${g.label}: ${g.values.map((v) => `${series.find((s) => s.key === v.series)?.label} ${formatCurrency(v.value, currency)}`).join(", ")}`}
              className={clsx("flex h-full flex-1 items-end justify-center gap-[2px] rounded-t-md", active === g.key && "bg-surface-2")}
            >
              {g.values.map((v) => {
                const color = series.find((s) => s.key === v.series)?.color;
                return (
                  <span
                    key={v.series}
                    className="w-full max-w-4 rounded-t-[4px]"
                    style={{ height: `${(v.value / max) * 100}%`, minHeight: v.value ? 2 : 0, background: color }}
                  />
                );
              })}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-2">
        {groups.map((g) => (
          <span key={g.key} className="flex-1 truncate text-center text-[10px] text-muted">
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}
