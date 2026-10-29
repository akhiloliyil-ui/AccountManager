"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { clsx } from "clsx";
import { ChartPie, FileSpreadsheet, House, Landmark, NotebookText, Plus, Settings, ShoppingBasket } from "lucide-react";
import { useShellUser } from "./providers";

const tabs = [
  { href: "/", label: "Home", icon: House, match: ["/"] },
  { href: "/transactions", label: "Trans.", icon: NotebookText, match: ["/transactions"] },
  { href: "/stats", label: "Stats", icon: ChartPie, match: ["/stats"] },
  { href: "/accounts", label: "Accounts", icon: Landmark, match: ["/accounts", "/debts"] },
  { href: "/lists", label: "Grocery", icon: ShoppingBasket, match: ["/lists", "/offers", "/compare", "/budget", "/products"] },
] as const;

const isActive = (pathname: string | null, match: readonly string[]) =>
  pathname !== null && match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));

const groceryPaths = tabs[4].match;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[991px] items-center gap-6 px-4 md:h-16">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-on-primary">
              <ShoppingBasket size={18} strokeWidth={2.25} />
            </span>
            <span className="text-[17px]">GPA</span>
          </Link>

          <Suspense fallback={<TopNav pathname={null} />}>
            <ActiveTopNav />
          </Suspense>

          <div className="ml-auto flex items-center gap-2">
            <ImportLink />
            <Link
              href="/settings"
              aria-label="Settings"
              className="grid size-9 place-items-center rounded-xl border border-border bg-surface hover:bg-surface-2"
            >
              <Settings size={17} />
            </Link>
          </div>
        </div>
      </header>

      <main className="pb-tabbar mx-auto w-full max-w-[991px] px-4 pt-5 md:pt-8">{children}</main>

      <Suspense fallback={<TabBar pathname={null} />}>
        <ActiveTabBar />
        <QuickAdd />
      </Suspense>
    </div>
  );
}

function ActiveTopNav() {
  return <TopNav pathname={usePathname()} />;
}

function ActiveTabBar() {
  return <TabBar pathname={usePathname()} />;
}

function TopNav({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
      {tabs.map(({ href, label, match }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, match) ? "page" : undefined}
          className={clsx(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(pathname, match) ? "bg-surface-2 text-text" : "text-muted hover:text-text",
          )}
        >
          {label === "Trans." ? "Transactions" : label}
        </Link>
      ))}
    </nav>
  );
}

function TabBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-16 max-w-[991px] grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(pathname, match);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary-strong" : "text-muted",
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Statement import is for people who can change accounts. */
function ImportLink() {
  const user = useShellUser();
  if (!user || user.role === "read") return null;
  return (
    <Link
      href="/import"
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
    >
      <FileSpreadsheet size={16} />
      <span className="hidden sm:inline">Import</span>
    </Link>
  );
}

/** Mobile floating "+": a new transaction on money screens, this week's list on grocery screens. */
function QuickAdd() {
  const pathname = usePathname();
  const user = useShellUser();
  const hidden = ["/transactions/", "/lists/", "/offers/import", "/import", "/settings"].some((p) => pathname.startsWith(p));
  if (hidden || !user || user.role === "read") return null;
  const grocery = isActive(pathname, groceryPaths);

  return (
    <Link
      href={grocery ? "/lists/current" : "/transactions/new"}
      aria-label={grocery ? "Quick add to this week's list" : "Add transaction"}
      className={clsx(
        "fixed right-4 z-30 grid size-14 place-items-center rounded-2xl text-white md:hidden",
        grocery ? "bg-primary shadow-[0_8px_24px_rgba(18,161,80,0.35)]" : "bg-expense shadow-[0_8px_24px_rgba(224,83,61,0.35)]",
      )}
      style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
    >
      <Plus size={24} strokeWidth={2.5} />
    </Link>
  );
}
