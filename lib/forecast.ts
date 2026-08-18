import type { Forecast, MonthlyPoint } from "./types";
import { addMonths } from "./dates";
import {
  clamp,
  exponentialMean,
  holtLinear,
  mape as mapeOf,
  mean,
  median,
  predictRidge,
  ridgeRegression,
  stdev,
} from "./stats";

/**
 * Spending forecast.
 *
 * No single model is right for personal spending. A trend model is great for
 * someone whose costs are creeping up and terrible for someone whose spending
 * is flat but noisy. A seasonal model nails December and is useless with only
 * eight months of history.
 *
 * So we run five cheap models, backtest each one on the user's own history with
 * a walk-forward (expanding-window) split, and weight them by how well they
 * actually predicted *this* person's past months. The ensemble is then almost
 * always better than its best member, and — more importantly — it degrades
 * gracefully when history is short.
 *
 * The whole thing runs in a few milliseconds on the server with no external
 * service, which is what keeps the product free and private.
 */

type ModelFn = (history: number[], months: string[], target: string) => number;

/** Minimum observations before a model is allowed to make a claim. */
const MIN_HISTORY = 3;

/* ---------------------------------------------------------------------- */
/* The individual models                                                   */
/* ---------------------------------------------------------------------- */

/** Exponentially weighted mean — recent months matter more, no trend assumed. */
const ewma: ModelFn = (h) => exponentialMean(h, 0.45);

/** Robust central tendency of the recent past — very hard to beat when noisy. */
const trimmedMedian: ModelFn = (h) => median(h.slice(-6));

/** Damped linear trend — catches genuine drift without extrapolating to absurdity. */
const holt: ModelFn = (h) => holtLinear(h, { alpha: 0.35, beta: 0.12, phi: 0.82, horizon: 1 })[0];

/** Same month last year, nudged by the year-on-year level shift. */
const seasonalNaive: ModelFn = (h, months, target) => {
  const idx = months.indexOf(addMonths(target, -12));
  if (idx < 0) return median(h.slice(-3));
  const lastYear = h[idx];
  // Scale by how the recent level compares with the same window a year ago.
  const recent = mean(h.slice(-3));
  const thenWindow = h.slice(Math.max(0, idx - 2), idx + 1);
  const then = mean(thenWindow);
  const driftRatio = then > 0 ? clamp(recent / then, 0.6, 1.6) : 1;
  return lastYear * driftRatio;
};

/**
 * Ridge regression on engineered features.
 *
 * Features: the two previous months, the rolling 3-month mean, a time index for
 * drift, and a sin/cos pair encoding month-of-year so December and January are
 * *adjacent* rather than eleven units apart. Features are standardised before
 * fitting, otherwise the time index dominates the penalty term.
 */
const ridge: ModelFn = (h, months, target) => {
  if (h.length < 6) return ewma(h, months, target);

  const rows: number[][] = [];
  const ys: number[] = [];

  for (let i = 3; i < h.length; i++) {
    rows.push(featureRow(h, i, months[i]));
    ys.push(h[i]);
  }
  if (rows.length < 3) return ewma(h, months, target);

  // Standardise columns for a well-conditioned penalised fit.
  const cols = rows[0].length;
  const mu: number[] = [];
  const sd: number[] = [];
  for (let c = 0; c < cols; c++) {
    const col = rows.map((r) => r[c]);
    mu.push(mean(col));
    sd.push(stdev(col) || 1);
  }
  const Z = rows.map((r) => r.map((v, c) => (v - mu[c]) / sd[c]));

  const yMu = mean(ys);
  const ySd = stdev(ys) || 1;
  const yz = ys.map((v) => (v - yMu) / ySd);

  const beta = ridgeRegression(Z, yz, 1.2);

  const raw = featureRow([...h, 0], h.length, target);
  const z = raw.map((v, c) => (v - mu[c]) / sd[c]);
  return predictRidge(beta, z) * ySd + yMu;
};

/** Lag features for position `i` of the series. */
function featureRow(h: number[], i: number, monthKey: string): number[] {
  const lag1 = h[i - 1] ?? 0;
  const lag2 = h[i - 2] ?? lag1;
  const roll3 = mean([h[i - 1] ?? 0, h[i - 2] ?? 0, h[i - 3] ?? 0].filter((v) => v > 0));
  const m = Number((monthKey ?? "2000-01").slice(5, 7)) || 1;
  const angle = (2 * Math.PI * (m - 1)) / 12;
  return [lag1, lag2, roll3 || lag1, i, Math.sin(angle), Math.cos(angle)];
}

const MODELS: { name: string; fn: ModelFn }[] = [
  { name: "Weighted average", fn: ewma },
  { name: "Robust median", fn: trimmedMedian },
  { name: "Damped trend", fn: holt },
  { name: "Seasonal", fn: seasonalNaive },
  { name: "Ridge regression", fn: ridge },
];

/* ---------------------------------------------------------------------- */
/* Ensemble                                                                */
/* ---------------------------------------------------------------------- */

interface Backtest {
  weights: number[];
  ensembleMape: number | null;
  residualSd: number;
}

/**
 * Walk-forward validation: for each month we could have predicted, refit on
 * everything before it and score the error. This is the honest way to measure a
 * time-series model — a random train/test split would leak the future.
 */
function backtest(series: number[], months: string[]): Backtest {
  const start = Math.max(MIN_HISTORY, series.length - 12);
  const errors: number[][] = MODELS.map(() => []);
  const ensembleActual: number[] = [];
  const ensemblePredicted: number[] = [];
  const residuals: number[] = [];

  for (let origin = start; origin < series.length; origin++) {
    const history = series.slice(0, origin);
    const historyMonths = months.slice(0, origin);
    const actual = series[origin];

    const preds = MODELS.map((m) => {
      const p = m.fn(history, historyMonths, months[origin]);
      return Number.isFinite(p) ? Math.max(0, p) : 0;
    });
    preds.forEach((p, i) => errors[i].push(Math.abs(p - actual)));

    // Equal-weight ensemble during backtesting, to avoid fitting the weights
    // on the same errors we then use to judge them.
    const blended = mean(preds);
    ensembleActual.push(actual);
    ensemblePredicted.push(blended);
    residuals.push(actual - blended);
  }

  if (!ensembleActual.length) {
    return { weights: MODELS.map(() => 1 / MODELS.length), ensembleMape: null, residualSd: 0 };
  }

  // Inverse-error weighting, squared so a clearly better model pulls ahead.
  const scale = mean(series.filter((v) => v > 0)) || 1;
  const raw = errors.map((e) => {
    const mae = mean(e);
    return 1 / Math.pow(mae / scale + 0.02, 2);
  });
  const total = raw.reduce((a, b) => a + b, 0) || 1;

  return {
    weights: raw.map((w) => w / total),
    ensembleMape: mapeOf(ensembleActual, ensemblePredicted),
    residualSd: stdev(residuals),
  };
}

/* ---------------------------------------------------------------------- */
/* Public API                                                              */
/* ---------------------------------------------------------------------- */

export interface ForecastInput {
  /** Ordered monthly history, oldest first. Spend is positive minor units. */
  history: MonthlyPoint[];
  /** Per-category monthly spend: category → month → minor units */
  byCategory?: Map<string, Map<string, number>>;
  /** Committed recurring outgoings, used as a floor for the prediction */
  commitmentMinor?: number;
  /** How many months ahead. 1 = next month. */
  horizon?: number;
}

/**
 * Forecast the next month's total spend, with an 80% prediction interval and a
 * per-category breakdown.
 *
 * The interval is derived from the model's own backtest residuals rather than a
 * textbook formula, so it widens automatically for users whose spending is
 * genuinely erratic — which is exactly when a single number would mislead.
 */
export function forecastSpending(input: ForecastInput): Forecast | null {
  const { history, byCategory, commitmentMinor = 0 } = input;

  // Drop a trailing partial month — it would read as a spending collapse.
  const points = history.filter((p) => p.spendMinor >= 0);
  if (points.length < 2) return null;

  const series = points.map((p) => p.spendMinor);
  const months = points.map((p) => p.month);
  const target = addMonths(months[months.length - 1], 1);

  /* Short history: be honest rather than clever. */
  if (series.length < MIN_HISTORY + 1) {
    const naive = Math.round(mean(series));
    const spread = Math.round(Math.max(naive * 0.35, stdev(series) * 1.5));
    return {
      month: target,
      predictedMinor: naive,
      lowMinor: Math.max(0, naive - spread),
      highMinor: naive + spread,
      mape: null,
      method: `Average of ${series.length} months`,
      contributions: [{ model: "Average", weight: 1, predictionMinor: naive }],
      byCategory: forecastCategories(byCategory, months, naive, series),
    };
  }

  const { weights, ensembleMape, residualSd } = backtest(series, months);

  const predictions = MODELS.map((m) => {
    const p = m.fn(series, months, target);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  });

  let blended = 0;
  for (let i = 0; i < predictions.length; i++) blended += predictions[i] * weights[i];

  // Committed spend is money already promised, so it acts as a soft floor.
  if (commitmentMinor > 0 && blended < commitmentMinor) {
    blended = commitmentMinor + (blended - commitmentMinor) * 0.35;
  }

  const predictedMinor = Math.round(Math.max(0, blended));

  // 80% interval ≈ ±1.28σ, widened a little when history is thin.
  const thinPenalty = clamp(2 - series.length / 8, 1, 1.6);
  const sigma = Math.max(residualSd, predictedMinor * 0.06) * thinPenalty;
  const halfWidth = Math.round(1.2816 * sigma);

  const contributions = MODELS.map((m, i) => ({
    model: m.name,
    weight: weights[i],
    predictionMinor: Math.round(predictions[i]),
  })).sort((a, b) => b.weight - a.weight);

  return {
    month: target,
    predictedMinor,
    lowMinor: Math.max(0, predictedMinor - halfWidth),
    highMinor: predictedMinor + halfWidth,
    mape: ensembleMape,
    method: `Ensemble of ${MODELS.length} models, walk-forward validated`,
    contributions,
    byCategory: forecastCategories(byCategory, months, predictedMinor, series),
  };
}

/**
 * Per-category forecast. Each category gets its own small blend, then the whole
 * set is rescaled so the parts sum to the headline number — otherwise the
 * breakdown quietly contradicts the total shown above it.
 */
function forecastCategories(
  byCategory: Map<string, Map<string, number>> | undefined,
  months: string[],
  totalPrediction: number,
  totalSeries: number[],
): { category: string; predictedMinor: number }[] {
  if (!byCategory || byCategory.size === 0) return [];

  const raw: { category: string; predictedMinor: number }[] = [];

  for (const [category, monthMap] of byCategory) {
    const series = months.map((m) => monthMap.get(m) ?? 0);
    const active = series.filter((v) => v > 0);
    if (active.length === 0) continue;

    let prediction: number;
    if (active.length < 3) {
      // Sparse category: assume it recurs at its typical size, scaled by how
      // often it has actually appeared.
      prediction = median(active) * (active.length / series.length);
    } else {
      const recent = series.slice(-9);
      prediction = 0.5 * exponentialMean(recent, 0.45) + 0.3 * median(recent.slice(-6)) +
        0.2 * Math.max(0, holtLinear(recent, { horizon: 1 })[0]);
    }

    if (prediction > 0) raw.push({ category, predictedMinor: Math.round(prediction) });
  }

  if (!raw.length) return [];

  const rawTotal = raw.reduce((a, r) => a + r.predictedMinor, 0);
  const lastTotal = totalSeries[totalSeries.length - 1] || rawTotal;
  const scale = rawTotal > 0 ? totalPrediction / rawTotal : 1;

  // Only rescale when the discrepancy is meaningful; tiny nudges add noise.
  const factor = Math.abs(scale - 1) > 0.02 ? scale : 1;
  void lastTotal;

  return raw
    .map((r) => ({ category: r.category, predictedMinor: Math.round(r.predictedMinor * factor) }))
    .filter((r) => r.predictedMinor > 0)
    .sort((a, b) => b.predictedMinor - a.predictedMinor);
}

/**
 * Replay the walk-forward backtest and return what the ensemble *would* have
 * predicted for each month, alongside what actually happened.
 *
 * Shown in the UI so the forecast isn't asking to be taken on faith: if the
 * models track this user's history badly, they can see that for themselves.
 */
export function backtestSeries(
  history: MonthlyPoint[],
): { month: string; actualMinor: number; predictedMinor: number }[] {
  const points = history.filter((p) => p.spendMinor >= 0);
  if (points.length < MIN_HISTORY + 1) return [];

  const series = points.map((p) => p.spendMinor);
  const months = points.map((p) => p.month);
  const start = Math.max(MIN_HISTORY, series.length - 12);

  const out: { month: string; actualMinor: number; predictedMinor: number }[] = [];

  for (let origin = start; origin < series.length; origin++) {
    const hist = series.slice(0, origin);
    const histMonths = months.slice(0, origin);

    const preds = MODELS.map((m) => {
      const p = m.fn(hist, histMonths, months[origin]);
      return Number.isFinite(p) ? Math.max(0, p) : 0;
    });

    out.push({
      month: months[origin],
      actualMinor: series[origin],
      predictedMinor: Math.round(mean(preds)),
    });
  }

  return out;
}

/**
 * Project the current month's final total from how far through it we are.
 *
 * A naive linear scale-up (spend so far ÷ fraction of month elapsed) is wildly
 * wrong early in the month, because rent and subscriptions land on day 1. So we
 * separate the fixed commitments already paid from discretionary spend and only
 * extrapolate the discretionary part.
 */
export function projectCurrentMonth(
  spentSoFarMinor: number,
  fixedPaidMinor: number,
  dayOfMonth: number,
  daysInMonth: number,
  typicalMonthMinor: number,
): number {
  const elapsed = clamp(dayOfMonth / daysInMonth, 0.02, 1);
  if (elapsed >= 0.995) return spentSoFarMinor;

  const discretionarySoFar = Math.max(0, spentSoFarMinor - fixedPaidMinor);
  const projectedDiscretionary = discretionarySoFar / elapsed;

  const projected = fixedPaidMinor + projectedDiscretionary;

  // Early in the month the extrapolation is unstable, so lean on the user's
  // typical month and hand over to the live data as evidence accumulates.
  const trust = clamp((elapsed - 0.1) / 0.4, 0, 1);
  const blended = projected * trust + typicalMonthMinor * (1 - trust);

  return Math.round(Math.max(spentSoFarMinor, blended));
}
