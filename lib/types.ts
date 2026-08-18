/**
 * Shared domain types.
 *
 * Money convention: every monetary value crossing a module boundary is an
 * INTEGER number of minor units (pence/cents). Floating point never touches a
 * balance. Sign convention: negative = money leaving the account (expense),
 * positive = money arriving (income). Fields carrying minor units are suffixed
 * `_minor` in the database and `Minor` in TypeScript so the unit is never
 * ambiguous at a call site.
 */

export type CategoryKind = "expense" | "income" | "transfer";

export interface User {
  id: number;
  email: string;
  name: string;
  currency: string;
  locale: string;
  created_at: string;
}

export interface Account {
  id: number;
  user_id: number;
  name: string;
  institution: string | null;
  type: "current" | "savings" | "credit" | "cash" | "investment";
  created_at: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  sort: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  account_id: number;
  /** ISO date, YYYY-MM-DD */
  date: string;
  description: string;
  /** Normalised merchant key used for grouping and recurrence detection */
  merchant: string;
  /** Signed minor units. Negative = expense. */
  amount_minor: number;
  category: string;
  /** 0..1 confidence from the categoriser; 1 when a human confirmed it */
  confidence: number;
  /** 1 when the user set the category by hand — these become training data */
  is_confirmed: number;
  is_transfer: number;
  notes: string | null;
  /** Stable fingerprint used to de-duplicate re-imported statements */
  fingerprint: string;
  batch_id: number | null;
  created_at: string;
}

export interface Budget {
  id: number;
  user_id: number;
  category: string;
  /** Positive minor units — the monthly ceiling */
  amount_minor: number;
  created_at: string;
}

export interface Rule {
  id: number;
  user_id: number;
  pattern: string;
  category: string;
  priority: number;
  created_at: string;
}

export interface ImportBatch {
  id: number;
  user_id: number;
  filename: string;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: number;
}

/* ---------------------------------------------------------------------- */
/* Analytics shapes                                                        */
/* ---------------------------------------------------------------------- */

export interface CategoryTotal {
  category: string;
  totalMinor: number;
  count: number;
  share: number;
}

export interface MonthlyPoint {
  /** YYYY-MM */
  month: string;
  spendMinor: number;
  incomeMinor: number;
  netMinor: number;
  count: number;
}

export interface RecurringSeries {
  merchant: string;
  label: string;
  category: string;
  /** Median gap between occurrences, in days */
  intervalDays: number;
  cadence: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly" | "irregular";
  /** Typical (median) amount, positive minor units */
  amountMinor: number;
  /** Coefficient of variation of the amount, 0 = perfectly fixed price */
  amountVariance: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  /** 0..1 — how confident we are that this is a genuine subscription */
  confidence: number;
  monthlyEquivalentMinor: number;
  status: "active" | "lapsed";
  transactionIds: number[];
}

export interface Forecast {
  month: string;
  predictedMinor: number;
  lowMinor: number;
  highMinor: number;
  /** Mean absolute percentage error from walk-forward backtesting */
  mape: number | null;
  method: string;
  contributions: { model: string; weight: number; predictionMinor: number }[];
  byCategory: { category: string; predictedMinor: number }[];
}

export type InsightTone = "positive" | "warning" | "critical" | "neutral";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;
  title: string;
  detail: string;
  /** Sorting weight — higher surfaces first */
  weight: number;
  href?: string;
}

export interface Anomaly {
  transactionId: number;
  date: string;
  description: string;
  category: string;
  amountMinor: number;
  /** Robust z-score against the category's own history */
  score: number;
  medianMinor: number;
}
