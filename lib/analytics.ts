import { all, get } from "./db";
import type {
  Anomaly,
  CategoryTotal,
  MonthlyPoint,
  Transaction,
} from "./types";
import { categoryKind } from "./categories";
import { currentMonth, daysInMonth, monthRange, todayISO } from "./dates";
import { median, robustZ } from "./stats";

/**
 * Aggregation layer.
 *
 * Everything that can be expressed as SQL is expressed as SQL — SQLite is far
 * faster at grouping ten thousand rows than JavaScript is, and it keeps memory
 * flat as a user's history grows.
 *
 * Transfers are excluded from every spend and income figure. Moving £500 from a
 * current account into savings is not expenditure, and counting it as such is
 * the single most common way finance dashboards lie to people.
 */

const NOT_TRANSFER = "is_transfer = 0";

/* ---------------------------------------------------------------------- */
/* Transaction queries                                                     */
/* ---------------------------------------------------------------------- */

export interface TransactionFilters {
  q?: string;
  category?: string;
  accountId?: number;
  from?: string;
  to?: string;
  direction?: "in" | "out" | "all";
  minMinor?: number;
  maxMinor?: number;
  includeTransfers?: boolean;
  uncategorisedOnly?: boolean;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  limit?: number;
  offset?: number;
}

function buildWhere(userId: number, f: TransactionFilters) {
  const clauses: string[] = ["t.user_id = ?"];
  const params: unknown[] = [userId];

  if (f.q) {
    clauses.push("(t.description LIKE ? OR t.merchant LIKE ? OR t.category LIKE ? OR t.notes LIKE ?)");
    const like = `%${f.q.trim()}%`;
    params.push(like, like, like, like);
  }
  if (f.category) {
    clauses.push("t.category = ?");
    params.push(f.category);
  }
  if (f.accountId) {
    clauses.push("t.account_id = ?");
    params.push(f.accountId);
  }
  if (f.from) {
    clauses.push("t.date >= ?");
    params.push(f.from);
  }
  if (f.to) {
    clauses.push("t.date <= ?");
    params.push(f.to);
  }
  if (f.direction === "in") clauses.push("t.amount_minor > 0");
  if (f.direction === "out") clauses.push("t.amount_minor < 0");
  if (!f.includeTransfers) clauses.push("t." + NOT_TRANSFER);
  if (f.uncategorisedOnly) clauses.push("(t.category = 'Uncategorised' OR t.confidence < 0.6)");
  if (typeof f.minMinor === "number") {
    clauses.push("ABS(t.amount_minor) >= ?");
    params.push(f.minMinor);
  }
  if (typeof f.maxMinor === "number") {
    clauses.push("ABS(t.amount_minor) <= ?");
    params.push(f.maxMinor);
  }

  return { where: clauses.join(" AND "), params };
}

const SORTS: Record<string, string> = {
  date_desc: "t.date DESC, t.id DESC",
  date_asc: "t.date ASC, t.id ASC",
  amount_desc: "ABS(t.amount_minor) DESC",
  amount_asc: "ABS(t.amount_minor) ASC",
};

export interface TransactionPage {
  rows: (Transaction & { account_name: string })[];
  total: number;
  sumMinor: number;
}

export async function queryTransactions(userId: number, f: TransactionFilters = {}): Promise<TransactionPage> {
  const { where, params } = buildWhere(userId, f);
  const order = SORTS[f.sort ?? "date_desc"] ?? SORTS.date_desc;
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);

  const [rows, agg] = await Promise.all([
    all<Transaction & { account_name: string }>(
      `SELECT t.*, a.name AS account_name
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ? OFFSET ?`,
      ...params,
      limit,
      offset,
    ),
    get<{ n: number; s: number | null }>(
      `SELECT COUNT(*) AS n, SUM(t.amount_minor) AS s FROM transactions t WHERE ${where}`,
      ...params,
    ),
  ]);

  return { rows, total: agg?.n ?? 0, sumMinor: agg?.s ?? 0 };
}

export function getTransaction(userId: number, id: number): Promise<Transaction | undefined> {
  return get<Transaction>("SELECT * FROM transactions WHERE user_id = ? AND id = ?", userId, id);
}

export function allTransactions(userId: number): Promise<Transaction[]> {
  return all<Transaction>(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC",
    userId,
  );
}

/* ---------------------------------------------------------------------- */
/* Time series                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Monthly spend/income history. Months with no activity are filled with zeros
 * so that charts and the forecaster see an unbroken series — a missing month
 * would silently shift every lag feature by one.
 */
export async function getMonthlySeries(userId: number, monthsBack = 24): Promise<MonthlyPoint[]> {
  const rows = await all<{ month: string; spend: number; income: number; n: number }>(
    `SELECT substr(date, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN amount_minor < 0 THEN -amount_minor ELSE 0 END), 0) AS spend,
            COALESCE(SUM(CASE WHEN amount_minor > 0 THEN  amount_minor ELSE 0 END), 0) AS income,
            COUNT(*) AS n
       FROM transactions
      WHERE user_id = ? AND ${NOT_TRANSFER}
      GROUP BY month
      ORDER BY month ASC`,
    userId,
  );

  if (!rows.length) return [];

  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const first = rows[0].month;
  const last = currentMonth() > rows[rows.length - 1].month ? currentMonth() : rows[rows.length - 1].month;

  const full = monthRange(first, last).map((month) => {
    const r = byMonth.get(month);
    return {
      month,
      spendMinor: r?.spend ?? 0,
      incomeMinor: r?.income ?? 0,
      netMinor: (r?.income ?? 0) - (r?.spend ?? 0),
      count: r?.n ?? 0,
    };
  });

  return full.slice(-monthsBack);
}

/** Per-category monthly spend, shaped for the forecaster. */
export async function getCategoryMonthlyMap(userId: number): Promise<Map<string, Map<string, number>>> {
  const rows = await all<{ category: string; month: string; total: number }>(
    `SELECT category, substr(date, 1, 7) AS month, SUM(-amount_minor) AS total
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND ${NOT_TRANSFER}
      GROUP BY category, month`,
    userId,
  );

  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let inner = map.get(r.category);
    if (!inner) {
      inner = new Map();
      map.set(r.category, inner);
    }
    inner.set(r.month, r.total);
  }
  return map;
}

/** Daily spend totals across a date range, zero-filled. */
export function getDailySeries(userId: number, from: string, to: string) {
  const rows = all<{ date: string; total: number }>(
    `SELECT date, SUM(-amount_minor) AS total
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND ${NOT_TRANSFER} AND date BETWEEN ? AND ?
      GROUP BY date ORDER BY date ASC`,
    userId,
    from,
    to,
  );
  return rows;
}

/* ---------------------------------------------------------------------- */
/* Category breakdown                                                      */
/* ---------------------------------------------------------------------- */

export async function getCategoryTotals(
  userId: number,
  from: string,
  to: string,
  kind: "expense" | "income" = "expense",
): Promise<CategoryTotal[]> {
  const sign = kind === "expense" ? "amount_minor < 0" : "amount_minor > 0";
  const rows = await all<{ category: string; total: number; n: number }>(
    `SELECT category, SUM(ABS(amount_minor)) AS total, COUNT(*) AS n
       FROM transactions
      WHERE user_id = ? AND ${sign} AND ${NOT_TRANSFER} AND date BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total DESC`,
    userId,
    from,
    to,
  );

  const grand = rows.reduce((a, r) => a + r.total, 0) || 1;
  return rows.map((r) => ({
    category: r.category,
    totalMinor: r.total,
    count: r.n,
    share: r.total / grand,
  }));
}

/** Biggest merchants by spend in a window. */
export function getTopMerchants(userId: number, from: string, to: string, limit = 8) {
  return all<{ merchant: string; total: number; n: number; category: string }>(
    `SELECT merchant,
            SUM(-amount_minor) AS total,
            COUNT(*) AS n,
            MIN(category) AS category
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND ${NOT_TRANSFER}
        AND date BETWEEN ? AND ? AND merchant != ''
      GROUP BY merchant
      ORDER BY total DESC
      LIMIT ?`,
    userId,
    from,
    to,
    limit,
  );
}

/* ---------------------------------------------------------------------- */
/* Headline figures                                                        */
/* ---------------------------------------------------------------------- */

export interface Kpis {
  spendMinor: number;
  incomeMinor: number;
  netMinor: number;
  savingsRate: number | null;
  transactionCount: number;
  avgTransactionMinor: number;
  largestMinor: number;
  dailyAverageMinor: number;
  noSpendDays: number;
}

export async function getKpis(userId: number, from: string, to: string): Promise<Kpis> {
  const r = await get<{
    spend: number | null;
    income: number | null;
    n: number;
    largest: number | null;
    days: number | null;
  }>(
    `SELECT SUM(CASE WHEN amount_minor < 0 THEN -amount_minor ELSE 0 END) AS spend,
            SUM(CASE WHEN amount_minor > 0 THEN  amount_minor ELSE 0 END) AS income,
            COUNT(*) AS n,
            MAX(CASE WHEN amount_minor < 0 THEN -amount_minor ELSE 0 END) AS largest,
            COUNT(DISTINCT CASE WHEN amount_minor < 0 THEN date END) AS days
       FROM transactions
      WHERE user_id = ? AND ${NOT_TRANSFER} AND date BETWEEN ? AND ?`,
    userId,
    from,
    to,
  );

  const spendMinor = r?.spend ?? 0;
  const incomeMinor = r?.income ?? 0;
  const netMinor = incomeMinor - spendMinor;
  const spendingDays = r?.days ?? 0;

  // Elapsed days, capped at today so a mid-month view isn't diluted by the future.
  const end = to > todayISO() ? todayISO() : to;
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000) + 1);

  return {
    spendMinor,
    incomeMinor,
    netMinor,
    savingsRate: incomeMinor > 0 ? netMinor / incomeMinor : null,
    transactionCount: r?.n ?? 0,
    avgTransactionMinor: r?.n ? Math.round(spendMinor / Math.max(1, r.n)) : 0,
    largestMinor: r?.largest ?? 0,
    dailyAverageMinor: Math.round(spendMinor / span),
    noSpendDays: Math.max(0, span - spendingDays),
  };
}

/* ---------------------------------------------------------------------- */
/* Budgets                                                                 */
/* ---------------------------------------------------------------------- */

export interface BudgetStatus {
  category: string;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usage: number;
  /** Straight-line projection to month end based on days elapsed */
  projectedMinor: number;
  state: "under" | "on-track" | "at-risk" | "over";
}

export async function getBudgetStatus(
  userId: number,
  month = currentMonth(),
  /**
   * Per-category spend this month that came from recurring fixed payments.
   * Those are already-settled commitments, not a rate to extrapolate, so they
   * are held flat while only the discretionary remainder is scaled up.
   */
  fixedPaidByCategory?: Map<string, number>,
): Promise<BudgetStatus[]> {
  const budgets = await all<{ category: string; amount_minor: number }>(
    "SELECT category, amount_minor FROM budgets WHERE user_id = ? ORDER BY amount_minor DESC",
    userId,
  );
  if (!budgets.length) return [];

  const spendRows = await all<{ category: string; total: number; n: number }>(
    `SELECT category, SUM(-amount_minor) AS total, COUNT(*) AS n
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND ${NOT_TRANSFER} AND substr(date,1,7) = ?
      GROUP BY category`,
    userId,
    month,
  );
  const spent = new Map(spendRows.map((r) => [r.category, r.total]));
  const txCount = new Map(spendRows.map((r) => [r.category, r.n]));

  const total = daysInMonth(month);
  const today = todayISO();
  const elapsed =
    today.slice(0, 7) === month ? Number(today.slice(8, 10)) : today.slice(0, 7) > month ? total : 0;
  const fraction = Math.max(elapsed / total, 0.001);

  return budgets.map((b) => {
    const spentMinor = spent.get(b.category) ?? 0;
    const usage = b.amount_minor > 0 ? spentMinor / b.amount_minor : 0;

    // Scaling spend-so-far by the fraction of the month elapsed assumes the
    // spending is a steady trickle. That holds for groceries and is badly wrong
    // for fixed commitments: rent paid on the 1st, or five monthly utility
    // bills, would each be projected to nearly double by month end and the
    // dashboard would announce an overshoot that cannot happen. So the
    // recurring portion is held flat and only the discretionary rest is scaled.
    //
    // Without a recurring breakdown, fall back to transaction count — a
    // category carried by one or two payments has no rate worth extrapolating.
    const fixedPaid = Math.min(spentMinor, fixedPaidByCategory?.get(b.category) ?? 0);
    const variableSoFar = Math.max(0, spentMinor - fixedPaid);

    let projectedMinor: number;
    if (elapsed <= 0) {
      projectedMinor = spentMinor;
    } else if (fixedPaidByCategory) {
      projectedMinor = Math.round(fixedPaid + variableSoFar / fraction);
    } else {
      projectedMinor =
        (txCount.get(b.category) ?? 0) >= 3 ? Math.round(spentMinor / fraction) : spentMinor;
    }

    let state: BudgetStatus["state"];
    // Spend landing exactly on the ceiling is fully used, not exceeded — only
    // genuinely going past it counts as "over".
    if (usage > 1.001) state = "over";
    else if (projectedMinor > b.amount_minor * 1.05) state = "at-risk";
    else if (usage > 0.75) state = "on-track";
    else state = "under";

    return {
      category: b.category,
      budgetMinor: b.amount_minor,
      spentMinor,
      remainingMinor: b.amount_minor - spentMinor,
      usage,
      projectedMinor,
      state,
    };
  });
}

/* ---------------------------------------------------------------------- */
/* Anomalies                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Unusually large transactions, judged against the user's own history for that
 * same category. A £90 restaurant bill is an outlier for most people and
 * completely normal for some, which is why this compares like with like rather
 * than using a fixed threshold.
 */
export function detectAnomalies(
  transactions: Transaction[],
  { minScore = 3.5, lookbackDays = 90, today = todayISO() } = {},
): Anomaly[] {
  const byCategory = new Map<string, number[]>();
  for (const t of transactions) {
    if (t.amount_minor >= 0 || t.is_transfer) continue;
    if (categoryKind(t.category) !== "expense") continue;
    const list = byCategory.get(t.category);
    if (list) list.push(-t.amount_minor);
    else byCategory.set(t.category, [-t.amount_minor]);
  }

  const cutoff = new Date(Date.parse(today) - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const out: Anomaly[] = [];

  for (const t of transactions) {
    if (t.amount_minor >= 0 || t.is_transfer || t.date < cutoff) continue;
    const population = byCategory.get(t.category);
    // Need a real distribution before calling anything unusual.
    if (!population || population.length < 8) continue;

    const amount = -t.amount_minor;
    const score = robustZ(amount, population);
    if (score < minScore) continue;

    out.push({
      transactionId: t.id,
      date: t.date,
      description: t.description,
      category: t.category,
      amountMinor: amount,
      score,
      medianMinor: Math.round(median(population)),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

/* ---------------------------------------------------------------------- */
/* Misc                                                                    */
/* ---------------------------------------------------------------------- */

export async function getDateBounds(userId: number): Promise<{ min: string; max: string } | null> {
  const r = await get<{ min: string | null; max: string | null }>(
    "SELECT MIN(date) AS min, MAX(date) AS max FROM transactions WHERE user_id = ?",
    userId,
  );
  if (!r?.min || !r?.max) return null;
  return { min: r.min, max: r.max };
}

export async function countTransactions(userId: number): Promise<number> {
  const r = await get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?", userId);
  return r?.n ?? 0;
}

/** Spend split by weekday vs weekend — a reliably surprising statistic. */
export async function weekdayProfile(userId: number, from: string, to: string) {
  const rows = await all<{ dow: string; total: number; n: number }>(
    `SELECT strftime('%w', date) AS dow, SUM(-amount_minor) AS total, COUNT(*) AS n
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND ${NOT_TRANSFER} AND date BETWEEN ? AND ?
      GROUP BY dow ORDER BY dow`,
    userId,
    from,
    to,
  );
  const map = new Map(rows.map((r) => [Number(r.dow), r]));
  return Array.from({ length: 7 }, (_, i) => ({
    dow: i,
    totalMinor: map.get(i)?.total ?? 0,
    count: map.get(i)?.n ?? 0,
  }));
}
