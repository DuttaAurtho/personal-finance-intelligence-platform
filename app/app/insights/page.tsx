import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { availableMonths, getDashboard } from "@/lib/dashboard";
import { getCategoryTotals, getDateBounds, getKpis, getTopMerchants } from "@/lib/analytics";
import { addMonths, currentMonth, formatDate, formatMonth, monthStart, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import CategoryIcon from "@/components/CategoryIcon";
import ToneIcon from "@/components/ToneIcon";
import { merchantLabel } from "@/lib/categorize";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import ComparisonChart from "@/components/charts/ComparisonChart";
import RankedBars from "@/components/charts/RankedBars";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

/**
 * How far back the "over time" view looks.
 *
 * Whole calendar months rather than rolling 30-day windows: someone reviewing
 * where their money went thinks in months, and a rolling window would compare
 * a partial month against a full one and make the trend look like a drop.
 */
const RANGES = [
  { key: "1m", label: "This month", months: 1 },
  { key: "3m", label: "3 months", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "12 months", months: 12 },
  { key: "all", label: "All time", months: 0 },
] as const;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TONE_MAP = {
  positive: "positive",
  warning: "warning",
  critical: "critical",
  neutral: "neutral",
} as const;

const TONE_WORD = {
  positive: "Good news",
  warning: "Worth a look",
  critical: "Needs attention",
  neutral: "FYI",
} as const;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; range?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const months = await availableMonths(user.id);
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0] ?? currentMonth();

  const data = await getDashboard(user, month);
  const cur = user.currency;

  /* ── The "over time" view, independent of the month picker ────────── */
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[2];
  const bounds = await getDateBounds(user.id);
  const rangeTo = todayISO();
  const rangeFrom =
    range.months === 0
      ? (bounds?.min ?? monthStart(currentMonth()))
      : monthStart(addMonths(currentMonth(), -(range.months - 1)));

  const [rangeKpis, rangeCategories, rangeMerchants] = await Promise.all([
    getKpis(user.id, rangeFrom, rangeTo),
    getCategoryTotals(user.id, rangeFrom, rangeTo),
    getTopMerchants(user.id, rangeFrom, rangeTo, 8),
  ]);

  const monthsCovered =
    range.months === 0 && bounds
      ? Math.max(1, Math.round((Date.parse(rangeTo) - Date.parse(bounds.min)) / 2_629_800_000))
      : range.months;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insights" description="What the numbers actually mean." />
        <Card>
          <EmptyState
            title="Nothing to analyse yet"
            description="Import a statement and it will start finding patterns in it."
            action={
              <Link href="/app/import" className="btn btn-primary h-9">
                Import a CSV
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const weekdayItems = [...data.weekdays]
    .map((d) => ({
      label: DAY_NAMES[d.dow],
      valueMinor: d.totalMinor,
      count: d.count,
      share: d.totalMinor / Math.max(1, data.weekdays.reduce((a, x) => a + x.totalMinor, 0)),
    }))
    .sort((a, b) => b.valueMinor - a.valueMinor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Insights"
          description="Findings ranked by how much they matter, not by how easy they were to compute. Each one fires only when the change clears both a percentage and a cash threshold."
        />
        <MonthPicker months={months} value={month} />
      </div>

      {/* ── Where it went over time ────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Where your money goes over time"
          subtitle="Log what you spend as you go, then look back over a longer stretch to see the pattern"
          action={
            <div className="flex flex-wrap gap-1">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`/app/insights?range=${r.key}`}
                  scroll={false}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    r.key === range.key
                      ? "bg-brand text-brand-fg"
                      : "text-muted hover:bg-surface-3 hover:text-fg"
                  }`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          }
        />

        {rangeKpis.transactionCount === 0 ? (
          <EmptyState
            title="Nothing recorded in this period yet"
            description="Add what you spend as it happens, or import a statement. Once a few weeks have built up, this is where the pattern shows."
            action={
              <Link href="/app/transactions" className="btn btn-primary h-9">
                Add a transaction
              </Link>
            }
          />
        ) : (
          <div className="px-5 py-5">
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[0.8125rem] text-muted">Spent in this period</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">
                  {formatMoney(rangeKpis.spendMinor, cur)}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  {formatDate(rangeFrom)} — {formatDate(rangeTo)}
                </p>
              </div>
              <div>
                <p className="text-[0.8125rem] text-muted">Average per month</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">
                  {formatMoney(Math.round(rangeKpis.spendMinor / Math.max(1, monthsCovered)), cur)}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  across {monthsCovered} {monthsCovered === 1 ? "month" : "months"}
                </p>
              </div>
              <div>
                <p className="text-[0.8125rem] text-muted">Recorded</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">
                  {rangeKpis.transactionCount.toLocaleString("en-GB")}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  {formatMoney(rangeKpis.dailyAverageMinor, cur)} a day on average
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
                  By category
                </h3>
                <RankedBars
                  currency={cur}
                  items={rangeCategories.slice(0, 8).map((c) => ({
                    label: c.category,
                    valueMinor: c.totalMinor,
                    share: c.share,
                    count: c.count,
                    href: `/app/transactions?category=${encodeURIComponent(c.category)}`,
                  }))}
                />
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
                  By merchant
                </h3>
                {rangeMerchants.length ? (
                  <RankedBars
                    withIcons={false}
                    currency={cur}
                    items={rangeMerchants.map((m) => ({
                      label: merchantLabel(m.merchant),
                      valueMinor: m.total,
                      count: m.n,
                      share: m.total / Math.max(1, rangeKpis.spendMinor),
                      href: `/app/transactions?q=${encodeURIComponent(m.merchant)}`,
                    }))}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-subtle">No merchant data yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── The findings ───────────────────────────────────────────── */}
      {data.insights.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.insights.map((insight) => (
            <Card key={insight.id} hover className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3">
                  <ToneIcon tone={insight.tone} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[0.9375rem] font-semibold text-fg">{insight.title}</h3>
                    <Badge tone={TONE_MAP[insight.tone]}>{TONE_WORD[insight.tone]}</Badge>
                  </div>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                    {insight.detail}
                  </p>
                  {insight.href && (
                    <Link
                      href={insight.href}
                      className="mt-2.5 inline-block text-xs font-medium text-brand hover:underline"
                    >
                      Take a look →
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Nothing notable this month"
            description="No budget breaches, no unusual charges, no significant category drift. Quiet months are good months."
          />
        </Card>
      )}

      {/* ── Anomalies ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Unusual transactions"
          subtitle="Charges that stand out against the distribution of that same category in your own history"
        />
        {data.anomalies.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th className="num">Your typical</th>
                  <th className="num">How unusual</th>
                </tr>
              </thead>
              <tbody>
                {data.anomalies.map((a) => (
                  <tr key={a.transactionId}>
                    <td className="whitespace-nowrap text-muted">{formatDate(a.date)}</td>
                    <td className="max-w-[20rem] truncate font-medium text-fg">{a.description}</td>
                    <td className="whitespace-nowrap text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryIcon category={a.category} />
                      {a.category}
                    </span>
                  </td>
                    <td className="num font-semibold text-fg">{formatMoney(a.amountMinor, cur)}</td>
                    <td className="num text-muted">{formatMoney(a.medianMinor, cur)}</td>
                    <td className="num">
                      <Badge tone={a.score > 6 ? "critical" : "warning"}>
                        {(a.amountMinor / Math.max(1, a.medianMinor)).toFixed(1)}× typical
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-subtle">
            Nothing unusual in the last 90 days. Detection needs at least eight transactions in a
            category before it will call anything an outlier.
          </p>
        )}
      </Card>

      {/* ── Cashflow ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Income against expenses"
          subtitle="Internal transfers are excluded from both — moving money into savings isn't spending"
        />
        <div className="px-2 py-4 pr-4">
          <ComparisonChart
            points={data.history.slice(-12).map((h) => ({
              month: h.month,
              incomeMinor: h.incomeMinor,
              spendMinor: h.spendMinor,
            }))}
            currency={cur}
          />
        </div>
      </Card>

      {/* ── Habits ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Where you spend most"
            subtitle={`Top merchants in ${formatMonth(month)}`}
          />
          <div className="px-5 py-4">
            {data.topMerchants.length ? (
              <RankedBars
                withIcons={false}
                currency={cur}
                items={data.topMerchants.map((m) => ({
                  label: merchantLabel(m.merchant),
                  valueMinor: m.total,
                  count: m.n,
                  share: m.total / Math.max(1, data.kpis.spendMinor),
                  href: `/app/transactions?q=${encodeURIComponent(m.merchant)}`,
                }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-subtle">No merchant data this month.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Which days cost most"
            subtitle="Two days out of seven is 29% — anything well above that is a weekend habit"
          />
          <div className="px-5 py-4">
            <RankedBars withIcons={false} currency={cur} items={weekdayItems} />
          </div>
        </Card>
      </div>

      {/* ── Method ─────────────────────────────────────────────────── */}
      <Card className="px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">How &ldquo;unusual&rdquo; is decided</h2>
        <p className="mt-2 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
          Each transaction is scored against the distribution of its own category using a robust
          z-score — median and median absolute deviation rather than mean and standard deviation.
          That matters because a single enormous charge would inflate a standard deviation enough to
          hide itself. A £90 dinner is an outlier for most people and completely ordinary for some,
          so the comparison is always against your history rather than a fixed threshold.
        </p>
      </Card>
    </div>
  );
}
