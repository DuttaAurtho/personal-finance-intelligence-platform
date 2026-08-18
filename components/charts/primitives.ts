/**
 * Chart primitives — scales, path building and the fixed mark specs.
 *
 * Charts are hand-built SVG rather than a charting library: it keeps the bundle
 * small, gives exact control over the mark specs below, and means the visual
 * language is identical everywhere instead of half-configured per chart.
 */

export const MARK = {
  /** Bars never fill their band — the leftover space is the separator. */
  maxBarThickness: 24,
  /** Rounded at the data end, square at the baseline. */
  barRadius: 4,
  lineWidth: 2,
  markerRadius: 4.5,
  /** Surface-coloured gap between touching marks. */
  gap: 2,
  areaOpacity: 0.1,
} as const;

/** The validated sequential ramp, darkest (largest) first. */
export const SEQ = [
  "var(--viz-seq-1)",
  "var(--viz-seq-2)",
  "var(--viz-seq-3)",
  "var(--viz-seq-4)",
  "var(--viz-seq-5)",
] as const;

export const SEQ_OTHER = "var(--viz-seq-other)";

export function seqColor(rank: number): string {
  return rank < SEQ.length ? SEQ[rank] : SEQ_OTHER;
}

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/**
 * Pick axis ticks that land on numbers a human would write — 0, 500, 1,000 —
 * rather than the raw data extremes.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const step = (normalised >= 5 ? 10 : normalised >= 2 ? 5 : normalised >= 1 ? 2 : 1) * magnitude;

  const ticks: number[] = [];
  for (let v = 0; v <= max * 1.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Round the axis maximum up to the last tick so the plot doesn't clip. */
export function niceMax(max: number, count = 4): number {
  const ticks = niceTicks(max, count);
  return ticks[ticks.length - 1] || 1;
}

/**
 * Catmull-Rom smoothed path. Real spending is spiky, so smoothing is kept
 * gentle (tension 0.5 on a monotone-safe formulation) — enough to look
 * considered, not so much that it invents peaks that aren't in the data.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  return d;
}

export function linePath(points: { x: number; y: number }[]): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i ? "L" : "M"} ${round(p.x)} ${round(p.y)}`).join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A rectangle rounded only at the data end — the bar spec. `vertical` bars
 * round the top; horizontal bars round the right.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r = MARK.barRadius,
  orientation: "vertical" | "horizontal" = "vertical",
): string {
  if (w <= 0 || h <= 0) return "";
  const radius = Math.min(r, orientation === "vertical" ? w / 2 : h / 2, orientation === "vertical" ? h : w);
  if (radius <= 0.5) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;

  if (orientation === "vertical") {
    return [
      `M ${round(x)} ${round(y + h)}`,
      `V ${round(y + radius)}`,
      `Q ${round(x)} ${round(y)} ${round(x + radius)} ${round(y)}`,
      `H ${round(x + w - radius)}`,
      `Q ${round(x + w)} ${round(y)} ${round(x + w)} ${round(y + radius)}`,
      `V ${round(y + h)}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${round(x)} ${round(y)}`,
    `H ${round(x + w - radius)}`,
    `Q ${round(x + w)} ${round(y)} ${round(x + w)} ${round(y + radius)}`,
    `V ${round(y + h - radius)}`,
    `Q ${round(x + w)} ${round(y + h)} ${round(x + w - radius)} ${round(y + h)}`,
    `H ${round(x)}`,
    "Z",
  ].join(" ");
}

/** Nearest data index to a pointer position along the x axis. */
export function nearestIndex(xs: number[], pointerX: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - pointerX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
