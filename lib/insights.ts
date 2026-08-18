import type {
  Anomaly,
  CategoryTotal,
  Forecast,
  Insight,
  MonthlyPoint,
  RecurringSeries,
} from "./types";
import type { BudgetStatus, Kpis } from "./analytics";
import { categoryIcon } from "./categories";
import { formatMoney, formatPercent, formatPercentAbs, pctChange } from "./money";
import { formatMonth, formatDate, relativeDay } from "./dates";
import { mean, median } from "./stats";

/**
 * The insight engine.
 *
 * A dashboard shows you numbers; an *intelligence* platform tells you what
 * they mean. Each rule below looks for one specific, actionable pattern and
 * only fires when the evidence clears a materiality threshold — both a
 * percentage and a cash amount. That second condition matters: a 40% rise in a
 * category you spent £4 on is technically true and completely useless, and
 * flooding the user with trivia is how they learn to ignore the panel.
 *
 * Every insight carries a weight; the UI shows the heaviest few.
 */

export interface InsightContext {
  currency: string;
  month: string;
  kpis: Kpis;
  previousKpis: Kpis | null;
  history: MonthlyPoint[];
  categoriesThisMonth: CategoryTotal[];
  categoriesLastMonth: CategoryTotal[];
  budgets: BudgetStatus[];
  recurring: RecurringSeries[];
  priceRises: { series: RecurringSeries; oldMinor: number; newMinor: number; changePct: number }[];
  anomalies: Anomaly[];
  forecast: Forecast | null;
  topMerchants: { merchant: string; total: number; n: number; category: string }[];
  uncategorisedCount: number;
  weekdayProfile: { dow: number; totalMinor: number; count: number }[];
  /** True when `month` is still in progress — income may not have landed yet */
  isCurrent: boolean;
}

/** Materiality floor in minor units — below this, nobody cares. */
const MATERIAL = 1500; // £15

export function buildInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const cur = ctx.currency;
  const money = (m: number) => formatMoney(m, cur);

  /* ── Cashflow ───────────────────────────────────────────────────── */

  if (ctx.kpis.incomeMinor > 0) {
    const rate = ctx.kpis.savingsRate ?? 0;
    // A deficit that shows up while the month is still running is often just
    // "payday hasn't happened yet" rather than a genuine overspend — that's
    // only distinguishable once income received actually looks representative.
    const incomeLooksPartial = ctx.isCurrent && Math.abs(rate) > 1.5;

    if (ctx.kpis.netMinor < 0 && !incomeLooksPartial) {
      out.push({
        id: "cashflow-negative",
        tone: "critical",
        icon: "🔴",
        title: ctx.isCurrent
          ? `So far you've spent ${money(-ctx.kpis.netMinor)} more than you've earned`
          : `You spent ${money(-ctx.kpis.netMinor)} more than you earned`,
        detail: `${formatMonth(ctx.month)} income ${ctx.isCurrent ? "so far" : "was"} ${money(ctx.kpis.incomeMinor)} against ${money(ctx.kpis.spendMinor)} of spending. Sustained, that draws down savings by roughly ${money(-ctx.kpis.netMinor * 12)} a year.`,
        weight: 100,
        href: "/app/transactions",
      });
    } else if (!incomeLooksPartial && rate >= 0.2) {
      out.push({
        id: "savings-strong",
        tone: "positive",
        icon: "🟢",
        title: `You saved ${formatPercent(rate)} of your income`,
        detail: `${money(ctx.kpis.netMinor)} left over in ${formatMonth(ctx.month)}. Anything above 20% is considered a strong savings rate — at this pace you'd put aside ${money(ctx.kpis.netMinor * 12)} over a year.`,
        weight: 70,
      });
    } else if (rate > 0 && rate < 0.05) {
      out.push({
        id: "savings-thin",
        tone: "warning",
        icon: "🟡",
        title: `Only ${formatPercent(rate)} of your income survived the month`,
        detail: `That leaves ${money(ctx.kpis.netMinor)} of headroom. A single unexpected bill would push this month into the red.`,
        weight: 78,
      });
    }
  }

  /* ── Month-over-month movement ──────────────────────────────────── */

  if (ctx.previousKpis && ctx.previousKpis.spendMinor > 0) {
    const delta = ctx.kpis.spendMinor - ctx.previousKpis.spendMinor;
    const pct = pctChange(ctx.kpis.spendMinor, ctx.previousKpis.spendMinor);
    if (pct !== null && Math.abs(pct) >= 0.12 && Math.abs(delta) >= MATERIAL * 3) {
      const up = delta > 0;
      out.push({
        id: "mom-change",
        tone: up ? "warning" : "positive",
        icon: up ? "📈" : "📉",
        title: `Spending is ${formatPercentAbs(pct)} ${up ? "up" : "down"} on last month`,
        detail: `${money(ctx.kpis.spendMinor)} this month versus ${money(ctx.previousKpis.spendMinor)} last — a difference of ${money(Math.abs(delta))}.`,
        weight: 72 + Math.min(15, Math.abs(pct) * 40),
      });
    }
  }

  /* ── Category movers ────────────────────────────────────────────── */

  const lastByCat = new Map(ctx.categoriesLastMonth.map((c) => [c.category, c.totalMinor]));
  const movers = ctx.categoriesThisMonth
    .map((c) => {
      const prev = lastByCat.get(c.category) ?? 0;
      return { category: c.category, delta: c.totalMinor - prev, now: c.totalMinor, prev };
    })
    .filter((m) => m.prev > 0 && Math.abs(m.delta) >= MATERIAL * 2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const riser = movers.find((m) => m.delta > 0 && m.delta / m.prev >= 0.25);
  if (riser) {
    out.push({
      id: "category-rise",
      tone: "warning",
      icon: categoryIcon(riser.category),
      title: `${riser.category} is up ${money(riser.delta)}`,
      detail: `You've spent ${money(riser.now)} on ${riser.category.toLowerCase()} this month, against ${money(riser.prev)} last month — a ${formatPercent(riser.delta / riser.prev)} increase.`,
      weight: 76,
      href: `/app/transactions?category=${encodeURIComponent(riser.category)}`,
    });
  }

  const faller = movers.find((m) => m.delta < 0 && Math.abs(m.delta) / m.prev >= 0.3);
  if (faller) {
    out.push({
      id: "category-fall",
      tone: "positive",
      icon: categoryIcon(faller.category),
      title: `${faller.category} is down ${money(-faller.delta)}`,
      detail: `Down to ${money(faller.now)} from ${money(faller.prev)}. Keeping that up saves about ${money(-faller.delta * 12)} a year.`,
      weight: 58,
    });
  }

  /* ── Budgets ────────────────────────────────────────────────────── */

  const over = ctx.budgets.filter((b) => b.state === "over").sort((a, b) => b.usage - a.usage);
  if (over.length) {
    const worst = over[0];
    out.push({
      id: "budget-over",
      tone: "critical",
      icon: "🚨",
      title:
        over.length === 1
          ? `${worst.category} is over budget by ${money(-worst.remainingMinor)}`
          : `${over.length} budgets are already blown`,
      detail:
        over.length === 1
          ? `You budgeted ${money(worst.budgetMinor)} and have spent ${money(worst.spentMinor)} — ${formatPercent(worst.usage - 1)} over.`
          : `Worst is ${worst.category} at ${money(worst.spentMinor)} against a ${money(worst.budgetMinor)} budget. Combined overspend: ${money(over.reduce((a, b) => a - b.remainingMinor, 0))}.`,
      weight: 95,
      href: "/app/budgets",
    });
  }

  const atRisk = ctx.budgets
    .filter((b) => b.state === "at-risk")
    .sort((a, b) => b.projectedMinor - b.budgetMinor - (a.projectedMinor - a.budgetMinor));
  if (atRisk.length) {
    const b = atRisk[0];
    out.push({
      id: "budget-risk",
      tone: "warning",
      icon: "⏳",
      title: `${b.category} is on track to overshoot`,
      detail: `At the current pace you'll finish the month at about ${money(b.projectedMinor)} against a ${money(b.budgetMinor)} budget. Slowing to ${money(Math.max(0, Math.round(b.remainingMinor)))} for the rest of the month keeps you inside it.`,
      weight: 82,
      href: "/app/budgets",
    });
  }

  /* ── Subscriptions ──────────────────────────────────────────────── */

  const active = ctx.recurring.filter((r) => r.status === "active");
  const monthlyCommit = active.reduce((a, r) => a + r.monthlyEquivalentMinor, 0);
  if (active.length >= 3 && monthlyCommit >= MATERIAL) {
    const share = ctx.kpis.spendMinor > 0 ? monthlyCommit / ctx.kpis.spendMinor : 0;
    out.push({
      id: "subs-total",
      tone: share > 0.4 ? "warning" : "neutral",
      icon: "🔁",
      title: `${active.length} recurring payments cost you ${money(monthlyCommit)} a month`,
      detail: `That's ${money(monthlyCommit * 12)} a year${share > 0 ? `, or ${formatPercent(share)} of everything you spend` : ""}. Committed spending is the hardest kind to cut in a hurry.`,
      weight: share > 0.4 ? 80 : 60,
      href: "/app/recurring",
    });
  }

  if (ctx.priceRises.length) {
    const r = ctx.priceRises[0];
    out.push({
      id: "price-rise",
      tone: "warning",
      icon: "⚠️",
      title: `${r.series.label} raised its price ${formatPercent(r.changePct)}`,
      detail: `It went from ${money(r.oldMinor)} to ${money(r.newMinor)}. Over a year that's ${money((r.newMinor - r.oldMinor) * (365 / Math.max(1, r.series.intervalDays)))} more than you were paying.`,
      weight: 85,
      href: "/app/recurring",
    });
  }

  const lapsed = ctx.recurring.filter((r) => r.status === "lapsed" && r.occurrences >= 4);
  if (lapsed.length) {
    const l = lapsed.sort((a, b) => b.monthlyEquivalentMinor - a.monthlyEquivalentMinor)[0];
    out.push({
      id: "subs-lapsed",
      tone: "neutral",
      icon: "🛑",
      title: `${l.label} has stopped charging you`,
      detail: `Last payment was ${money(l.amountMinor)} on ${formatDate(l.lastDate)}, and it was billing every ${l.intervalDays} days. If you cancelled it, you're saving ${money(l.monthlyEquivalentMinor * 12)} a year.`,
      weight: 45,
      href: "/app/recurring",
    });
  }

  const dueSoon = active
    .filter((r) => r.nextDate >= ctx.month + "-01")
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 1);
  if (dueSoon.length && dueSoon[0].amountMinor >= MATERIAL * 4) {
    const d = dueSoon[0];
    out.push({
      id: "subs-due",
      tone: "neutral",
      icon: "📅",
      title: `${d.label} takes ${money(d.amountMinor)} ${relativeDay(d.nextDate)}`,
      detail: `It has billed ${d.occurrences} times on a ${d.cadence} cycle, so this one is predictable — worth making sure the balance is there.`,
      weight: 50,
      href: "/app/recurring",
    });
  }

  /* ── Anomalies ──────────────────────────────────────────────────── */

  if (ctx.anomalies.length) {
    const a = ctx.anomalies[0];
    out.push({
      id: "anomaly",
      tone: "warning",
      icon: "🔎",
      title: `Unusually large ${a.category.toLowerCase()} charge`,
      detail: `${a.description} on ${formatDate(a.date)} was ${money(a.amountMinor)} — around ${(a.amountMinor / Math.max(1, a.medianMinor)).toFixed(1)}× your typical ${a.category.toLowerCase()} transaction of ${money(a.medianMinor)}.`,
      weight: 74,
      href: "/app/insights",
    });
  }

  /* ── Habits ─────────────────────────────────────────────────────── */

  const habit = ctx.topMerchants.find((m) => m.n >= 8 && m.total >= MATERIAL * 2);
  if (habit) {
    const perVisit = Math.round(habit.total / habit.n);
    out.push({
      id: "habit",
      tone: "neutral",
      icon: "☕",
      title: `${habit.n} visits to ${titleise(habit.merchant)} this month`,
      detail: `Averaging ${money(perVisit)} a time, ${money(habit.total)} in total. Dropping to ${Math.max(1, Math.round(habit.n / 2))} visits would free up about ${money(Math.round(habit.total / 2) * 12)} a year.`,
      weight: 56,
    });
  }

  const weekendTotal = ctx.weekdayProfile
    .filter((d) => d.dow === 0 || d.dow === 6)
    .reduce((a, d) => a + d.totalMinor, 0);
  const allTotal = ctx.weekdayProfile.reduce((a, d) => a + d.totalMinor, 0);
  if (allTotal > MATERIAL * 10) {
    const share = weekendTotal / allTotal;
    // Two days out of seven is 28.6%; flag only a clear skew.
    if (share > 0.42) {
      out.push({
        id: "weekend",
        tone: "neutral",
        icon: "🌤️",
        title: `${formatPercent(share)} of your spending happens at weekends`,
        detail: `${money(weekendTotal)} across Saturdays and Sundays alone — two days carrying nearly half the month. Weekend plans are where the budget actually goes.`,
        weight: 48,
      });
    }
  }

  if (ctx.kpis.noSpendDays >= 8) {
    out.push({
      id: "no-spend",
      tone: "positive",
      icon: "✨",
      title: `${ctx.kpis.noSpendDays} days without spending anything`,
      detail: `No-spend days are the cheapest habit there is. You averaged ${money(ctx.kpis.dailyAverageMinor)} a day across the month.`,
      weight: 42,
    });
  }

  /* ── Forecast ───────────────────────────────────────────────────── */

  if (ctx.forecast && ctx.history.length >= 4) {
    const typical = median(ctx.history.slice(-6).map((h) => h.spendMinor));
    const f = ctx.forecast;
    const delta = f.predictedMinor - typical;
    if (typical > 0 && Math.abs(delta) / typical >= 0.1 && Math.abs(delta) >= MATERIAL * 2) {
      out.push({
        id: "forecast",
        tone: delta > 0 ? "warning" : "positive",
        icon: "🔮",
        title: `${formatMonth(f.month)} is forecast at ${money(f.predictedMinor)}`,
        detail: `That's ${money(Math.abs(delta))} ${delta > 0 ? "above" : "below"} your typical month of ${money(typical)}. Expected range ${money(f.lowMinor)} to ${money(f.highMinor)}${f.mape !== null ? `, with the model averaging ${formatPercentAbs(f.mape, 1)} error on your history` : ""}.`,
        weight: 68,
        href: "/app/forecast",
      });
    }
  }

  /* ── Data quality ───────────────────────────────────────────────── */

  if (ctx.uncategorisedCount >= 5) {
    out.push({
      id: "uncategorised",
      tone: "neutral",
      icon: "🏷️",
      title: `${ctx.uncategorisedCount} transactions need a category`,
      detail: `Confirming them takes a minute and makes every forecast and budget on this dashboard sharper — the classifier trains on what you correct.`,
      weight: 52,
      href: "/app/transactions?uncategorised=1",
    });
  }

  /* ── Long-run trend ─────────────────────────────────────────────── */

  if (ctx.history.length >= 6) {
    const recent = ctx.history.slice(-3).map((h) => h.spendMinor);
    const earlier = ctx.history.slice(-6, -3).map((h) => h.spendMinor);
    const rMean = mean(recent);
    const eMean = mean(earlier);
    const pct = pctChange(rMean, eMean);
    if (pct !== null && Math.abs(pct) >= 0.15 && Math.abs(rMean - eMean) >= MATERIAL * 3) {
      out.push({
        id: "trend",
        tone: pct > 0 ? "warning" : "positive",
        icon: pct > 0 ? "📊" : "🎯",
        title: `Your three-month average is ${formatPercentAbs(pct)} ${pct > 0 ? "higher" : "lower"}`,
        detail: `The last three months averaged ${money(Math.round(rMean))} against ${money(Math.round(eMean))} for the three before. ${pct > 0 ? "A steady climb like this is easy to miss month to month." : "That's a real, sustained reduction."}`,
        weight: 64,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

function titleise(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
