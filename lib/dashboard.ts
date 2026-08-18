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
 */
export function getDashboard(user: User, month = currentMonth()) {
  const userId = user.id;

  const total = countTransactions(userId);
  const bounds = getDateBounds(userId);
  if (!total || !bounds) return null;

  const from = monthStart(month);
  const to = monthEnd(month);
  const prevMonth = addMonths(month, -1);

  /* ── Core aggregates ─────────────────────────────────────────── */
  const kpis = getKpis(userId, from, to);
  const previousKpis = getKpis(userId, monthStart(prevMonth), monthEnd(prevMonth));
  const history = getMonthlySeries(userId, 24);
  const categoriesThisMonth = getCategoryTotals(userId, from, to);
  const categoriesLastMonth = getCategoryTotals(userId, monthStart(prevMonth), monthEnd(prevMonth));
  const incomeCategories = getCategoryTotals(userId, from, to, "income");
  const budgets = getBudgetStatus(userId, month);
  const topMerchants = getTopMerchants(userId, from, to, 8);
  const daily = getDailySeries(userId, from, to);
  const weekdays = weekdayProfile(userId, from, to);

  /* ── Model-driven views over the full history ────────────────── */
  const transactions = allTransactions(userId);
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
    byCategory: getCategoryMonthlyMap(userId),
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

  /* ── Data quality ────────────────────────────────────────────── */
  const uncategorised =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions
        WHERE user_id = ? AND (category = 'Uncategorised' OR confidence < 0.6)`,
      userId,
    )?.n ?? 0;

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

  const recent = queryTransactions(userId, { limit: 8, sort: "date_desc" });

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

export type DashboardData = NonNullable<ReturnType<typeof getDashboard>>;

/** The months that actually contain data, newest first — for the month picker. */
export function availableMonths(userId: number): string[] {
  const bounds = getDateBounds(userId);
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
