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
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <svg
              width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M6.5 10.5V8a5.5 5.5 0 1 1 11 0v2.5M5 10.5h14V20H5v-9.5ZM12 14v2.5" />
            </svg>
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
      <footer className="relative z-10 border-t border-line/60 pt-14 pb-10">
        <div className="mx-auto max-w-5xl px-5">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <Logo size={26} />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                Import a CSV or log what you spend as you go. It categorises the lot, finds the
                subscriptions you forgot, and shows you where the money actually went.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Product
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><a href="#features" className="text-muted hover:text-fg">Features</a></li>
                  <li><a href="#how" className="text-muted hover:text-fg">How it works</a></li>
                  <li><a href="#privacy" className="text-muted hover:text-fg">Privacy</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Get started
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><Link href="/register" className="text-muted hover:text-fg">Create an account</Link></li>
                  <li><Link href="/login" className="text-muted hover:text-fg">Sign in</Link></li>
                  <li>
                    <a href="/api/sample" className="text-muted hover:text-fg">Sample statement</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 rounded-[var(--radius)] border border-line bg-surface-2/60 px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">
              About your data
            </h3>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              {isRemoteDb
                ? "Your transactions live in a SQLite database reachable only with your own access token. There is no analytics script, no telemetry and no third party in the loop — the categorisation and forecasting run on this server, not in an external API."
                : "Your transactions live in a single SQLite file on this machine. There is no analytics script, no telemetry and no external API call anywhere in the app — the categorisation and forecasting run in-process."}{" "}
              Everything you import can be exported straight back out as CSV.
            </p>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-line/60 pt-6 sm:flex-row sm:items-center">
            <p className="text-sm text-subtle">
              © {new Date().getFullYear()} Personal Finance Intelligence Platform. Built as a
              personal project.
            </p>
            <p className="text-sm text-subtle">
              Made by <span className="font-medium text-muted">Aurtho Dutta</span> ·{" "}
              <a
                href="mailto:dutta.aurtho@gmail.com"
                className="font-medium text-brand hover:underline"
              >
                dutta.aurtho@gmail.com
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
