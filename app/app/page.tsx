import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { availableMonths, getDashboard } from "@/lib/dashboard";
import { currentMonth, formatDate, formatMonth, relativeDay } from "@/lib/dates";
import { formatMoney, formatPercent, formatPercentAbs, pctChange } from "@/lib/money";
import { categoryIcon } from "@/lib/categories";
import { merchantLabel } from "@/lib/categorize";
import { Badge, Card, CardHeader, EmptyState, SectionLabel, StatTile } from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import TrendChart from "@/components/charts/TrendChart";
import RankedBars from "@/components/charts/RankedBars";
import Meter, { STATE_LABEL } from "@/components/charts/Meter";
import CalendarHeatmap from "@/components/charts/CalendarHeatmap";
import { startDemo } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const TONE_MAP = {
  positive: "positive",
  warning: "warning",
  critical: "critical",
  neutral: "neutral",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const months = await availableMonths(user.id);
  const month = params.month && months.includes(params.month) ? params.month : months[0] ?? currentMonth();

  const data = await getDashboard(user, month);
  const cur = user.currency;

  if (!data) {
    return (
      <Card>
        <EmptyState
          icon="🚀"
          title="Let's get some data in here"
          description="Import a CSV statement from your bank, or load two years of realistic sample data to see what Fiscora does before committing your own numbers."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/app/import" className="btn btn-primary h-10 px-4">
                Import a CSV
              </Link>
              <form action={startDemo}>
                <button type="submit" className="btn btn-secondary h-10 px-4">
                  Load sample data
                </button>
              </form>
            </div>
          }
        />
      </Card>
    );
  }

  const spendDelta = pctChange(data.kpis.spendMinor, data.previousKpis.spendMinor);
  const trendValues = data.history.slice(-12).map((h) => h.spendMinor);
  const topCategories = data.categoriesThisMonth.slice(0, 6);
  const worstBudgets = [...data.budgets]
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {formatMonth(month)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.isCurrent
              ? `Month in progress · ${data.kpis.transactionCount} transactions so far`
              : `${data.kpis.transactionCount} transactions`}
          </p>
        </div>
        <MonthPicker months={months} value={month} />
      </div>

      {/* ── KPI row ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          label={data.isCurrent ? "Spent so far" : "Total spent"}
          value={formatMoney(data.kpis.spendMinor, cur)}
          delta={
            spendDelta !== null
              ? {
                  text: `${formatPercentAbs(spendDelta)} vs ${formatMonth(
                    months[months.indexOf(month) + 1] ?? month,
                    true,
                  )}`,
                  direction: spendDelta > 0 ? "up" : spendDelta < 0 ? "down" : "flat",
                  good: spendDelta <= 0,
                }
              : undefined
          }
          hint={
            data.isCurrent && data.projection > data.kpis.spendMinor
              ? `heading for ${formatMoney(data.projection, cur)}`
              : undefined
          }
          trend={trendValues}
        />

        <StatTile
          label="Income"
          value={formatMoney(data.kpis.incomeMinor, cur)}
          hint={`${data.kpis.noSpendDays} no-spend days`}
          icon="💼"
        />

        <StatTile
          label="Left over"
          value={formatMoney(data.kpis.netMinor, cur, { signed: true })}
          delta={
            // Early in the current month, income may barely have landed yet
            // (salary often arrives on one specific day) — dividing by a
            // not-yet-representative income figure produces a wild, useless
            // percentage. Only show the rate once it means something.
            data.kpis.savingsRate !== null &&
            (!data.isCurrent || Math.abs(data.kpis.savingsRate) <= 1.5)
              ? {
                  text: `${formatPercent(data.kpis.savingsRate)} savings rate`,
                  direction: data.kpis.netMinor >= 0 ? "up" : "down",
                  good: data.kpis.netMinor >= 0,
                }
              : undefined
          }
          hint={
            data.isCurrent &&
            (data.kpis.savingsRate === null || Math.abs(data.kpis.savingsRate) > 1.5)
              ? "income still arriving this month"
              : undefined
          }
          icon="⚖️"
        />

        <StatTile
          label="Regular bills"
          value={formatMoney(data.commitment, cur)}
          hint={`${data.recurring.filter((r) => r.status === "active").length} subscriptions & bills`}
          icon="🔁"
          href="/app/recurring"
        />
      </div>

      {/* ── Insights strip ─────────────────────────────────────────── */}
      {data.insights.length > 0 && (
        <section aria-label="What stands out this month">
          <SectionLabel>What stands out</SectionLabel>
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            {data.insights.slice(0, 3).map((insight) => (
              <Card key={insight.id} hover className="flex h-full flex-col px-5 py-4">
                {/* Badge is pinned to its own row above the heading rather than
                    sitting inline: inline, a long title pushes it onto a second
                    line on some cards and not others, and the row reads ragged. */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-sm"
                  >
                    {insight.icon}
                  </span>
                  <Badge tone={TONE_MAP[insight.tone]}>
                    {insight.tone === "critical"
                      ? "Needs attention"
                      : insight.tone === "warning"
                        ? "Worth a look"
                        : insight.tone === "positive"
                          ? "Good news"
                          : "FYI"}
                  </Badge>
                </div>

                <h3 className="text-[0.9375rem] font-semibold leading-snug text-fg">
                  {insight.title}
                </h3>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
                  {insight.detail}
                </p>

                {insight.href && (
                  <Link
                    href={insight.href}
                    className="mt-auto pt-3 text-xs font-semibold text-brand hover:underline"
                  >
                    Take a look →
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Trend + breakdown ──────────────────────────────────────── */}
      <section aria-label="Spending overview">
        <SectionLabel>Where the money goes</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Spending over time"
            subtitle={
              data.forecast
                ? `Last ${data.history.length} months, with next month forecast by the model ensemble`
                : `Last ${data.history.length} months`
            }
            action={
              <Link href="/app/forecast" className="btn btn-ghost text-xs">
                Forecast detail →
              </Link>
            }
          />
          <div className="px-2 py-4 pr-4">
            <TrendChart
              points={data.history.map((h) => ({ month: h.month, valueMinor: h.spendMinor }))}
              forecast={
                data.forecast
                  ? {
                      month: data.forecast.month,
                      predictedMinor: data.forecast.predictedMinor,
                      lowMinor: data.forecast.lowMinor,
                      highMinor: data.forecast.highMinor,
                    }
                  : null
              }
              currency={cur}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Where it went"
            subtitle={`${formatMonth(month, true)} by category`}
            action={
              <Link href="/app/transactions" className="btn btn-ghost text-xs">
                All →
              </Link>
            }
          />
          <div className="px-5 py-4">
            {topCategories.length ? (
              <>
                <RankedBars
                  items={topCategories.map((c) => ({
                    label: c.category,
                    valueMinor: c.totalMinor,
                    share: c.share,
                    count: c.count,
                    href: `/app/transactions?category=${encodeURIComponent(c.category)}&month=${month}`,
                  }))}
                  currency={cur}
                />
                {data.categoriesThisMonth.length > 6 && (
                  <p className="mt-4 border-t border-line pt-3 text-xs text-subtle">
                    Plus {data.categoriesThisMonth.length - 6} smaller categories totalling{" "}
                    {formatMoney(
                      data.categoriesThisMonth.slice(6).reduce((a, c) => a + c.totalMinor, 0),
                      cur,
                    )}
                    .
                  </p>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-subtle">
                No spending recorded this month.
              </p>
            )}
          </div>
        </Card>
      </div>
      </section>

      {/* ── Budgets + upcoming ─────────────────────────────────────── */}
      <section aria-label="Budgets and upcoming payments">
        <SectionLabel>Staying on track</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Budget health"
            subtitle={
              data.budgets.length
                ? "Marker shows where this month is projected to finish"
                : "No budgets set yet"
            }
            action={
              <Link href="/app/budgets" className="btn btn-ghost text-xs">
                Manage →
              </Link>
            }
          />
          <div className="px-5 py-4">
            {worstBudgets.length ? (
              <ul className="space-y-4">
                {worstBudgets.map((b) => {
                  const state = STATE_LABEL[b.state];
                  return (
                    <li key={b.category}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-medium text-fg">
                          <span aria-hidden="true">{categoryIcon(b.category)}</span>
                          {b.category}
                        </span>
                        <span className="text-sm tabular-nums text-muted">
                          <span className="font-semibold text-fg">
                            {formatMoney(b.spentMinor, cur)}
                          </span>{" "}
                          / {formatMoney(b.budgetMinor, cur)}
                        </span>
                      </div>
                      <Meter usage={b.usage} projection={b.projectedMinor / b.budgetMinor} state={b.state} />
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span
                          className={
                            b.state === "over"
                              ? "text-negative"
                              : b.state === "at-risk"
                                ? "text-warning"
                                : "text-muted"
                          }
                        >
                          <span aria-hidden="true">{state.icon}</span> {state.label}
                        </span>
                        <span className="text-subtle">
                          {b.remainingMinor >= 0
                            ? `${formatMoney(b.remainingMinor, cur)} left`
                            : `${formatMoney(-b.remainingMinor, cur)} over`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon="🎯"
                title="No budgets yet"
                description="Fiscora can propose one for every category from your own spending history."
                action={
                  <Link href="/app/budgets" className="btn btn-primary h-9">
                    Set up budgets
                  </Link>
                }
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Coming up"
            subtitle="Recurring payments due in the next 30 days"
            action={
              <Link href="/app/recurring" className="btn btn-ghost text-xs">
                All →
              </Link>
            }
          />
          <div className="px-5 py-4">
            {data.dueSoon.length ? (
              <ul className="divide-y divide-line">
                {data.dueSoon.slice(0, 6).map((r) => (
                  <li key={r.merchant} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                      <p className="text-xs text-subtle">
                        {formatDate(r.nextDate)} · {relativeDay(r.nextDate)} · {r.cadence}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                      {formatMoney(r.amountMinor, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-subtle">
                Nothing recurring is due in the next month.
              </p>
            )}
          </div>
        </Card>
      </div>
      </section>

      {/* ── Daily rhythm + biggest merchants ───────────────────────── */}
      {/* A single month's heatmap is only five columns wide, so on its own it
          left a full-width card mostly empty. Pairing it with the merchant
          ranking fills the row and puts two views of the same month together. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader
            title="Daily spending rhythm"
            subtitle={`Every day in ${formatMonth(month)} — darker squares cost more`}
          />
          <div className="flex flex-1 items-center px-5 py-4">
            <CalendarHeatmap
              days={data.daily.map((d) => ({ date: d.date, totalMinor: d.total }))}
              from={`${month}-01`}
              to={data.isCurrent ? new Date().toISOString().slice(0, 10) : `${month}-28`}
              currency={cur}
            />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Biggest merchants"
            subtitle={`Where most of ${formatMonth(month, true)} actually went`}
            action={
              <Link href="/app/insights" className="btn btn-ghost text-xs">
                More →
              </Link>
            }
          />
          <div className="flex-1 px-5 py-4">
            {data.topMerchants.length ? (
              <RankedBars
                withIcons={false}
                currency={cur}
                items={data.topMerchants.slice(0, 6).map((m) => ({
                  label: merchantLabel(m.merchant),
                  valueMinor: m.total,
                  count: m.n,
                  share: m.total / Math.max(1, data.kpis.spendMinor),
                  href: `/app/transactions?q=${encodeURIComponent(m.merchant)}`,
                }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-subtle">
                No merchant data for this month.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Recent transactions ────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Latest transactions"
          action={
            <Link href="/app/transactions" className="btn btn-ghost text-xs">
              View all →
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-muted">{formatDate(t.date)}</td>
                  <td className="max-w-[22rem] truncate font-medium text-fg">{t.description}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <span aria-hidden="true">{categoryIcon(t.category)}</span>
                      {t.category}
                    </span>
                  </td>
                  <td
                    className={`num font-semibold ${
                      t.amount_minor > 0 ? "text-positive" : "text-fg"
                    }`}
                  >
                    {formatMoney(t.amount_minor, cur, { signed: t.amount_minor > 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
