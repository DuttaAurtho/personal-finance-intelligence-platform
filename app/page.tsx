import Link from "next/link";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import RankedBars from "@/components/charts/RankedBars";
import TrendChart from "@/components/charts/TrendChart";
import { currentUser } from "@/lib/auth";
import { startDemo } from "@/app/actions/auth";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

/* The worked example from the product brief, used as the hero preview. */
const EXAMPLE_CATEGORIES = [
  { label: "Rent & Mortgage", valueMinor: 65000, share: 0.4577 },
  { label: "Eating Out", valueMinor: 32000, share: 0.2254 },
  { label: "Shopping", valueMinor: 20000, share: 0.1408 },
  { label: "Transport", valueMinor: 15000, share: 0.1056 },
  { label: "Subscriptions", valueMinor: 10000, share: 0.0704 },
];

const EXAMPLE_TREND = [
  { month: "2025-10", valueMinor: 138500 },
  { month: "2025-11", valueMinor: 152000 },
  { month: "2025-12", valueMinor: 189000 },
  { month: "2026-01", valueMinor: 131000 },
  { month: "2026-02", valueMinor: 144500 },
  { month: "2026-03", valueMinor: 142000 },
];

/**
 * Six capabilities, one line each.
 *
 * An earlier version listed nine features with a full paragraph apiece, plus a
 * long essay on the models. Nobody reads a wall of text on a landing page —
 * it reads as noise and buries the two things that actually matter, which are
 * what the product does and the button that shows it doing it. The detail all
 * still exists inside the app, on the pages where it is relevant.
 */
const FEATURES = [
  { icon: "📥", title: "Import any bank CSV", body: "Columns detected automatically." },
  { icon: "🏷️", title: "Categorises itself", body: "And learns from your corrections." },
  { icon: "🔁", title: "Finds subscriptions", body: "Including the ones you forgot." },
  { icon: "🎯", title: "Budget tracking", body: "Warned mid-month, not after." },
  { icon: "🔮", title: "Forecasts next month", body: "With an honest range, not one number." },
  { icon: "🔎", title: "Search and export", body: "Your data leaves as easily as it arrived." },
];

const STEPS = [
  { n: "01", title: "Export a CSV from your bank", body: "No account linking, no credentials shared." },
  { n: "02", title: "Drop it in", body: "Preview it before anything is saved." },
  { n: "03", title: "Read what it found", body: "Categories, budgets, subscriptions, forecast." },
];

const isRemoteDb = !!process.env.TURSO_DATABASE_URL;

export default async function LandingPage() {
  const user = await currentUser();
  if (user) redirect("/app");

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ── Navigation ────────────────────────────────────────────── */}
      <header className="relative z-20 border-b border-line/60 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Personal Finance Intelligence Platform home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <a href="#features" className="btn btn-ghost">Features</a>
            <a href="#how" className="btn btn-ghost">How it works</a>
            <a href="#privacy" className="btn btn-ghost">Privacy</a>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link href="/login" className="btn btn-ghost">Sign in</Link>
            <Link href="/register" className="btn btn-primary">Get started</Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative z-10">
        <div className="mx-auto max-w-5xl px-5 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div className="stack-fade">
              <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.4rem]">
                Your bank tells you the <span className="text-brand">balance</span>.
                <br />
                This tells you the <span className="text-brand">story</span>.
              </h1>

              <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
                Import a CSV of your transactions and see exactly where the money goes — and what
                next month will cost.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <form action={startDemo}>
                  <button type="submit" className="btn btn-primary h-11 px-5 text-[0.9375rem]">
                    Explore the live demo
                    <span aria-hidden="true">→</span>
                  </button>
                </form>
                <Link href="/register" className="btn btn-secondary h-11 px-5 text-[0.9375rem]">
                  Create an account
                </Link>
              </div>

              <p className="mt-4 text-sm text-subtle">
                Two years of sample data. No email required.
              </p>
            </div>

            {/* Product preview built from the real components */}
            <div className="relative">
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <div>
                    <p className="text-xs font-medium text-muted">March 2026 spending</p>
                    <p className="text-2xl font-semibold tracking-tight text-fg">
                      {formatMoney(142000, "GBP")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted">Forecast · April</p>
                    <p className="text-lg font-semibold text-fg">{formatMoney(151000, "GBP")}</p>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <RankedBars items={EXAMPLE_CATEGORIES} currency="GBP" />
                </div>

                <div className="border-t border-line px-2 pb-2 pt-3">
                  <TrendChart
                    points={EXAMPLE_TREND}
                    forecast={{
                      month: "2026-04",
                      predictedMinor: 151000,
                      lowMinor: 132000,
                      highMinor: 170000,
                    }}
                    currency="GBP"
                    height={190}
                    label="Example six-month spending trend with an April forecast"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section id="features" className="relative z-10 border-t border-line/60 py-20">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Everything you need, nothing you don&apos;t
          </h2>

          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <span aria-hidden="true" className="text-xl">{f.icon}</span>
                <h3 className="mt-2.5 text-[0.9375rem] font-semibold text-fg">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section id="how" className="relative z-10 border-t border-line/60 py-20">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Three steps
          </h2>

          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="text-sm font-semibold tabular-nums text-brand">{s.n}</span>
                <h3 className="mt-2 text-[0.9375rem] font-semibold text-fg">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Privacy + closing call to action ──────────────────────── */}
      <section id="privacy" className="relative z-10 border-t border-line/60 py-24">
        <div className="mx-auto max-w-2xl px-5 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-xl"
          >
            🔒
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            {isRemoteDb ? "Your data, your database" : "Your statements never leave your machine"}
          </h2>

          <p className="mx-auto mt-4 text-base leading-relaxed text-muted">
            {isRemoteDb
              ? "Everything lives in a database only you can reach. No analytics, no telemetry, nothing sold on."
              : "Everything lives in a single SQLite file on this machine. No analytics, no telemetry, nothing sold on."}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <form action={startDemo}>
              <button type="submit" className="btn btn-primary h-11 px-6 text-[0.9375rem]">
                Explore the live demo
              </button>
            </form>
            <Link href="/register" className="btn btn-secondary h-11 px-6 text-[0.9375rem]">
              Create an account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-line/60 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <Logo size={22} />
          <div className="text-center text-sm text-subtle sm:text-left">
            <p className="font-medium text-muted">Built as a personal project</p>
            <p className="mt-1">
              Made by <span className="font-medium text-muted">Aurtho Dutta</span> ·{" "}
              <a
                href="mailto:dutta.aurtho@gmail.com"
                className="font-medium text-brand hover:underline"
              >
                dutta.aurtho@gmail.com
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost">Sign in</Link>
            <ThemeToggle compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
