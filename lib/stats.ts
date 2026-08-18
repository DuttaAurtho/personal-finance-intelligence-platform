/**
 * Small numerical toolkit shared by the ML modules.
 *
 * Everything here favours *robust* estimators — median and MAD rather than
 * mean and standard deviation. Personal spending data is full of one-off
 * outliers (a holiday, a new laptop) and a mean-based model chases them,
 * producing forecasts that swing wildly after a single unusual month.
 */

export function sum(xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/**
 * Median absolute deviation, scaled by 1.4826 so that for normally distributed
 * data it estimates the same quantity as the standard deviation — but without
 * being dragged around by outliers.
 */
export function mad(xs: number[]): number {
  if (!xs.length) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Robust z-score. Falls back to stdev when every value is identical. */
export function robustZ(x: number, xs: number[]): number {
  const m = median(xs);
  let scale = mad(xs);
  if (scale < 1e-9) scale = stdev(xs);
  if (scale < 1e-9) return 0;
  return (x - m) / scale;
}

/** Coefficient of variation — spread relative to size. 0 = perfectly constant. */
export function coefficientOfVariation(xs: number[]): number {
  const m = Math.abs(mean(xs));
  if (m < 1e-9) return xs.length > 1 ? 1 : 0;
  return stdev(xs) / m;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/* ---------------------------------------------------------------------- */
/* Regression                                                              */
/* ---------------------------------------------------------------------- */

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination, 0..1 */
  r2: number;
}

/** Ordinary least squares on (index, value) pairs. */
export function linearRegression(ys: number[]): LinearFit {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };

  const xs = ys.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den < 1e-12 ? 0 : num / den;
  const intercept = my - slope * mx;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot < 1e-12 ? 0 : clamp(1 - ssRes / ssTot, 0, 1);

  return { slope, intercept, r2 };
}

/**
 * Ridge regression via the normal equations, solved with Gauss-Jordan
 * elimination on the (p+1)x(p+1) system. The L2 penalty is what makes this
 * usable on 12–24 monthly observations with a handful of correlated features;
 * plain OLS would overfit badly and produce absurd extrapolations.
 *
 * The intercept is not penalised, which is standard and matters here because
 * spending has a large non-zero baseline.
 */
export function ridgeRegression(X: number[][], y: number[], lambda = 1): number[] {
  const n = X.length;
  if (!n) return [];
  const p = X[0].length;

  // Design matrix with a leading intercept column.
  const A: number[][] = X.map((row) => [1, ...row]);
  const d = p + 1;

  // Normal equations: (AᵀA + λI)β = Aᵀy
  const AtA: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const Aty: number[] = new Array(d).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      Aty[j] += A[i][j] * y[i];
      for (let k = 0; k < d; k++) AtA[j][k] += A[i][j] * A[i][k];
    }
  }
  for (let j = 1; j < d; j++) AtA[j][j] += lambda; // skip the intercept

  return solve(AtA, Aty);
}

/** Gauss-Jordan with partial pivoting. Returns zeros if the system is singular. */
function solve(M: number[][], b: number[]): number[] {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-10) return new Array(n).fill(0);
    [A[col], A[pivot]] = [A[pivot], A[col]];

    const pv = A[col][col];
    for (let c = col; c <= n; c++) A[col][c] /= pv;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[n]);
}

export function predictRidge(beta: number[], features: number[]): number {
  if (!beta.length) return 0;
  let y = beta[0];
  for (let i = 0; i < features.length && i + 1 < beta.length; i++) y += beta[i + 1] * features[i];
  return y;
}

/* ---------------------------------------------------------------------- */
/* Exponential smoothing                                                   */
/* ---------------------------------------------------------------------- */

/**
 * Holt's linear trend method with damping.
 *
 * The damping factor φ < 1 is important for personal finance: an undamped
 * trend extrapolated from a few rising months predicts you will spend
 * infinity by next year. Damping pulls the trend back toward flat as the
 * horizon grows, which is both more accurate and more useful.
 */
export function holtLinear(
  series: number[],
  { alpha = 0.35, beta = 0.15, phi = 0.85, horizon = 1 } = {},
): number[] {
  if (!series.length) return new Array(horizon).fill(0);
  if (series.length === 1) return new Array(horizon).fill(series[0]);

  let level = series[0];
  let trend = series[1] - series[0];

  for (let t = 1; t < series.length; t++) {
    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  const out: number[] = [];
  let damped = 0;
  for (let h = 1; h <= horizon; h++) {
    damped += Math.pow(phi, h);
    out.push(level + damped * trend);
  }
  return out;
}

/** Simple exponentially weighted mean — the "no trend" baseline. */
export function exponentialMean(series: number[], alpha = 0.4): number {
  if (!series.length) return 0;
  let s = series[0];
  for (let i = 1; i < series.length; i++) s = alpha * series[i] + (1 - alpha) * s;
  return s;
}

/* ---------------------------------------------------------------------- */
/* Error metrics                                                           */
/* ---------------------------------------------------------------------- */

/** Mean absolute percentage error, ignoring zero actuals. */
export function mape(actual: number[], predicted: number[]): number | null {
  const pairs = actual.map((a, i) => [a, predicted[i]]).filter(([a]) => Math.abs(a) > 1e-9);
  if (!pairs.length) return null;
  return mean(pairs.map(([a, p]) => Math.abs((a - p) / a)));
}

export function rmse(actual: number[], predicted: number[]): number {
  if (!actual.length) return 0;
  return Math.sqrt(mean(actual.map((a, i) => (a - predicted[i]) ** 2)));
}

/**
 * Autocorrelation of a series at a given lag — used to spot a repeating
 * monthly rhythm in daily spending.
 */
export function autocorrelation(series: number[], lag: number): number {
  const n = series.length;
  if (lag <= 0 || lag >= n) return 0;
  const m = mean(series);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (series[i] - m) ** 2;
    if (i + lag < n) num += (series[i] - m) * (series[i + lag] - m);
  }
  return den < 1e-12 ? 0 : num / den;
}
