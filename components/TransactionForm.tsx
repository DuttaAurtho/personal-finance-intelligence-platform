"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveTransaction, type ManualState } from "@/app/actions/transactions";
import CategoryIcon from "@/components/CategoryIcon";
import { symbolFor } from "@/lib/money";

export interface EditableTransaction {
  id: number;
  date: string;
  description: string;
  amount_minor: number;
  category: string;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Omit to add a new transaction; pass a row to edit it. */
  initial?: EditableTransaction | null;
  categories: { name: string; kind: string }[];
  accounts?: { id: number; name: string }[];
  currency: string;
}

const INITIAL: ManualState = {};

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary h-10 px-5" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save changes" : "Add transaction"}
    </button>
  );
}

/**
 * Add or edit one transaction by hand.
 *
 * Amount is entered as a positive number with the direction chosen separately.
 * Letting people type a leading minus is how expenses silently become income:
 * a bank statement writes an outgoing payment as -24.99, but a person filling
 * in a form thinks of it as "I spent 24.99", and the two conventions collide.
 */
export default function TransactionForm({
  open,
  onClose,
  initial,
  categories,
  accounts = [],
  currency,
}: Props) {
  const [state, action] = useActionState(saveTransaction, INITIAL);
  const editing = !!initial;
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastHandled = useRef<string | undefined>(undefined);

  const [direction, setDirection] = useState<"in" | "out">("out");
  const [category, setCategory] = useState("Uncategorised");

  // Close once the server confirms the save, not optimistically on submit.
  useEffect(() => {
    if (state.success && state.success !== lastHandled.current) {
      lastHandled.current = state.success;
      onClose();
    }
  }, [state.success, onClose]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDirection(initial.amount_minor > 0 ? "in" : "out");
      setCategory(initial.category);
    } else {
      setDirection("out");
      setCategory("Uncategorised");
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Focus the first field so the form is usable straight from the keyboard.
    dialogRef.current?.querySelector<HTMLInputElement>("input[name=date]")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const expense = useMemo(() => categories.filter((c) => c.kind === "expense"), [categories]);
  const income = useMemo(() => categories.filter((c) => c.kind === "income"), [categories]);
  const transfer = useMemo(() => categories.filter((c) => c.kind === "transfer"), [categories]);
  const visible = direction === "in" ? income : expense;

  if (!open) return null;

  const amountValue = editing ? (Math.abs(initial!.amount_minor) / 100).toFixed(2) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit transaction" : "Add a transaction"}
      onMouseDown={(e) => {
        // Only a click on the backdrop itself dismisses — not a drag that
        // happens to finish there after selecting text in a field.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="card w-full max-w-lg animate-[fade-up_.2s_ease-out]">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-fg">
            {editing ? "Edit transaction" : "Add a transaction"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost h-8 !px-2"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <form action={action} className="space-y-4 px-5 py-5">
          {editing && <input type="hidden" name="id" value={initial!.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="tf-date">Date</label>
              <input
                id="tf-date"
                name="date"
                type="date"
                required
                defaultValue={editing ? initial!.date : new Date().toISOString().slice(0, 10)}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="tf-amount">
                Amount ({symbolFor(currency).trim()})
              </label>
              <input
                id="tf-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="24.99"
                defaultValue={amountValue}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="tf-description">Description</label>
            <input
              id="tf-description"
              name="description"
              type="text"
              required
              placeholder="e.g. Rent, Shell fuel, cinema tickets"
              defaultValue={editing ? initial!.description : ""}
              className="input"
            />
          </div>

          <fieldset>
            <legend className="label">Direction</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "out", label: "Money out", hint: "an expense" },
                { value: "in", label: "Money in", hint: "income" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    direction === opt.value
                      ? "border-brand bg-brand-soft"
                      : "border-line-strong hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="direction"
                    value={opt.value}
                    checked={direction === opt.value}
                    onChange={() => setDirection(opt.value as "in" | "out")}
                    className="h-3.5 w-3.5 accent-[var(--brand)]"
                  />
                  <span className="text-fg">{opt.label}</span>
                  <span className="text-xs text-subtle">{opt.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Categories are laid out as visible tiles rather than hidden behind
              a dropdown. Someone entering their first transaction has no idea
              what buckets exist; showing them is what makes "where does rent
              go?" answerable without opening anything. */}
          <fieldset>
            <legend className="label">
              Category
              <span className="ml-1 font-normal text-subtle">— what kind of {direction === "in" ? "income" : "spending"} is this?</span>
            </legend>

            <input type="hidden" name="category" value={category} />

            <div className="max-h-52 overflow-y-auto rounded-lg border border-line-strong p-2">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {visible.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setCategory(c.name)}
                    aria-pressed={category === c.name}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                      category === c.name
                        ? "border-brand bg-brand-soft font-semibold text-fg"
                        : "border-transparent bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg"
                    }`}
                  >
                    <CategoryIcon category={c.name} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>

              {transfer.length > 0 && (
                <details className="mt-2 border-t border-line pt-2">
                  <summary className="cursor-pointer text-xs text-subtle">
                    Moving money between your own accounts?
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {transfer.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setCategory(c.name)}
                        aria-pressed={category === c.name}
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                          category === c.name
                            ? "border-brand bg-brand-soft font-semibold text-fg"
                            : "border-transparent bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg"
                        }`}
                      >
                        <CategoryIcon category={c.name} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[0.6875rem] leading-snug text-subtle">
                    These are left out of spending totals — moving savings around isn&apos;t spending.
                  </p>
                </details>
              )}
            </div>
          </fieldset>

          {!editing && accounts.length > 1 && (
            <div>
              <label className="label" htmlFor="tf-account">Account</label>
              <select id="tf-account" name="account" className="input">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="tf-notes">Note <span className="font-normal text-subtle">(optional)</span></label>
            <input
              id="tf-notes"
              name="notes"
              type="text"
              placeholder="Anything worth remembering about this one"
              defaultValue={editing ? (initial!.notes ?? "") : ""}
              className="input"
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
              {state.error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary h-10 px-4">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </div>
        </form>
      </div>
    </div>
  );
}
