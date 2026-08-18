import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { backtestSeries } from "@/lib/forecast";
import { formatMonth } from "@/lib/dates";
import { formatMoney, formatPercentAbs } from "@/lib/money";
import { categoryIcon } from "@/lib/categories";
import { Card, CardHeader, EmptyState, InfoHint, PageHeader, StatTile } from "@/components/ui";
import TrendChart from "@/components/charts/TrendChart";
import BacktestChart from "@/components/charts/BacktestChart";
import RankedBars from "@/components/charts/RankedBars";

export const metadata: Metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const MODEL_NOTES: Record<string, string> = {
  "Weighted average":
    "An exponentially weighted mean — recent months count for more, but no trend is assumed. Strong when spending is stable but noisy.",
  "Robust median":
    "The middle value of the last six months. Immune to one-off outliers like a holiday or a new laptop.",
  "Damped trend":
    "Holt's linear method with damping, so a run of rising months bends the forecast up without extrapolating to infinity.",
  Seasonal:
    "The same month last year, adjusted for how your overall level has shifted since. Earns its weight around December.",
  "Ridge regression":
    "A penalised regression on the previous two months, the rolling average, a time index and a sin/cos encoding of month-of-year.",
};

export default async function ForecastPage() {
  const user = await requireUser();
  const data = getDashboard(user);
  const cur = user.currency;

  if (!data || !data.forecast) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Forecast"
          description="What next month is likely to cost, with an honest range."
        />
        <Card>
          <EmptyState
            icon="🔮"
            title="Not enough history to forecast yet"
            description="Forecasting needs at least two complete months, and gets meaningfully better from about six. Import more of your statement history and this page will fill in."
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

  const f = data.forecast;
  const backtest = backtestSeries(data.closedHistory);
  const typical = data.typical;
  const delta = f.predictedMinor - typical;
  const spread = f.highMinor - f.lowMinor;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast"
        description="Five models, each backtested against your own history and weighted by how well it actually did. Nothing here is sent anywhere — it all runs on your machine in a few milliseconds."
      />

      {/* ── Headline ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="px-6 py-6">
          <p className="text-sm font-medium text-muted">
            Predicted spending for {formatMonth(f.month)}
          </p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-fg">
            {formatMoney(f.predictedMinor, cur)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-muted">
              Likely between{" "}
              <span className="font-semibold text-fg">{formatMoney(f.lowMinor, cur)}</span> and{" "}
              <span className="font-semibold text-fg">{formatMoney(f.highMinor, cur)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-subtle">
              80% interval
              <InfoHint text="Four times out of five, the real figure should land inside this range. The width comes from how far the models missed on your own past months." />
            </span>
          </div>

          <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed text-muted">
            That&apos;s{" "}
            <strong className={delta > 0 ? "text-warning" : "text-positive"}>
              {formatMoney(Math.abs(delta), cur)} {delta > 0 ? "above" : "below"}
            </strong>{" "}
            your typical month of {formatMoney(typical, cur)}. The range spans{" "}
            {formatMoney(spread, cur)}, which is{" "}
            {spread / Math.max(1, f.predictedMinor) > 0.4
              ? "wide — your month-to-month spending varies a lot, so treat the midpoint loosely"
              : "reasonably tight, so your spending is fairly predictable"}
            .
          </p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatTile
            label="Model accuracy on your data"
            value={f.mape !== null ? formatPercentAbs(f.mape, 1) : "—"}
            hint={
              f.mape !== null
                ? "average miss per month, walk-forward tested"
                : "needs more history to measure"
            }
            icon="🎯"
          />
          <StatTile
            label="Committed spending"
            value={formatMoney(data.commitment, cur)}
            hint="acts as a floor under the forecast"
            icon="🔁"
            href="/app/recurring"
          />
        </div>
      </div>

      {/* ── Trend with forecast ────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="History and forecast"
          subtitle="The dashed segment is the prediction; the shaded wedge is the 80% range"
        />
        <div className="px-2 py-4 pr-4">
          <TrendChart
            points={data.history.map((h) => ({ month: h.month, valueMinor: h.spendMinor }))}
            forecast={{
              month: f.month,
              predictedMinor: f.predictedMinor,
              lowMinor: f.lowMinor,
              highMinor: f.highMinor,
            }}
            currency={cur}
            height={320}
          />
        </div>
      </Card>

      {/* ── Track record ───────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="How the model has actually done"
          subtitle="For each month, the ensemble was refit on only the months before it and asked to predict — no peeking at the future"
        />
        <div className="px-2 py-4 pr-4">
          <BacktestChart points={backtest} currency={cur} />
        </div>
      </Card>

      {/* ── Model weights ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="What each model contributed"
            subtitle="Weights come from inverse squared error on your own backtest — the better a model did on your history, the more say it gets"
          />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="num">Its prediction</th>
                  <th className="num">Weight</th>
                  <th className="w-1/3">Share</th>
                </tr>
              </thead>
              <tbody>
                {f.contributions.map((c) => (
                  <tr key={c.model}>
                    <td>
                      <p className="font-medium text-fg">{c.model}</p>
                      <p className="mt-0.5 max-w-md text-xs leading-relaxed text-subtle">
                        {MODEL_NOTES[c.model]}
                      </p>
                    </td>
                    <td className="num align-top text-muted">
                      {formatMoney(c.predictionMinor, cur)}
                    </td>
                    <td className="num align-top font-semibold text-fg">
                      {(c.weight * 100).toFixed(0)}%
                    </td>
                    <td className="align-top">
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface-3)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, c.weight * 100)}%`,
                            background: "var(--viz-seq-3)",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={`Forecast by category`}
            subtitle={`Where the ${formatMoney(f.predictedMinor, cur)} is expected to go`}
          />
          <div className="px-5 py-4">
            {f.byCategory.length ? (
              <RankedBars
                items={f.byCategory.slice(0, 8).map((c) => ({
                  label: c.category,
                  valueMinor: c.predictedMinor,
                  share: c.predictedMinor / Math.max(1, f.predictedMinor),
                }))}
                currency={cur}
              />
            ) : (
              <p className="py-6 text-center text-sm text-subtle">
                Not enough per-category history to break the forecast down.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Method ─────────────────────────────────────────────────── */}
      <Card className="px-5 py-5">
        <h2 className="text-sm font-semibold text-fg">Why it&apos;s built this way</h2>
        <div className="mt-3 grid gap-6 text-[0.8125rem] leading-relaxed text-muted md:grid-cols-3">
          <div>
            <h3 className="mb-1.5 font-semibold text-fg">Walk-forward validation</h3>
            <p>
              Each past month is predicted using only the months before it, with the models refit
              each time. A conventional random train/test split would leak future information and
              report an accuracy the model could never achieve in practice.
            </p>
          </div>
          <div>
            <h3 className="mb-1.5 font-semibold text-fg">Why blend at all</h3>
            <p>
              A trend model suits someone whose costs are creeping up and misleads someone whose
              spending is flat but noisy. Rather than guessing which you are, all five run and the
              weights follow the evidence. The blend also degrades gracefully — with three months of
              history it quietly becomes an average, which is the honest answer at that point.
            </p>
          </div>
          <div>
            <h3 className="mb-1.5 font-semibold text-fg">Why a range</h3>
            <p>
              The interval comes from the spread of the model&apos;s own backtest misses, so it
              widens automatically for people whose spending genuinely jumps around. A single
              confident number would be more satisfying and less true.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
