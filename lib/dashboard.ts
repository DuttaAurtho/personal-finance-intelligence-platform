import {
  allTransactions,
  countTransactions,
  detectAnomalies,
  getBudgetStatus,
  getCategoryMonthlyMap,
  getCategoryTotals,
  getDailySeries,
  getDateBounds,
  getKpis,
  getMonthlySeries,
  getTopMerchants,
  queryTransactions,
  weekdayProfile,
} from "./analytics";
import { detectRecurring, monthlyCommitment, priceIncreases, upcoming } from "./recurring";
import { forecastSpending, projectCurrentMonth } from "./forecast";
import { buildInsights } from "./insights";
import { get } from "./db";
import {
  addMonths,
  currentMonth,
  daysInMonth,
  monthEnd,
  monthStart,
  todayISO,
} from "./dates";
import type { User } from "./types";

/**
 * Assembles everything the dashboard and insights pages need in one pass.
 *
 * Deliberately a single function rather than a dozen page-level queries: the
 * recurring detector and the forecaster both need the full transaction history,
 * and loading it once keeps a dashboard render to a handful of SQL statements.
 * All independent queries fire together rather than one-at-a-time — over a
 * network round trip to a hosted database, that's the difference between one
 * round trip's worth of latency and a dozen.
 */
export async function getDashboard(user: User, month = currentMonth()) {
  const userId = user.id;

  const [total, bounds] = await Promise.all([countTransactions(userId), getDateBounds(userId)]);
  if (!total || !bounds) return null;

  const from = monthStart(month);
  const to = monthEnd(month);
  const prevMonth = addMonths(month, -1);
  const prevFrom = monthStart(prevMonth);
  const prevTo = monthEnd(prevMonth);

  /* ── Everything independent, in one batch ───────────────────────── */
  const [
    kpis,
    previousKpis,
    history,
    categoriesThisMonth,
    categoriesLastMonth,
    incomeCategories,
    budgets,
    topMerchants,
    daily,
    weekdays,
    transactions,
    categoryMonthlyMap,
    uncategorisedRow,
    recent,
  ] = await Promise.all([
    getKpis(userId, from, to),
    getKpis(userId, prevFrom, prevTo),
    getMonthlySeries(userId, 24),
    getCategoryTotals(userId, from, to),
    getCategoryTotals(userId, prevFrom, prevTo),
    getCategoryTotals(userId, from, to, "income"),
    getBudgetStatus(userId, month),
    getTopMerchants(userId, from, to, 8),
    getDailySeries(userId, from, to),
    weekdayProfile(userId, from, to),
    allTransactions(userId),
    getCategoryMonthlyMap(userId),
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions
        WHERE user_id = ? AND (category = 'Uncategorised' OR confidence < 0.6)`,
      userId,
    ),
    queryTransactions(userId, { limit: 8, sort: "date_desc" }),
  ]);

  /* ── Model-driven views over the full history (pure JS, no I/O) ──── */
  const recurring = detectRecurring(transactions);
  const anomalies = detectAnomalies(transactions);
  const risesFound = priceIncreases(recurring, transactions);
  const commitment = monthlyCommitment(recurring);
  const dueSoon = upcoming(recurring, 30);

  /* ── Forecast ────────────────────────────────────────────────── */
  // The current month is still accruing, so it is excluded from the training
  // series — including it would read as a sudden collapse in spending.
  const nowMonth = currentMonth();
  const closedHistory = history.filter((h) => h.month < nowMonth);
  const forecast = forecastSpending({
    history: closedHistory.length >= 2 ? closedHistory : history,
    byCategory: categoryMonthlyMap,
    commitmentMinor: commitment,
  });

  /* ── Where this month is heading ─────────────────────────────── */
  const isCurrent = month === nowMonth;
  const today = todayISO();
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const fixedPaid = recurring
    .filter((r) => r.status === "active" && r.lastDate >= from && r.lastDate <= to)
    .reduce((a, r) => a + r.amountMinor, 0);
  const typical =
    closedHistory.length > 0
      ? Math.round(
          closedHistory.slice(-6).reduce((a, h) => a + h.spendMinor, 0) /
            Math.min(6, closedHistory.length),
        )
      : kpis.spendMinor;

  const projection = isCurrent
    ? projectCurrentMonth(kpis.spendMinor, fixedPaid, dayOfMonth, daysInMonth(month), typical)
    : kpis.spendMinor;

  const uncategorised = uncategorisedRow?.n ?? 0;

  /* ── Narrative layer ─────────────────────────────────────────── */
  const insights = buildInsights({
    currency: user.currency,
    month,
    kpis,
    previousKpis,
    history: closedHistory.length ? closedHistory : history,
    categoriesThisMonth,
    categoriesLastMonth,
    budgets,
    recurring,
    priceRises: risesFound,
    anomalies,
    forecast,
    topMerchants,
    uncategorisedCount: uncategorised,
    weekdayProfile: weekdays,
    isCurrent,
  });

  return {
    month,
    bounds,
    kpis,
    previousKpis,
    history,
    closedHistory,
    categoriesThisMonth,
    categoriesLastMonth,
    incomeCategories,
    budgets,
    topMerchants,
    daily,
    weekdays,
    recurring,
    anomalies,
    priceRises: risesFound,
    commitment,
    dueSoon,
    forecast,
    projection,
    isCurrent,
    typical,
    uncategorised,
    insights,
    recent: recent.rows,
    transactionCount: total,
  };
}

export type DashboardData = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;

/** The months that actually contain data, newest first — for the month picker. */
export async function availableMonths(userId: number): Promise<string[]> {
  const bounds = await getDateBounds(userId);
  if (!bounds) return [currentMonth()];

  const out: string[] = [];
  let cursor = bounds.max.slice(0, 7);
  const first = bounds.min.slice(0, 7);
  let guard = 0;
  while (cursor >= first && guard++ < 240) {
    out.push(cursor);
    cursor = addMonths(cursor, -1);
  }
  return out;
}
