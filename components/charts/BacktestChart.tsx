"use client";

import { useMemo, useState } from "react";
import { formatAxis, formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { MARK, linearScale, nearestIndex, niceMax, niceTicks, smoothPath } from "./primitives";

export interface BacktestPoint {
  month: string;
  actualMinor: number;
  predictedMinor: number;
}

const W = 840;
const PAD = { top: 18, right: 20, bottom: 34, left: 60 };

/**
 * Backtest chart: what the ensemble predicted for each past month, against what
 * actually happened.
 *
 * Two series on one shared money axis, using the validated categorical pair
 * with a legend — the honest way to show a model's track record, since the gap
 * between the lines *is* the error.
 */
export default function BacktestChart({
  points,
  currency,
  height = 260,
}: {
  points: BacktestPoint[];
  currency: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const peak = Math.max(...points.flatMap((p) => [p.actualMinor, p.predictedMinor]), 1);
    const max = niceMax(peak, 4);
    const x = linearScale([0, Math.max(1, points.length - 1)], [PAD.left, PAD.left + plotW]);
    const y = linearScale([0, max], [PAD.top + plotH, PAD.top]);
    return {
      ticks: niceTicks(max, 4),
      x,
      y,
      xs: points.map((_, i) => x(i)),
      actual: points.map((p, i) => ({ x: x(i), y: y(p.actualMinor) })),
      predicted: points.map((p, i) => ({ x: x(i), y: y(p.predictedMinor) })),
    };
  }, [points, plotW, plotH]);

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-subtle">
        Not enough history to backtest yet — this needs at least four closed months.
      </p>
    );
  }

  const { ticks, x, y, xs, actual, predicted } = model;
  const baseline = PAD.top + plotH;
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Model predictions compared with actual spending for each past month"
        className="block overflow-visible"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(nearestIndex(xs, ((e.clientX - rect.left) / rect.width) * W));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)}
              stroke="var(--viz-grid)" strokeWidth={1}
            />
            <text
              x={PAD.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle"
              fontSize={11} fill="var(--viz-ink)" style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatAxis(t, currency)}
            </text>
          </g>
        ))}

        {/* Error ribbons make the miss on each month visible at a glance */}
        {points.map((p, i) => (
          <line
            key={p.month}
            x1={x(i)} x2={x(i)}
            y1={y(p.actualMinor)} y2={y(p.predictedMinor)}
            stroke="var(--viz-ink)" strokeWidth={1} opacity={0.25}
          />
        ))}

        <path
          d={smoothPath(predicted)}
          fill="none"
          stroke="var(--viz-series-b)"
          strokeWidth={MARK.lineWidth}
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
        <path
          d={smoothPath(actual)}
          fill="none"
          stroke="var(--viz-series-a)"
          strokeWidth={MARK.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <line
          x1={PAD.left} x2={PAD.left + plotW} y1={baseline} y2={baseline}
          stroke="var(--viz-axis)" strokeWidth={1}
        />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.month}
              x={x(i)} y={baseline + 18} textAnchor="middle"
              fontSize={11} fill="var(--viz-ink)"
            >
              {formatMonth(p.month, true).replace(" 20", " ")}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <>
            <line
              x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline}
              stroke="var(--viz-axis)" strokeWidth={1}
            />
            <circle
              cx={x(hover)} cy={y(points[hover].actualMinor)} r={MARK.markerRadius}
              fill="var(--viz-series-a)" stroke="var(--surface)" strokeWidth={MARK.gap}
            />
            <circle
              cx={x(hover)} cy={y(points[hover].predictedMinor)} r={MARK.markerRadius}
              fill="var(--viz-series-b)" stroke="var(--surface)" strokeWidth={MARK.gap}
            />
          </>
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 pl-14 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--viz-series-a)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          What you actually spent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line
              x1="0" y1="4" x2="18" y2="4" stroke="var(--viz-series-b)"
              strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round"
            />
          </svg>
          What the model would have predicted
        </span>
      </figcaption>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-20 -translate-x-1/2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="mb-1 font-semibold text-fg">{formatMonth(points[hover].month)}</div>
          <div className="flex justify-between gap-4 text-muted">
            <span>Actual</span>
            <span className="font-medium tabular-nums text-fg">
              {formatMoney(points[hover].actualMinor, currency)}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-muted">
            <span>Predicted</span>
            <span className="font-medium tabular-nums text-fg">
              {formatMoney(points[hover].predictedMinor, currency)}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-muted">
            <span>Miss</span>
            <span className="font-semibold tabular-nums text-fg">
              {formatMoney(
                Math.abs(points[hover].actualMinor - points[hover].predictedMinor),
                currency,
              )}
            </span>
          </div>
        </div>
      )}
    </figure>
  );
}
