"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoImport } from "@/app/actions/import";

interface Batch {
  id: number;
  filename: string;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  created_at: string;
}

/**
 * Import history with a genuine undo.
 *
 * Every transaction records the batch it arrived in, so a mistaken import can
 * be removed cleanly. Without this, a bad mapping means hand-deleting hundreds
 * of rows — and people quite reasonably won't risk importing at all.
 */
export default function ImportHistory({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  if (!batches.length) {
    return (
      <p className="px-5 py-6 text-center text-sm text-subtle">
        Nothing imported yet. Your import history will appear here.
      </p>
    );
  }

  function undo(batch: Batch) {
    if (
      !confirm(
        `Remove all ${batch.imported_count} transactions imported from "${batch.filename}"? This can't be undone.`,
      )
    )
      return;

    setBusy(batch.id);
    startTransition(async () => {
      await undoImport(batch.id);
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-line">
      {batches.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{b.filename}</p>
            <p className="mt-0.5 text-xs text-muted">
              {b.imported_count.toLocaleString("en-GB")} imported
              {b.duplicate_count > 0 && ` · ${b.duplicate_count} duplicates skipped`} ·{" "}
              {b.created_at.replace("T", " ").slice(0, 16)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => undo(b)}
            disabled={pending && busy === b.id}
            className="btn btn-danger h-8 text-xs"
          >
            {pending && busy === b.id ? "Removing…" : "Undo import"}
          </button>
        </li>
      ))}
    </ul>
  );
}
