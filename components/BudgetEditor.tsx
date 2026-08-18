"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { categoryIcon } from "@/lib/categories";
import { formatMoney, symbolFor } from "@/lib/money";
import { clearBudget, saveBudget } from "@/app/actions/budgets";
import type { BudgetStatus } from "@/lib/analytics";
import Meter, { STATE_LABEL } from "./charts/Meter";

interface Props {
  budgets: BudgetStatus[];
  suggestions: { category: string; amountMinor: number; basis: number }[];
  currency: string;
  monthLabel: string;
}

/**
 * Budget list with inline editing.
 *
 * Each row shows spend against the ceiling, the state in words as well as
 * colour, and a marker for where the month is projected to finish — the
 * projection is the part that's actually actionable, because a budget you only
 * discover you've blown on the 30th is just a report card.
 */
export default function BudgetEditor({ budgets, suggestions, currency, monthLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const budgeted = new Set(budgets.map((b) => b.category));
  const unbudgeted = suggestions.filter((s) => !budgeted.has(s.category));

  function begin(category: string, currentMinor: number) {
    setEditing(category);
    setDraft((currentMinor / 100).toFixed(2));
  }

  function commit(category: string) {
    const value = draft;
    setEditing(null);
    startTransition(async () => {
      await saveBudget(category, value);
      router.refresh();
    });
  }

  function remove(category: string) {
    startTransition(async () => {
      await clearBudget(category);
      router.refresh();
    });
  }

  function adopt(category: string, amountMinor: number) {
    startTransition(async () => {
      await saveBudget(category, (amountMinor / 100).toFixed(2));
      router.refresh();
    });
  }

  return (
    <div className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
      {budgets.length > 0 && (
        <ul className="divide-y divide-line">
          {budgets.map((b) => {
            const state = STATE_LABEL[b.state];
            const isEditing = editing === b.category;

            return (
              <li key={b.category} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <span aria-hidden="true">{categoryIcon(b.category)}</span>
                    {b.category}
                  </span>

                  {isEditing ? (
                    <span className="flex items-center gap-2">
                      <span className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-subtle">
                          {symbolFor(currency).trim()}
                        </span>
                        <input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit(b.category);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="input !w-32 !pl-6 !py-1 text-right"
                          aria-label={`Monthly budget for ${b.category}`}
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => commit(b.category)}
                        className="btn btn-primary h-8 text-xs"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="btn btn-ghost h-8 text-xs"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <span className="text-sm tabular-nums text-muted">
                        <span className="font-semibold text-fg">
                          {formatMoney(b.spentMinor, currency)}
                        </span>{" "}
                        of {formatMoney(b.budgetMinor, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => begin(b.category, b.budgetMinor)}
                        className="btn btn-ghost h-7 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(b.category)}
                        className="btn btn-ghost h-7 !px-1.5 text-xs text-subtle"
                        aria-label={`Remove the ${b.category} budget`}
                        title="Remove budget"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>

                <Meter
                  usage={b.usage}
                  projection={b.budgetMinor > 0 ? b.projectedMinor / b.budgetMinor : 0}
                  state={b.state}
                  height={10}
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      b.state === "over"
                        ? "font-medium text-negative"
                        : b.state === "at-risk"
                          ? "font-medium text-warning"
                          : "text-muted"
                    }
                  >
                    <span aria-hidden="true">{state.icon}</span> {state.label}
                    {b.state === "at-risk" &&
                      ` — heading for ${formatMoney(b.projectedMinor, currency)}`}
                  </span>
                  <span className="text-subtle">
                    {b.remainingMinor >= 0
                      ? `${formatMoney(b.remainingMinor, currency)} left for ${monthLabel}`
                      : `${formatMoney(-b.remainingMinor, currency)} over`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Categories with history but no budget yet */}
      {unbudgeted.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-fg">Suggested from your history</h3>
          <p className="mt-1 text-xs text-muted">
            Based on the median of your recent months, rounded up. Adopt one with a click.
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {unbudgeted.slice(0, 12).map((s) => (
              <li key={s.category}>
                <button
                  type="button"
                  onClick={() => adopt(s.category, s.amountMinor)}
                  className="btn btn-secondary h-8 text-xs"
                  title={`Typical month: ${formatMoney(s.basis, currency)}`}
                >
                  <span aria-hidden="true">{categoryIcon(s.category)}</span>
                  {s.category}
                  <span className="font-semibold">{formatMoney(s.amountMinor, currency)}</span>
                  <span aria-hidden="true" className="text-subtle">+</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
