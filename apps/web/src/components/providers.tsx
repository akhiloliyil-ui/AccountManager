"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import type { Currency, Product } from "@gpa/core";
import type { Catalog, CategoryRow, CurrencyRow, Settings } from "@/lib/types";

export interface AppData {
  today: string;
  currencies: CurrencyRow[];
  catalog: Catalog;
  categories: CategoryRow[];
  settings: Pick<Settings, "groceryBudgetFils" | "preferredStoreIds" | "groceryCategoryId" | "defaultAccountId">;
  /** The signed-in person. The server enforces every permission; the UI only hides what they can't use. */
  user: { displayName: string; username: string; role: "admin" | "write" | "read"; isOwner: boolean };
}

interface AppContext extends AppData {
  base: Currency;
  currency: (code: string) => Currency;
  productById: Map<string, Product>;
  storeById: Map<string, Catalog["stores"][number]>;
  categoryById: Map<string, CategoryRow>;
  groceryCategoryById: Map<string, Catalog["categories"][number]>;
  searchProducts: (query: string) => Product[];
  canWrite: boolean;
  isAdmin: boolean;
}

const Ctx = createContext<AppContext | null>(null);

/* The header and the floating + sit outside the data provider (so they show before data loads); they read the
   signed-in person's role from here. null until known, and the shell hides write controls until then. */
let shellUser: AppData["user"] | null = null;
const shellListeners = new Set<() => void>();
export function useShellUser() {
  return useSyncExternalStore(
    (l) => (shellListeners.add(l), () => shellListeners.delete(l)),
    () => shellUser,
    () => null,
  );
}

export function AppDataProvider({ value, children }: { value: AppData; children: ReactNode }) {
  const ctx = useMemo<AppContext>(() => {
    const byCode = new Map(value.currencies.map((c) => [c.code, c as Currency]));
    const base = value.currencies.find((c) => c.isBase) ?? value.currencies[0]!;
    return {
      ...value,
      base,
      canWrite: value.user.role !== "read",
      isAdmin: value.user.role === "admin",
      currency: (code) => byCode.get(code) ?? { code, name: code, symbol: code, decimals: 2, perBase: 1 },
      productById: new Map(value.catalog.products.map((p) => [p.id, p])),
      storeById: new Map(value.catalog.stores.map((s) => [s.id, s])),
      categoryById: new Map(value.categories.map((c) => [c.id, c])),
      groceryCategoryById: new Map(value.catalog.categories.map((c) => [c.id, c])),
      searchProducts: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return value.catalog.products.filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
      },
    };
  }, [value]);
  useEffect(() => {
    shellUser = value.user;
    shellListeners.forEach((l) => l());
  }, [value.user]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp needs <AppDataProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ toasts */

interface Toast {
  id: number;
  tone: "ok" | "error";
  text: string;
}

const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-text px-4 py-3 text-sm text-bg shadow-lg"
          >
            {t.tone === "error" ? (
              <TriangleAlert size={18} className="mt-px shrink-0 text-danger" />
            ) : (
              <CheckCircle2 size={18} className="mt-px shrink-0 text-primary" />
            )}
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="opacity-60 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
