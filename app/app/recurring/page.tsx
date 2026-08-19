import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { allTransactions } from "@/lib/analytics";
import { detectRecurring, monthlyCommitment, priceIncreases, upcoming } from "@/lib/recurring";
import { formatDate, relativeDay } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { categoryIcon } from "@/lib/categories";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui";
import type { RecurringSeries } from "@/lib/types";

export const metadata: Metadata = { title: "Recurring payments" };
export const dynamic = "force-dynamic";

const CADENCE_LABEL: Record<RecurringSeries["cadence"], string> = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  irregular: "Irregular",
};

function confidenceTone(c: number) {
  return c >= 0.8 ? "positive" : c >= 0.6 ? "info" : "warning";
}

function confidenceWord(c: number) {
  return c >= 0.8 ? "Certain" : c >= 0.6 ? "Likely" : "Possible";
}

export default async function RecurringPage() {
  const user = await requireUser();
  const cur = user.currency;

  const transactions = await allTransactions(user.id);
  const series = detectRecurring(transactions);
  const active = series.filter((s) => s.status === "active");
  const lapsed = series.filter((s) => s.status === "lapsed");
  const commitment = monthlyCommitment(series);
  const dueSoon = upcoming(series, 30);
  const rises = priceIncreases(series, transactions);

  const dueSoonTotal = dueSoon.reduce((a, r) => a + r.amountMinor, 0);

  if (!series.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Recurring payments"
          description="Subscriptions, direct debits and anything else that bills you on a rhythm."
        />
        <Card>
          <EmptyState
            icon="🔁"
            title="No recurring payments found yet"
            description="Detection needs at least three payments to the same merchant on a consistent rhythm. Import a few more months of history and they'll start appearing."
            action={
              <Link href="/app/import" className="btn btn-primary h-9">
                Import more history
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring payments"
        description="Found by looking for rhythm in your payment history rather than matching a list of known brands — so the gym and the window cleaner show up too."
      />

      {/* ── Headline figures ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          label="Committed every month"
          value={formatMoney(commitment, cur)}
          hint={`${formatMoney(commitment * 12, cur)} a year`}
          icon="🔁"
        />
        <StatTile
          label="Active subscriptions"
          value={String(active.length)}
          hint={lapsed.length > 0 ? `${lapsed.length} appear to have stopped` : "none lapsed"}
        />
        <StatTile
          label="Due in 30 days"
          value={formatMoney(dueSoonTotal, cur)}
          hint={`${dueSoon.length} payments`}
          icon="📅"
        />
        <StatTile
          label="Price rises spotted"
          value={String(rises.length)}
          hint={
            rises.length
              ? `costing ${formatMoney(
                  rises.reduce(
                    (a, r) => a + (r.newMinor - r.oldMinor) * (365 / Math.max(1, r.series.intervalDays)),
                    0,
                  ),
                  cur,
                )} more a year`
              : "nothing has gone up"
          }
          icon={rises.length ? "⚠️" : "✓"}
        />
      </div>

      {/* ── Price rises ────────────────────────────────────────────── */}
      {rises.length > 0 && (
        <Card>
          <CardHeader
            title="Price increases"
            subtitle="The most recent charge compared against the median of everything before it"
          />
          <ul className="divide-y divide-line">
            {rises.map((r) => (
              <li
                key={r.series.merchant}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">{r.series.label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatMoney(r.oldMinor, cur)} → {formatMoney(r.newMinor, cur)} ·{" "}
                    {CADENCE_LABEL[r.series.cadence].toLowerCase()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="warning">{formatPercent(r.changePct)}</Badge>
                  <span className="text-sm tabular-nums text-muted">
                    +
                    {formatMoney(
                      (r.newMinor - r.oldMinor) * (365 / Math.max(1, r.series.intervalDays)),
                      cur,
                    )}
                    /yr
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Active ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Active"
          subtitle="Sorted by what each one actually costs you per month"
        />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Category</th>
                <th>Cadence</th>
                <th className="num">Amount</th>
                <th className="num">Per month</th>
                <th>Next due</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.merchant}>
                  <td>
                    <Link
                      href={`/app/transactions?q=${encodeURIComponent(s.merchant)}`}
                      className="font-medium text-fg hover:text-brand hover:underline"
                    >
                      {s.label}
                    </Link>
                    <p className="mt-0.5 text-xs text-subtle">
                      {s.occurrences} payments since {formatDate(s.lastDate)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <span aria-hidden="true" className="mr-1.5">
                      {categoryIcon(s.category)}
                    </span>
                    {s.category}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {CADENCE_LABEL[s.cadence]}
                    {s.cadence === "irregular" && (
                      <span className="block text-xs text-subtle">~{s.intervalDays} days</span>
                    )}
                  </td>
                  <td className="num text-fg">
                    {formatMoney(s.amountMinor, cur)}
                    {s.amountVariance > 0.05 && (
                      <span className="block text-xs font-normal text-subtle">varies</span>
                    )}
                  </td>
                  <td className="num font-semibold text-fg">
                    {formatMoney(s.monthlyEquivalentMinor, cur)}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {formatDate(s.nextDate)}
                    <span className="block text-xs text-subtle">{relativeDay(s.nextDate)}</span>
                  </td>
                  <td>
                    <Badge tone={confidenceTone(s.confidence)}>
                      {confidenceWord(s.confidence)} · {Math.round(s.confidence * 100)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Lapsed ─────────────────────────────────────────────────── */}
      {lapsed.length > 0 && (
        <Card>
          <CardHeader
            title="Stopped billing"
            subtitle="These were on a rhythm and have missed more than a full cycle — either cancelled, or worth checking"
          />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Was billing</th>
                  <th className="num">Amount</th>
                  <th>Last payment</th>
                  <th className="num">Yearly saving</th>
                </tr>
              </thead>
              <tbody>
                {lapsed.map((s) => (
                  <tr key={s.merchant}>
                    <td className="font-medium text-fg">{s.label}</td>
                    <td className="text-muted">{CADENCE_LABEL[s.cadence]}</td>
                    <td className="num text-muted">{formatMoney(s.amountMinor, cur)}</td>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(s.lastDate)}
                      <span className="block text-xs text-subtle">{relativeDay(s.lastDate)}</span>
                    </td>
                    <td className="num font-medium text-positive">
                      {formatMoney(s.monthlyEquivalentMinor * 12, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Method note ────────────────────────────────────────────── */}
      <Card className="px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">How detection works</h2>
        <p className="mt-2 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
          Each merchant&apos;s payments are grouped and scored on two things: how consistent the
          gaps between them are, measured with median absolute deviation so a single late payment
          doesn&apos;t hide a real subscription, and how stable the amount is. That score is
          combined with how closely the rhythm matches a cadence a business would actually bill on,
          and how many payments we&apos;ve seen. An identical amount three times running is the
          strongest signal there is.
        </p>
        <p className="mt-2 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
          The confidence percentage is that score — it&apos;s shown rather than hidden so you can
          discount the ones the model is guessing at.
        </p>
      </Card>
    </div>
  );
}
