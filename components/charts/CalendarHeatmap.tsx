"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { addDays, dayOfWeek, formatDate } from "@/lib/dates";

export interface DaySpend {
  date: string;
  totalMinor: number;
}

interface Props {
  days: DaySpend[];
  from: string;
  to: string;
  currency: string;
}

/** Sequential ramp, light (small) → dark (large). Empty days use the surface. */
const STEPS = [
  "var(--viz-seq-5)",
  "var(--viz-seq-4)",
  "var(--viz-seq-3)",
  "var(--viz-seq-2)",
  "var(--viz-seq-1)",
];

const CELL = 13;
const GAP = 3;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * Daily spending calendar.
 *
 * A grid of magnitude, so the colour job is sequential: one hue, darker means
 * more spent. Thresholds are quantiles of the user's own non-zero days rather
 * than fixed cash amounts, so the pattern is legible whether someone spends
 * £10 a day or £300.
 */
export default function CalendarHeatmap({ days, from, to, currency }: Props) {
  const [hover, setHover] = useState<{ date: string; total: number; x: number; y: number } | null>(
    null,
  );

  const { weeks, thresholds, total } = useMemo(() => {
    const map = new Map(days.map((d) => [d.date, d.totalMinor]));

    // Start on the Sunday on or before `from` so rows line up with weekdays.
    let cursor = addDays(from, -dayOfWeek(from));
    const cols: { date: string; total: number; inRange: boolean }[][] = [];

    let guard = 0;
    while (cursor <= to && guard++ < 400) {
      const col: { date: string; total: number; inRange: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(cursor, d);
        col.push({
          date,
          total: map.get(date) ?? 0,
          inRange: date >= from && date <= to,
        });
      }
      cols.push(col);
      cursor = addDays(cursor, 7);
    }

    const nonZero = days.filter((d) => d.totalMinor > 0).map((d) => d.totalMinor).sort((a, b) => a - b);
    const q = (p: number) => nonZero[Math.floor((nonZero.length - 1) * p)] ?? 0;
    const th = nonZero.length ? [q(0.2), q(0.4), q(0.6), q(0.8)] : [1, 2, 3, 4];

    return {
      weeks: cols,
      thresholds: th,
      total: days.reduce((a, d) => a + d.totalMinor, 0),
    };
  }, [days, from, to]);

  const stepFor = (value: number): string | null => {
    if (value <= 0) return null;
    for (let i = 0; i < thresholds.length; i++) if (value <= thresholds[i]) return STEPS[i];
    return STEPS[4];
  };

  const width = weeks.length * (CELL + GAP) + 34;
  const height = 7 * (CELL + GAP) + 20;

  return (
    <figure className="relative m-0">
      <div className="overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Daily spending from ${formatDate(from)} to ${formatDate(to)}, totalling ${formatMoney(total, currency)}`}
          className="max-w-full"
          onPointerLeave={() => setHover(null)}
        >
          {DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={i * (CELL + GAP) + CELL - 2}
                fontSize={9.5}
                fill="var(--viz-ink)"
              >
                {label}
              </text>
            ) : null,
          )}

          {weeks.map((col, wi) =>
            col.map((cell, di) => {
              const fill = cell.inRange ? stepFor(cell.total) : null;
              const x = 30 + wi * (CELL + GAP);
              const y = di * (CELL + GAP);
              return (
                <rect
                  key={cell.date}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={fill ?? "var(--surface-3)"}
                  opacity={cell.inRange ? 1 : 0.35}
                  onPointerEnter={() =>
                    cell.inRange && setHover({ date: cell.date, total: cell.total, x, y })
                  }
                  style={{ cursor: cell.inRange ? "pointer" : "default" }}
                />
              );
            }),
          )}
        </svg>
      </div>

      <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>Less</span>
        <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: "var(--surface-3)" }} />
        {STEPS.map((s) => (
          <span key={s} className="inline-block h-3 w-3 rounded-[3px]" style={{ background: s }} />
        ))}
        <span>More</span>
        <span className="ml-auto text-subtle">Darker days cost more</span>
      </figcaption>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: hover.x + CELL / 2, top: hover.y - 4 }}
        >
          <div className="font-semibold text-fg">
            {hover.total > 0 ? formatMoney(hover.total, currency) : "No spending"}
          </div>
          <div className="text-subtle">{formatDate(hover.date)}</div>
        </div>
      )}
    </figure>
  );
}
