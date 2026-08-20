"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  description: string;
}

export const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "◧", description: "This month at a glance" },
  { href: "/app/transactions", label: "Transactions", icon: "≡", description: "Search and filter everything" },
  { href: "/app/budgets", label: "Budgets", icon: "◎", description: "Ceilings by category" },
  { href: "/app/recurring", label: "Recurring", icon: "↻", description: "Subscriptions and standing costs" },
  { href: "/app/forecast", label: "Forecast", icon: "◈", description: "What next month will cost" },
  { href: "/app/insights", label: "Insights", icon: "✦", description: "What the numbers mean" },
  { href: "/app/import", label: "Import", icon: "↓", description: "Add a bank CSV" },
  { href: "/app/settings", label: "Settings", icon: "⚙", description: "Categories, rules, data" },
];

function isActive(pathname: string, href: string): boolean {
  // Dashboard is only active on an exact match, otherwise it lights up everywhere.
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-brand-soft font-semibold text-brand"
                : "font-medium text-muted hover:bg-surface-3 hover:text-fg"
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-4 text-center text-base leading-none ${active ? "text-brand" : "text-subtle group-hover:text-fg"}`}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile drawer trigger + panel. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes it, and body scroll is locked while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost h-9 w-9 !px-0 lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="text-lg leading-none">≡</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            tabIndex={-1}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-surface px-3 py-4 shadow-2xl">
            <div className="mb-5 flex items-center justify-between px-2">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost h-8 w-8 !px-0"
                aria-label="Close navigation"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <SidebarLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** Shows the current section's name in the mobile top bar. */
export function CurrentSection() {
  const pathname = usePathname();
  const item = [...NAV].reverse().find((n) => isActive(pathname, n.href));
  return <span className="text-sm font-semibold text-fg lg:hidden">{item?.label ?? "Dashboard"}</span>;
}
