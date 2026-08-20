"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import CategoryIcon from "@/components/CategoryIcon";
import type { Transaction } from "@/lib/types";
import {
  removeTransactions,
  updateCategory,
  updateCategoryForMerchant,
} from "@/app/actions/transactions";
import { Badge } from "./ui";
import TransactionForm, { type EditableTransaction } from "./TransactionForm";

type Row = Transaction & { account_name: string };

interface Props {
  rows: Row[];
  categories: { name: string; kind: string }[];
  currency: string;
}

/**
 * The transactions table.
 *
 * Categorisation is editable inline, because the correction loop is what
 * trains the model — burying it behind a detail page would mean it never
 * happens. Changing a category offers to apply the same label to every
 * transaction from that merchant, which is usually what the user actually
 * wants and turns one click into hundreds of correct labels.
 */
export default function TransactionTable({ rows, categories, currency }: Props) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applyAll, setApplyAll] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");
  const transfer = categories.filter((c) => c.kind === "transfer");

  function change(row: Row, category: string) {
    if (category === row.category) return;
    startTransition(async () => {
      if (applyAll && row.merchant) {
        const { updated } = await updateCategoryForMerchant(row.id, category, false);
        setFlash(
          updated > 1
            ? `Recategorised ${updated} transactions from this merchant as ${category}.`
            : `Set to ${category}.`,
        );
      } else {
        await updateCategory(row.id, category);
        setFlash(`Set to ${category}.`);
      }
      setTimeout(() => setFlash(null), 4000);
    });
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} transaction${ids.length > 1 ? "s" : ""}? This can't be undone.`))
      return;
    startTransition(async () => {
      await removeTransactions(ids);
      setSelected(new Set());
      setFlash(`Deleted ${ids.length} transaction${ids.length > 1 ? "s" : ""}.`);
      setTimeout(() => setFlash(null), 4000);
    });
  }

  return (
    <div className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--brand)]"
          />
          Apply category changes to all transactions from the same merchant
        </label>

        <div className="flex items-center gap-2">
          {flash && <span className="text-xs text-brand">{flash}</span>}
          {selected.size > 0 && (
            <button type="button" onClick={deleteSelected} className="btn btn-danger h-8 text-xs">
              Delete {selected.size}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                  aria-label="Select all rows"
                />
              </th>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th className="hidden md:table-cell">Account</th>
              <th className="num">Amount</th>
              <th className="w-10"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={selected.has(row.id) ? "bg-surface-3" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    className="h-3.5 w-3.5 accent-[var(--brand)]"
                    aria-label={`Select ${row.description}`}
                  />
                </td>

                <td className="whitespace-nowrap text-muted">{formatDate(row.date)}</td>

                <td className="max-w-[24rem]">
                  <div className="truncate font-medium text-fg" title={row.description}>
                    {row.description}
                  </div>
                  {row.is_transfer === 1 && (
                    <Badge tone="neutral" className="mt-1">
                      Transfer · excluded from totals
                    </Badge>
                  )}
                </td>

                <td>
                  <div className="flex items-center gap-1.5">
                    <CategoryIcon category={row.category} />
                    <select
                      value={row.category}
                      onChange={(e) => change(row, e.target.value)}
                      className="max-w-[11rem] cursor-pointer rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-fg transition-colors hover:border-line-strong hover:bg-surface focus:border-brand focus:outline-none"
                      aria-label={`Category for ${row.description}`}
                    >
                      <optgroup label="Expenses">
                        {expense.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Income">
                        {income.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Transfers">
                        {transfer.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </optgroup>
                    </select>

                    {/* Confidence is only worth surfacing when it's low */}
                    {row.is_confirmed === 0 && row.confidence < 0.6 && (
                      <span
                        title={`The classifier is only ${Math.round(row.confidence * 100)}% confident — worth checking`}
                        className="cursor-help text-xs text-warning"
                        aria-label="Low confidence category"
                      >
                        ⚠
                      </span>
                    )}
                    {row.is_confirmed === 1 && (
                      <span title="Confirmed by you — used as training data" className="text-xs text-positive">
                        ✓
                      </span>
                    )}
                  </div>
                </td>

                <td className="hidden whitespace-nowrap text-muted md:table-cell">
                  {row.account_name}
                </td>

                <td
                  className={`num font-semibold ${row.amount_minor > 0 ? "text-positive" : "text-fg"}`}
                >
                  {formatMoney(row.amount_minor, currency, { signed: row.amount_minor > 0 })}
                </td>

                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: row.id,
                        date: row.date,
                        description: row.description,
                        amount_minor: row.amount_minor,
                        category: row.category,
                        notes: row.notes,
                      })
                    }
                    className="btn btn-ghost h-7 !px-2 text-xs"
                    aria-label={`Edit ${row.description}`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TransactionForm
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing}
        categories={categories}
        currency={currency}
      />
    </div>
  );
}
