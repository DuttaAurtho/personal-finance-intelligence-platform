import type { InsightTone } from "@/lib/types";

/**
 * The status glyph on an insight card.
 *
 * Replaces the emoji each insight used to carry. Beyond looking inconsistent
 * across platforms, an emoji per rule meant the icon varied with the *subject*
 * (a house, a plug, a magnifying glass) when the thing worth signalling is the
 * *severity*. Four shapes tied to tone read faster and stay honest.
 */

const PATHS: Record<InsightTone, string> = {
  critical: "M12 8v5M12 16.5h.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z",
  warning: "M12 7.5v5.5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  positive: "M8 12.5l2.8 2.8L16.5 9.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  neutral: "M12 11v5.5M12 7.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
};

const COLOUR: Record<InsightTone, string> = {
  critical: "text-negative",
  warning: "text-warning",
  positive: "text-positive",
  neutral: "text-muted",
};

export default function ToneIcon({ tone, size = 18 }: { tone: InsightTone; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${COLOUR[tone]}`}
    >
      <path d={PATHS[tone]} />
    </svg>
  );
}
