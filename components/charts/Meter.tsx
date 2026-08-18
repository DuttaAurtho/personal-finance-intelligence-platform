import type { BudgetStatus } from "@/lib/analytics";

interface Props {
  /** 0..1+ — values above 1 mean the limit has been passed */
  usage: number;
  /** Optional straight-line projection to period end, drawn as a tick */
  projection?: number;
  state: BudgetStatus["state"];
  height?: number;
}

/**
 * Budget meter.
 *
 * The fill carries severity and the unfilled track is a lighter step of the
 * same ramp, so state reads across the whole bar rather than only where the
 * fill happens to end. Status colour never travels alone — every caller pairs
 * this with the state's icon and word.
 */

const FILL: Record<BudgetStatus["state"], string> = {
  under: "var(--viz-good)",
  "on-track": "var(--viz-good)",
  "at-risk": "var(--viz-warning)",
  over: "var(--viz-critical)",
};

export const STATE_LABEL: Record<BudgetStatus["state"], { icon: string; label: string }> = {
  under: { icon: "✓", label: "Comfortable" },
  "on-track": { icon: "✓", label: "On track" },
  "at-risk": { icon: "▲", label: "At risk" },
  over: { icon: "✕", label: "Over budget" },
};

export default function Meter({ usage, projection, state, height = 8 }: Props) {
  const pct = Math.max(0, Math.min(100, usage * 100));
  const overflow = usage > 1;

  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, background: "var(--surface-3)" }}
      role="meter"
      aria-valuenow={Math.round(usage * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(usage * 100)}% of budget used`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: FILL[state] }}
      />

      {/* Projected end-of-month position — a tick, not a second fill */}
      {projection !== undefined && projection > usage && projection <= 1.6 && (
        <span
          className="absolute top-0 h-full"
          style={{
            left: `${Math.min(99, projection * 100)}%`,
            width: 2,
            background: "var(--fg)",
            opacity: 0.4,
          }}
          aria-hidden="true"
        />
      )}

      {overflow && (
        <span
          className="absolute inset-y-0 right-0"
          style={{ width: 3, background: "var(--viz-critical)" }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
