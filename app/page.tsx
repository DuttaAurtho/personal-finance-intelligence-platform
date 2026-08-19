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

const FEATURES = [
  {
    icon: "📥",
    title: "Import any bank CSV",
    body: "Drop in a statement from any bank. Fiscora sniffs the delimiter, works out which column is the date and which is the amount, and handles split debit/credit columns without being told.",
  },
  {
    icon: "🏷️",
    title: "Categorisation that learns",
    body: "A curated merchant lexicon labels your first import. After that a Naive Bayes classifier trains on every correction you make, so it learns your local coffee shop, not just the chains.",
  },
  {
    icon: "📊",
    title: "Monthly spending dashboard",
    body: "Where the money went, ranked and readable, with month-on-month movement called out. No hunting through a table to find the thing that changed.",
  },
  {
    icon: "⚖️",
    title: "Income vs expenses",
    body: "Cashflow and savings rate side by side, with internal transfers excluded so moving money into savings never gets counted as spending.",
  },
  {
    icon: "🎯",
    title: "Budget tracking",
    body: "Set a ceiling per category, or let Fiscora propose one from your own history. Straight-line projection warns you mid-month, while you can still do something about it.",
  },
  {
    icon: "🔁",
    title: "Recurring-payment detection",
    body: "Finds subscriptions by looking for rhythm in your payment history rather than matching a brand list — so it catches the gym and the window cleaner too, and flags price rises.",
  },
  {
    icon: "🔮",
    title: "Spending predictions",
    body: "Five forecasting models, weighted by how well each one predicted your own past months, with an honest 80% range instead of a single confident-looking number.",
  },
  {
    icon: "💡",
    title: "Financial insights",
    body: "Plain-English findings ranked by how much they matter — unusual charges, category drift, subscription creep, and the habits quietly costing you the most.",
  },
  {
    icon: "🔎",
    title: "Search and filter",
    body: "Full-text search across descriptions, merchants and notes, combined with date, amount, category and account filters. Export any view back out as CSV.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Export a CSV from your bank",
    body: "Every bank offers this — usually under 'statements' or 'download transactions'. No account linking, no third-party aggregator, no credentials to hand over.",
  },
  {
    n: "02",
    title: "Drop it in",
    body: "Fiscora maps the columns itself and shows you a preview before anything is saved. Re-importing an overlapping statement won't create duplicates.",
  },
  {
    n: "03",
    title: "Read what it found",
    body: "Categories, budgets, recurring payments, anomalies and next month's forecast — all computed on the spot from your own numbers.",
  },
];

const isRemoteDb = !!process.env.TURSO_DATABASE_URL;

export default async function LandingPage() {
  const user = await currentUser();
  if (user) redirect("/app");

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora" aria-hidden="true" />

      {/* ── Navigation ────────────────────────────────────────────── */}
      <header className="relative z-20 border-b border-line/60 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Fiscora home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <a href="#features" className="btn btn-ghost">Features</a>
            <a href="#how" className="btn btn-ghost">How it works</a>
            <a href="#intelligence" className="btn btn-ghost">The ML</a>
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
        <div className="grid-lines absolute inset-0 -z-10" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div className="stack-fade">
              <span className="chip border-line-strong bg-surface text-muted">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--viz-good)" }}
                  aria-hidden="true"
                />
                Free and open · {isRemoteDb ? "self-hosted, your own database" : "runs on your own machine"}
              </span>

              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.4rem]">
                Your bank tells you the <span className="text-brand">balance</span>.
                <br />
                Fiscora tells you the <span className="text-gradient">story</span>.
              </h1>

              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
                Import a CSV of your transactions and get a full picture back: automatic
                categorisation, budgets, the subscriptions you forgot about, and a machine-learned
                forecast of what next month will actually cost you.
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
                The demo loads two years of realistic sample data. No email required, nothing to
                cancel.
              </p>
            </div>

            {/* Product preview built from the real components */}
            <div className="relative">
              <div
                className="absolute -inset-6 -z-10 rounded-[2rem] opacity-60 blur-2xl"
                style={{
                  background:
                    "radial-gradient(60% 60% at 50% 30%, color-mix(in oklab, var(--brand) 22%, transparent), transparent)",
                }}
                aria-hidden="true"
              />

              <div className="card card-lift overflow-hidden">
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
      <section id="features" className="relative z-10 border-t border-line/60 bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">
              Everything a finance app should do, and nothing it shouldn&apos;t
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              No ads, no upsells, no selling your transaction history to anybody. Every feature
              below runs against a SQLite database you own
              {isRemoteDb ? ", hosted under your own account" : " on this machine"}.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card card-hover h-full px-5 py-5">
                <div
                  aria-hidden="true"
                  className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-3 text-lg"
                >
                  {f.icon}
                </div>
                <h3 className="text-[0.9375rem] font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section id="how" className="relative z-10 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold tracking-tight text-fg">Three steps</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <span className="text-sm font-semibold tabular-nums text-brand">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The ML ────────────────────────────────────────────────── */}
      <section
        id="intelligence"
        className="relative z-10 border-y border-line/60 bg-surface/40 py-20"
      >
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-fg">
                The intelligence part, explained honestly
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">
                &ldquo;AI-powered&rdquo; usually means an API call to somebody else&apos;s server
                with your bank statement attached. Fiscora&apos;s models are small, classical and
                run in-process in a few milliseconds — which is exactly why the product can be free
                and private at the same time.
              </p>

              <dl className="mt-8 space-y-5">
                <div>
                  <dt className="text-[0.9375rem] font-semibold text-fg">
                    Multinomial Naive Bayes · categorisation
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    Trained on the categories you confirm, using word tokens, character trigrams to
                    survive truncated bank descriptions, and weak priors on amount and day of month.
                    Every correction is a labelled example.
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.9375rem] font-semibold text-fg">
                    Interval regularity · recurring payments
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    Scores each merchant on how consistent the gaps between payments are and how
                    stable the amount is, using median absolute deviation so one late payment
                    doesn&apos;t hide a subscription.
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.9375rem] font-semibold text-fg">
                    Weighted ensemble · forecasting
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    Exponential smoothing, a robust median, a damped Holt trend, a seasonal
                    comparison and a ridge regression on lag features. Each is backtested on your
                    own history with an expanding window, then weighted by inverse error.
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.9375rem] font-semibold text-fg">
                    Robust z-scores · anomaly detection
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    Compares each charge against the distribution of that same category in your own
                    history, so &ldquo;unusually large&rdquo; means unusual for you rather than
                    unusual for some average customer.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-4">
              <div className="card px-5 py-5">
                <h3 className="text-sm font-semibold text-fg">Why an ensemble?</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  A trend model is excellent for someone whose costs are creeping up and misleading
                  for someone whose spending is flat but noisy. Rather than guessing which kind of
                  person you are, Fiscora runs all five, measures how each performed on your last
                  twelve months, and weights them accordingly. The blend is almost always better
                  than its best member — and it degrades gracefully when you&apos;ve only imported
                  three months.
                </p>
              </div>

              <div className="card px-5 py-5">
                <h3 className="text-sm font-semibold text-fg">Why a range, not a number?</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The prediction interval comes from the model&apos;s own backtest residuals, so it
                  widens automatically for people whose spending is genuinely erratic. A single
                  confident figure would be more satisfying and less true.
                </p>
              </div>

              <div className="card px-5 py-5">
                <h3 className="text-sm font-semibold text-fg">Where the accuracy is shown</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The forecast page reports the mean absolute percentage error the ensemble achieved
                  on your history, and the weight each model earned. If the models are doing badly
                  on your data, you get to see that.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────────── */}
      <section id="privacy" className="relative z-10 py-20">
        <div className="mx-auto max-w-4xl px-5 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-xl"
          >
            🔒
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-fg">
            {isRemoteDb ? "Your data stays in a database only you control" : "Your statements never leave your machine"}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
            {isRemoteDb ? (
              <>
                Fiscora stores everything in a SQLite database you host yourself, reachable only
                with your own access token. There is no analytics script, no telemetry and no
                third-party service in the loop — every calculation runs on this server, not a
                hosted API. Delete the database and the data is genuinely gone.
              </>
            ) : (
              <>
                Fiscora stores everything in a single SQLite file in the project&apos;s{" "}
                <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[0.8125rem]">
                  data/
                </code>{" "}
                directory. There is no analytics script, no telemetry, no external API call and no
                hosted backend. Delete the file and the data is genuinely gone.
              </>
            )}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <form action={startDemo}>
              <button type="submit" className="btn btn-primary h-11 px-6 text-[0.9375rem]">
                Try it with sample data
              </button>
            </form>
            <Link href="/register" className="btn btn-secondary h-11 px-6 text-[0.9375rem]">
              Start with my own CSV
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-line/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <Logo size={22} />
          <p className="text-sm text-subtle">
            Personal Finance Intelligence Platform · built with Next.js and SQLite
          </p>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost">Sign in</Link>
            <ThemeToggle compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
