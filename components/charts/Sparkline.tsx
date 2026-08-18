import { linearScale, smoothPath } from "./primitives";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  /** Colour the trend by direction rather than a fixed hue */
  tone?: "neutral" | "positive" | "negative";
}

/**
 * Stat-tile sparkline: the trend at a glance, no axes, no labels.
 *
 * Drawn in the de-emphasis ink with the final point marked in the accent, per
 * the stat-tile contract. It is deliberately non-interactive — the tile's own
 * value carries the number, and a tooltip on a 60px graphic would be noise.
 */
export default function Sparkline({ values, width = 96, height = 28, tone = "neutral" }: Props) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ width, height }} aria-hidden="true" />;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const pad = 3;

  const x = linearScale([0, clean.length - 1], [pad, width - pad]);
  // A flat series would divide by zero; centre it instead.
  const y =
    max - min < 1
      ? () => height / 2
      : linearScale([min, max], [height - pad, pad]);

  const points = clean.map((v, i) => ({ x: x(i), y: y(v) }));
  const d = smoothPath(points);
  const last = points[points.length - 1];

  const stroke =
    tone === "positive"
      ? "var(--viz-good)"
      : tone === "negative"
        ? "var(--viz-critical)"
        : "var(--viz-series-a)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={last.x} cy={last.y} r={2.75} fill={stroke} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
