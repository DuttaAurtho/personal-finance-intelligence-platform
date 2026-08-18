"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/lib/money";
import { categoryIcon } from "@/lib/categories";
import { updateProfile, retrainClassifier, type SettingsState } from "@/app/actions/settings";
import { addRule, removeRule, type ManualState } from "@/app/actions/transactions";

const INITIAL: SettingsState = {};

function Note({ state }: { state: SettingsState | ManualState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p role="status" className="rounded-lg bg-positive-soft px-3 py-2 text-sm text-positive">
        {state.success}
      </p>
    );
  return null;
}

/* ---------------------------------------------------------------------- */

export function ProfilePanel({ name, currency }: { name: string; currency: string }) {
  const [state, action, pending] = useActionState(updateProfile, INITIAL);

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <Note state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Display name</label>
          <input id="name" name="name" defaultValue={name} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <select id="currency" name="currency" defaultValue={currency} className="input">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-subtle">
            Changes how amounts are displayed. It doesn&apos;t convert existing figures.
          </p>
        </div>
      </div>

      <button type="submit" className="btn btn-primary h-9" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------------- */

export function RulesPanel({
  rules,
  categories,
}: {
  rules: { id: number; pattern: string; category: string }[];
  categories: { name: string; kind: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addRule, {} as ManualState);
  const [removing, startRemoving] = useTransition();

  function drop(id: number) {
    startRemoving(async () => {
      await removeRule(id);
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-4">
      <p className="mb-4 text-[0.8125rem] leading-relaxed text-muted">
        A rule is an absolute instruction — anything whose description contains the text you give is
        always filed under that category, overriding both the merchant lexicon and the model. Useful
        for the handful of merchants the classifier keeps getting wrong.
      </p>

      <form action={action} className="mb-5 space-y-3">
        <Note state={state} />

        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="pattern">When the description contains</label>
            <input
              id="pattern"
              name="pattern"
              className="input"
              placeholder="e.g. blue bottle"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="rule-category">File it as</label>
            <select id="rule-category" name="category" className="input" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary h-[38px]" disabled={pending}>
            {pending ? "Adding…" : "Add rule"}
          </button>
        </div>
      </form>

      {rules.length ? (
        <ul className={`divide-y divide-line ${removing ? "opacity-60" : ""}`}>
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-sm">
                <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-fg">
                  {r.pattern}
                </code>
                <span className="mx-2 text-subtle">→</span>
                <span className="text-fg">
                  <span aria-hidden="true" className="mr-1">{categoryIcon(r.category)}</span>
                  {r.category}
                </span>
              </span>
              <button
                type="button"
                onClick={() => drop(r.id)}
                className="btn btn-ghost h-7 !px-2 text-xs text-subtle"
                aria-label={`Delete the rule for ${r.pattern}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-subtle">
          No rules yet. Most people never need one — the model usually gets there on its own.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export function RetrainPanel({ confirmedCount }: { confirmedCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await retrainClassifier();
      setMessage(result.success ?? result.error ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        The classifier has{" "}
        <strong className="text-fg">{confirmedCount.toLocaleString("en-GB")}</strong> confirmed
        examples to learn from. Re-running applies everything it has learned to every transaction
        you haven&apos;t categorised by hand — worth doing after correcting a batch of rows.
        Anything you&apos;ve confirmed yourself is never overwritten.
      </p>

      {message && (
        <p role="status" className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          {message}
        </p>
      )}

      <button type="button" onClick={run} className="btn btn-secondary h-9" disabled={pending}>
        {pending ? "Reclassifying…" : "Re-run categorisation"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export function DangerPanel({
  wipeAction,
  deleteAction,
}: {
  wipeAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<"none" | "wipe" | "delete">("none");

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Delete all financial data</p>
          <p className="mt-0.5 text-xs text-muted">
            Removes every transaction, budget, rule and import record. Your account stays.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === "wipe" ? "none" : "wipe")}
          className="btn btn-danger h-9 shrink-0"
        >
          {mode === "wipe" ? "Cancel" : "Delete data"}
        </button>
      </div>

      {mode === "wipe" && (
        <form action={wipeAction} className="flex flex-wrap items-end gap-3 rounded-lg bg-negative-soft/50 p-3">
          <div>
            <label className="label" htmlFor="wipe-confirm">
              Type DELETE to confirm
            </label>
            <input id="wipe-confirm" name="confirm" className="input !w-40" autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-danger h-[38px]">
            Permanently delete
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Delete my account</p>
          <p className="mt-0.5 text-xs text-muted">
            Removes the account itself along with everything in it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === "delete" ? "none" : "delete")}
          className="btn btn-danger h-9 shrink-0"
        >
          {mode === "delete" ? "Cancel" : "Delete account"}
        </button>
      </div>

      {mode === "delete" && (
        <form action={deleteAction} className="flex flex-wrap items-end gap-3 rounded-lg bg-negative-soft/50 p-3">
          <div>
            <label className="label" htmlFor="delete-confirm">
              Type DELETE to confirm
            </label>
            <input id="delete-confirm" name="confirm" className="input !w-40" autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-danger h-[38px]">
            Permanently delete account
          </button>
        </form>
      )}
    </div>
  );
}
