"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { categoryIcon } from "@/lib/categories";
import { MARK, seqColor } from "./primitives";

export interface RankedItem {
  label: string;
  valueMinor: number;
  share: number;
  count?: number;
  href?: string;
}

interface Props {
  items: RankedItem[];
  currency: string;
  /** Show the category emoji beside each label */
  withIcons?: boolean;
  max?: number;
  emptyMessage?: string;
}

/**
 * Ranked horizontal bars — the category breakdown.
 *
 * Magnitude comparison across many long-named categories, so this is a
 * *sequential* encoding: one hue, darker means larger. Identity comes from the
 * written label beside each bar, never from colour, which is what lets it scale
 * past the eight-series ceiling a categorical palette would impose.
 */
export default function RankedBars({
  items,
  currency,
  withIcons = true,
  max,
  emptyMessage = "Nothing to show for this period.",
}: Props) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-subtle">{emptyMessage}</p>;
  }

  const peak = max ?? Math.max(...items.map((i) => i.valueMinor), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const width = Math.max(1.5, (item.valueMinor / peak) * 100);
        const color = seqColor(i);

        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                {withIcons && (
                  <span aria-hidden="true" className="text-base leading-none">
                    {categoryIcon(item.label)}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
                {item.count !== undefined && (
                  <span className="shrink-0 text-xs font-normal text-subtle">
                    {item.count}×
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                {formatMoney(item.valueMinor, currency)}
                <span className="ml-1.5 text-xs font-normal text-subtle">
                  {(item.share * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface-3)" }}
            >
              <div
                className="h-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${width}%`,
                  background: color,
                  borderRadius: `2px ${MARK.barRadius}px ${MARK.barRadius}px 2px`,
                }}
              />
            </div>
          </>
        );

        return (
          <li key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-2"
              >
                {row}
              </Link>
            ) : (
              <div className="px-1 py-0.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
