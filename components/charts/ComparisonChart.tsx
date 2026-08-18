"use client";

import { useMemo, useState } from "react";
import { formatAxis, formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { MARK, barPath, linearScale, niceMax, niceTicks } from "./primitives";

export interface ComparisonPoint {
  month: string;
  incomeMinor: number;
  spendMinor: number;
}

interface Props {
  points: ComparisonPoint[];
  currency: string;
  height?: number;
}

const W = 840;
const PAD = { top: 18, right: 16, bottom: 34, left: 60 };

/**
 * Income against expenses — the one chart here that genuinely needs two
 * distinct series, so it uses the validated categorical pair (worst-case CVD
 * ΔE 24.7) with a legend and a 2px surface gap between the paired columns.
 *
 * Both series are money on the same scale, so they share one axis. A second
 * y-axis would let either bar be drawn taller than the other by choosing the
 * scale, which is the fastest way to make a chart lie.
 */
export default function ComparisonChart({ points, currency, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const peak = Math.max(...points.flatMap((p) => [p.incomeMinor, p.spendMinor]), 1);
    const max = niceMax(peak, 4);
    const ticks = niceTicks(max, 4);
    const y = linearScale([0, max], [PAD.top + plotH, PAD.top]);

    const band = plotW / Math.max(1, points.length);
    // Two bars per band, a 2px surface gap between them, and air either side.
    const barW = Math.min(MARK.maxBarThickness, (band - MARK.gap) / 2 - 6);

    return { max, ticks, y, band, barW };
  }, [points, plotW, plotH]);

  if (!points.length) {
    return (
      <div className="flex items-center justify-center text-sm text-subtle" style={{ height: H }}>
        No data for this period.
      </div>
    );
  }

  const { ticks, y, band, barW } = model;
  const baseline = PAD.top + plotH;
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Monthly income compared with expenses"
        className="block overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--viz-ink)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatAxis(t, currency)}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const bandX = PAD.left + i * band;
          const centre = bandX + band / 2;
          const incomeX = centre - barW - MARK.gap / 2;
          const spendX = centre + MARK.gap / 2;

          return (
            <g
              key={p.month}
              onPointerEnter={() => setHover(i)}
              style={{ opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s" }}
            >
              {/* Generous invisible hit area — bigger than the marks themselves */}
              <rect x={bandX} y={PAD.top} width={band} height={plotH} fill="transparent" />
              <path
                d={barPath(incomeX, y(p.incomeMinor), barW, baseline - y(p.incomeMinor))}
                fill="var(--viz-series-b)"
              />
              <path
                d={barPath(spendX, y(p.spendMinor), barW, baseline - y(p.spendMinor))}
                fill="var(--viz-series-a)"
              />
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={baseline}
          y2={baseline}
          stroke="var(--viz-axis)"
          strokeWidth={1}
        />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.month}
              x={PAD.left + i * band + band / 2}
              y={baseline + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--viz-ink)"
            >
              {formatMonth(p.month, true).replace(" 20", " ")}
            </text>
          ) : null,
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 pl-14 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: "var(--viz-series-b)" }}
          />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: "var(--viz-series-a)" }}
          />
          Expenses
        </span>
      </figcaption>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-20 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((PAD.left + hover * band + band / 2) / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="mb-1 font-semibold text-fg">{formatMonth(points[hover].month)}</div>
          <div className="flex items-center justify-between gap-4 text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: "var(--viz-series-b)" }}
              />
              Income
            </span>
            <span className="font-medium tabular-nums text-fg">
              {formatMoney(points[hover].incomeMinor, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: "var(--viz-series-a)" }}
              />
              Expenses
            </span>
            <span className="font-medium tabular-nums text-fg">
              {formatMoney(points[hover].spendMinor, currency)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-1 text-muted">
            <span>Net</span>
            <span className="font-semibold tabular-nums text-fg">
              {formatMoney(points[hover].incomeMinor - points[hover].spendMinor, currency, {
                signed: true,
              })}
            </span>
          </div>
        </div>
      )}
    </figure>
  );
}
