"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { formatMonth } from "@/lib/dates";

/**
 * Month selector. Writes to the URL rather than local state so the view is
 * shareable, bookmarkable and survives a refresh.
 */
export default function MonthPicker({
  months,
  value,
}: {
  months: string[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const index = months.indexOf(value);
  const canGoBack = index >= 0 && index < months.length - 1;
  const canGoForward = index > 0;

  function go(month: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", month);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface p-1 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        className="btn btn-ghost h-7 w-7 !px-0"
        disabled={!canGoBack}
        onClick={() => canGoBack && go(months[index + 1])}
        aria-label="Previous month"
      >
        <span aria-hidden="true">‹</span>
      </button>

      <select
        value={value}
        onChange={(e) => go(e.target.value)}
        className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-sm font-medium text-fg focus:outline-none"
        aria-label="Select month"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn-ghost h-7 w-7 !px-0"
        disabled={!canGoForward}
        onClick={() => canGoForward && go(months[index - 1])}
        aria-label="Next month"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
