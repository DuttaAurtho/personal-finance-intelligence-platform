"use client";

import { useMemo, useState } from "react";
import { formatAxis, formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { MARK, linearScale, nearestIndex, niceMax, niceTicks, smoothPath } from "./primitives";

export interface TrendPoint {
  month: string;
  valueMinor: number;
}

export interface TrendForecast {
  month: string;
  predictedMinor: number;
  lowMinor: number;
  highMinor: number;
}

interface Props {
  points: TrendPoint[];
  forecast?: TrendForecast | null;
  currency: string;
  /** Accessible description of what is plotted */
  label?: string;
  height?: number;
}

const W = 840;
const PAD = { top: 18, right: 64, bottom: 34, left: 60 };

/**
 * Monthly spending trend with an optional forecast extension.
 *
 * One data series, so no legend is needed for the history — the card title says
 * what is plotted. When a forecast is present it becomes a second, visually
 * distinct series (different hue *and* a dashed stroke, so identity survives
 * colour-vision deficiency) and a legend appears.
 */
export default function TrendChart({ points, forecast, currency, label, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const all = [...points];
    if (forecast) all.push({ month: forecast.month, valueMinor: forecast.predictedMinor });

    const peak = Math.max(
      ...all.map((p) => p.valueMinor),
      forecast?.highMinor ?? 0,
      1,
    );
    const max = niceMax(peak, 4);
    const ticks = niceTicks(max, 4);

    const x = linearScale([0, Math.max(1, all.length - 1)], [PAD.left, PAD.left + plotW]);
    const y = linearScale([0, max], [PAD.top + plotH, PAD.top]);

    const actual = points.map((p, i) => ({ x: x(i), y: y(p.valueMinor), ...p }));
    const xs = all.map((_, i) => x(i));

    return { all, max, ticks, x, y, actual, xs };
  }, [points, forecast, plotW, plotH]);

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-subtle"
        style={{ height: H }}
      >
        Not enough history yet.
      </div>
    );
  }

  const { all, ticks, x, y, actual, xs } = model;
  const baseline = PAD.top + plotH;

  const areaD = `${smoothPath(actual)} L ${actual[actual.length - 1].x} ${baseline} L ${actual[0].x} ${baseline} Z`;
  const lineD = smoothPath(actual);

  const last = actual[actual.length - 1];
  const fIndex = all.length - 1;
  const fPoint = forecast
    ? { x: x(fIndex), y: y(forecast.predictedMinor), hi: y(forecast.highMinor), lo: y(forecast.lowMinor) }
    : null;

  // Label every month when there is room, otherwise thin them out evenly.
  const labelEvery = Math.max(1, Math.ceil(all.length / 8));

  const hovered = hover !== null ? all[hover] : null;
  const isForecastHover = !!(forecast && hover === all.length - 1);

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label={
          label ??
          `Monthly spending from ${formatMonth(points[0].month)} to ${formatMonth(points[points.length - 1].month)}`
        }
        className="block overflow-visible"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(nearestIndex(xs, px));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-series-a)" stopOpacity={MARK.areaOpacity * 2.2} />
            <stop offset="100%" stopColor="var(--viz-series-a)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Gridlines: hairline, solid, recessive */}
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

        {/* Forecast uncertainty band, drawn under everything else */}
        {forecast && fPoint && (
          <path
            d={`M ${last.x} ${last.y} L ${fPoint.x} ${fPoint.hi} L ${fPoint.x} ${fPoint.lo} Z`}
            fill="var(--viz-forecast)"
            opacity={MARK.areaOpacity}
          />
        )}

        <path d={areaD} fill="url(#trend-fill)" />
        <path
          d={lineD}
          fill="none"
          stroke="var(--viz-series-a)"
          strokeWidth={MARK.lineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Forecast segment: distinct hue AND dash pattern */}
        {forecast && fPoint && (
          <>
            <path
              d={`M ${last.x} ${last.y} L ${fPoint.x} ${fPoint.y}`}
              fill="none"
              stroke="var(--viz-forecast)"
              strokeWidth={MARK.lineWidth}
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
            <line
              x1={fPoint.x}
              x2={fPoint.x}
              y1={fPoint.hi}
              y2={fPoint.lo}
              stroke="var(--viz-forecast)"
              strokeWidth={1.5}
              opacity={0.5}
            />
            <circle
              cx={fPoint.x}
              cy={fPoint.y}
              r={MARK.markerRadius}
              fill="var(--viz-forecast)"
              stroke="var(--surface)"
              strokeWidth={MARK.gap}
            />
          </>
        )}

        {/* End marker on the actual series, with its surface ring */}
        <circle
          cx={last.x}
          cy={last.y}
          r={MARK.markerRadius}
          fill="var(--viz-series-a)"
          stroke="var(--surface)"
          strokeWidth={MARK.gap}
        />

        {/* Selective direct labels: the latest actual and the forecast only */}
        <text
          x={last.x + (forecast ? 0 : 12)}
          y={last.y - 14}
          textAnchor={forecast ? "middle" : "start"}
          fontSize={11.5}
          fontWeight={600}
          fill="var(--fg)"
        >
          {formatMoney(last.valueMinor, currency, { compact: true, decimals: false })}
        </text>
        {forecast && fPoint && (
          <text
            x={fPoint.x + 10}
            y={fPoint.y - 12}
            textAnchor="start"
            fontSize={11.5}
            fontWeight={600}
            fill="var(--fg)"
          >
            {formatMoney(forecast.predictedMinor, currency, { compact: true, decimals: false })}
          </text>
        )}

        {/* X axis */}
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={baseline}
          y2={baseline}
          stroke="var(--viz-axis)"
          strokeWidth={1}
        />
        {all.map((p, i) =>
          i % labelEvery === 0 || i === all.length - 1 ? (
            <text
              key={p.month}
              x={x(i)}
              y={baseline + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--viz-ink)"
            >
              {formatMonth(p.month, true).replace(" 20", " ")}
            </text>
          ) : null,
        )}

        {/* Crosshair */}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={baseline}
            stroke="var(--viz-axis)"
            strokeWidth={1}
          />
        )}
        {hover !== null && hovered && (
          <circle
            cx={x(hover)}
            cy={y(hovered.valueMinor)}
            r={MARK.markerRadius}
            fill={isForecastHover ? "var(--viz-forecast)" : "var(--viz-series-a)"}
            stroke="var(--surface)"
            strokeWidth={MARK.gap}
          />
        )}
      </svg>

      {/* Legend — only when a second series is present */}
      {forecast && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 pl-14 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke="var(--viz-series-a)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0" y1="4" x2="18" y2="4"
                stroke="var(--viz-forecast)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round"
              />
            </svg>
            Forecast
          </span>
          <span className="text-subtle">Shaded band shows the 80% range</span>
        </figcaption>
      )}

      {/* Tooltip */}
      {hover !== null && hovered && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(hovered.valueMinor) / H) * 100 - 3}%`,
          }}
        >
          <div className="font-semibold text-fg">{formatMoney(hovered.valueMinor, currency)}</div>
          <div className="text-subtle">
            {formatMonth(hovered.month)}
            {isForecastHover ? " · forecast" : ""}
          </div>
        </div>
      )}
    </figure>
  );
}
