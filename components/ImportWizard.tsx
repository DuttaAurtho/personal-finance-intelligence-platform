"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseStatement, type ColumnMapping, type ParseResult } from "@/lib/csv";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { importCsv, type ImportResult } from "@/app/actions/import";
import { Badge } from "./ui";

interface Props {
  accounts: { id: number; name: string }[];
  currency: string;
}

type Stage = "choose" | "review" | "done";

const FIELD_LABELS: { key: keyof ColumnMapping; label: string; hint: string }[] = [
  { key: "date", label: "Date", hint: "Required" },
  { key: "description", label: "Description", hint: "Required" },
  { key: "amount", label: "Amount (signed)", hint: "Or use the pair below" },
  { key: "debit", label: "Money out", hint: "If split into two columns" },
  { key: "credit", label: "Money in", hint: "If split into two columns" },
  { key: "category", label: "Category", hint: "Optional" },
];

/**
 * The import wizard.
 *
 * Parsing runs in the browser so the preview is instant and the user sees
 * exactly what will be committed before anything is written. The raw file text
 * is then sent to the server, which re-parses it with the confirmed mapping —
 * the preview is a convenience, never the source of truth.
 */
export default function ImportWizard({ accounts, currency }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("choose");
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [override, setOverride] = useState<Partial<ColumnMapping>>({});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult["summary"] | null>(null);

  const parsed: ParseResult | null = useMemo(() => {
    if (!text) return null;
    try {
      return parseStatement(text, override);
    } catch {
      return null;
    }
  }, [text, override]);

  const readFile = useCallback((file: File) => {
    setError(null);

    if (file.size > 12 * 1024 * 1024) {
      setError("That file is over 12MB. Try exporting a shorter date range.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      if (!content.trim()) {
        setError("That file looks empty.");
        return;
      }
      setText(content);
      setFilename(file.name);
      setOverride({});
      setStage("review");
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function commit() {
    if (!parsed || !parsed.rows.length) return;
    setError(null);

    startTransition(async () => {
      const res = await importCsv(text, parsed.mapping, accountId, filename);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResult(res.summary ?? null);
      setStage("done");
      router.refresh();
    });
  }

  function reset() {
    setStage("choose");
    setText("");
    setFilename("");
    setOverride({});
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* ── Stage: choose a file ─────────────────────────────────────── */

  if (stage === "choose") {
    return (
      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-brand bg-brand-soft/40" : "border-line-strong bg-surface-2"
          }`}
        >
          <div
            aria-hidden="true"
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-2xl shadow-sm"
          >
            📄
          </div>
          <p className="text-base font-semibold text-fg">Drop your bank CSV here</p>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            It works out which column is which — including banks that split money in and
            money out across two columns.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn btn-primary mt-5 h-10 px-5"
          >
            Choose a file
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />

          <p className="mt-4 text-xs text-subtle">
            Nothing is uploaded to a server you don&apos;t control — this runs locally.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          Haven&apos;t got one handy?{" "}
          <a href="/api/sample" className="font-medium text-brand hover:underline" download>
            Download a sample statement
          </a>{" "}
          and import that instead.
        </p>
      </div>
    );
  }

  /* ── Stage: done ──────────────────────────────────────────────── */

  if (stage === "done" && result) {
    return (
      <div className="py-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-positive-soft text-2xl"
        >
          ✓
        </div>
        <h3 className="text-lg font-semibold text-fg">
          Imported {result.imported.toLocaleString("en-GB")} transactions
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {result.categorised} were categorised automatically
          {result.needsReview > 0 && `, ${result.needsReview} need a quick look`}
          {result.duplicates > 0 &&
            `, and ${result.duplicates} were already in your history so they were skipped`}
          .
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => router.push("/app")} className="btn btn-primary h-10 px-4">
            See the dashboard
          </button>
          {result.needsReview > 0 && (
            <button
              type="button"
              onClick={() => router.push("/app/transactions?uncategorised=1")}
              className="btn btn-secondary h-10 px-4"
            >
              Review {result.needsReview} transactions
            </button>
          )}
          <button type="button" onClick={reset} className="btn btn-ghost h-10 px-4">
            Import another file
          </button>
        </div>
      </div>
    );
  }

  /* ── Stage: review the mapping ────────────────────────────────── */

  if (!parsed) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-negative">That file couldn&apos;t be parsed as CSV.</p>
        <button type="button" onClick={reset} className="btn btn-secondary mt-4 h-9">
          Try another file
        </button>
      </div>
    );
  }

  const usable = parsed.rows.length;
  const preview = parsed.rows.slice(0, 8);
  const inflow = parsed.rows.filter((r) => r.amountMinor > 0).length;

  return (
    <div className="space-y-5">
      {/* Summary of what was detected */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{filename}</p>
          <p className="mt-0.5 text-xs text-muted">
            {parsed.totalRows.toLocaleString("en-GB")} rows ·{" "}
            {parsed.delimiter === "\t" ? "tab" : `"${parsed.delimiter}"`} separated ·{" "}
            {parsed.assumedDayFirst ? "day/month/year" : "month/day/year"} dates
          </p>
        </div>
        <button type="button" onClick={reset} className="btn btn-ghost h-8 text-xs">
          Choose a different file
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={usable ? "positive" : "critical"}>
          {usable.toLocaleString("en-GB")} readable
        </Badge>
        {parsed.issues.length > 0 && (
          <Badge tone="warning">{parsed.issues.length} will be skipped</Badge>
        )}
        <Badge tone="neutral">{inflow} incoming</Badge>
        <Badge tone="neutral">{usable - inflow} outgoing</Badge>
      </div>

      {/* Column mapping */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-fg">Column mapping</h3>
        <p className="mb-3 text-xs text-muted">
          Detected automatically. Change anything that looks wrong — the preview updates as you go.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_LABELS.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={`map-${field.key}`}>
                {field.label}{" "}
                <span className="font-normal text-subtle">· {field.hint}</span>
              </label>
              <select
                id={`map-${field.key}`}
                className="input"
                value={parsed.mapping[field.key]}
                onChange={(e) =>
                  setOverride((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                }
              >
                <option value={-1}>— not present —</option>
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Account selection */}
      {accounts.length > 1 && (
        <div className="max-w-xs">
          <label className="label" htmlFor="account">Import into</label>
          <select
            id="account"
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Preview */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">Preview</h3>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-muted">{formatDate(row.date)}</td>
                  <td className="max-w-[26rem] truncate font-medium text-fg">{row.description}</td>
                  <td
                    className={`num font-semibold ${
                      row.amountMinor > 0 ? "text-positive" : "text-fg"
                    }`}
                  >
                    {formatMoney(row.amountMinor, currency, { signed: row.amountMinor > 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {usable > preview.length && (
          <p className="mt-2 text-xs text-subtle">
            Showing the first {preview.length} of {usable.toLocaleString("en-GB")} rows.
          </p>
        )}
      </div>

      {/* Skipped rows, if any */}
      {parsed.issues.length > 0 && (
        <details className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">
            {parsed.issues.length} rows will be skipped
          </summary>
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            {parsed.issues.slice(0, 12).map((issue, i) => (
              <li key={i} className="truncate font-mono">
                <span className="text-warning">{issue.reason}:</span> {issue.raw}
              </li>
            ))}
          </ul>
          {parsed.issues.length > 12 && (
            <p className="mt-2 text-xs text-subtle">…and {parsed.issues.length - 12} more.</p>
          )}
        </details>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={commit}
          disabled={pending || !usable}
          className="btn btn-primary h-10 px-5"
        >
          {pending ? "Importing…" : `Import ${usable.toLocaleString("en-GB")} transactions`}
        </button>
        <button type="button" onClick={reset} className="btn btn-ghost h-10">
          Cancel
        </button>
        <p className="text-xs text-subtle">
          Re-importing an overlapping statement won&apos;t create duplicates.
        </p>
      </div>
    </div>
  );
}
