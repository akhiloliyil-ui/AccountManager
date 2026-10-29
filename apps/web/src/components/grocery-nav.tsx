"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const links = [
  { href: "/lists", label: "Lists" },
  { href: "/offers", label: "Offers" },
  { href: "/compare", label: "Compare" },
  { href: "/budget", label: "Budget" },
];

/** Second-level navigation inside the Grocery tab. */
export function GroceryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Grocery" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium",
              active ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
