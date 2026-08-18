import Link from "next/link";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { CurrentSection, MobileNav, SidebarLinks } from "@/components/AppNav";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { ensureUserSetup } from "@/lib/repository";
import { countTransactions } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Safe to call on every request: it's idempotent and cheap, and it means a
  // user created before a schema addition still gets their defaults.
  ensureUserSetup(user.id);

  const txCount = countTransactions(user.id);

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── Sidebar (desktop) ──────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link href="/app" className="mb-6 px-2" aria-label="Fiscora dashboard">
          <Logo />
        </Link>

        <SidebarLinks />

        <div className="mt-auto space-y-3 px-1 pt-4">
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-3">
            <p className="text-xs font-medium text-muted">Transactions stored</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-fg">
              {txCount.toLocaleString("en-GB")}
            </p>
            <Link
              href="/app/import"
              className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline"
            >
              Import more →
            </Link>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl px-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{user.name}</p>
              <p className="truncate text-xs text-subtle">{user.email}</p>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost h-8 !px-2 text-xs" title="Sign out">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-[var(--overlay)] px-4 backdrop-blur-md lg:pl-64">
        <div className="flex items-center gap-2">
          <MobileNav />
          <span className="lg:hidden">
            <Logo size={24} withWordmark={false} />
          </span>
          <CurrentSection />
        </div>

        <div className="flex items-center gap-1.5">
          <Link href="/app/import" className="btn btn-secondary h-9">
            <span aria-hidden="true">↓</span>
            <span className="hidden sm:inline">Import CSV</span>
          </Link>
          <ThemeToggle compact />
          <form action={signOut} className="lg:hidden">
            <button type="submit" className="btn btn-ghost h-9 !px-2 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────── */}
      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
