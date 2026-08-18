import { parseAmount } from "./money";
import { parseDate } from "./dates";

/**
 * CSV import.
 *
 * Every bank exports a different shape, so rather than asking the user to
 * reformat their statement we sniff the delimiter, score each column for what
 * it looks like it contains, and map it ourselves. The user can override any
 * guess before committing the import.
 */

/* ---------------------------------------------------------------------- */
/* Tokenising                                                              */
/* ---------------------------------------------------------------------- */

const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Pick the delimiter that yields the most consistent column count across the
 * first few lines — far more reliable than simply counting commas, which
 * breaks on descriptions like "TESCO STORES, LONDON".
 */
export function sniffDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  if (!sample.length) return ",";

  let best: Delimiter = ",";
  let bestScore = -Infinity;

  for (const d of DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, d).length);
    const mode = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mode < 2) continue;
    const variance = counts.reduce((a, c) => a + (c - mode) ** 2, 0) / counts.length;
    // Reward many columns, punish inconsistency hard.
    const score = mode * 2 - variance * 10;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC 4180 aware single-line split (used only for delimiter sniffing). */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Full parser. Handles quoted fields containing the delimiter or newlines,
 * doubled quotes as escapes, CRLF, and a UTF-8 BOM.
 */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = delimiter ?? sniffDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }

  row.push(cur.trim());
  if (row.some((c) => c !== "")) rows.push(row);

  return rows;
}

/* ---------------------------------------------------------------------- */
/* Column mapping                                                          */
/* ---------------------------------------------------------------------- */

export interface ColumnMapping {
  date: number;
  description: number;
  /** Single signed amount column, or -1 when the bank splits in/out */
  amount: number;
  /** Money-out column (values are positive; we negate them) */
  debit: number;
  /** Money-in column */
  credit: number;
  category: number;
  balance: number;
}

const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  date: ["date", "transaction date", "posted", "value date", "completed date", "when", "date/time"],
  description: [
    "description", "details", "narrative", "reference", "merchant", "name", "payee",
    "transaction description", "memo", "particulars", "counterparty", "to/from",
  ],
  amount: ["amount", "value", "transaction amount", "amount (gbp)", "amt", "net amount"],
  debit: ["debit", "money out", "paid out", "withdrawal", "withdrawals", "out", "expense", "dr"],
  credit: ["credit", "money in", "paid in", "deposit", "deposits", "in", "income", "cr"],
  category: ["category", "type", "classification", "transaction type", "tag"],
  balance: ["balance", "running balance", "closing balance", "balance (gbp)"],
};

function headerScore(header: string, field: keyof ColumnMapping): number {
  const h = header.toLowerCase().replace(/[^a-z0-9 /]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return 0;
  let best = 0;
  for (const hint of HEADER_HINTS[field]) {
    if (h === hint) best = Math.max(best, 100);
    else if (h.startsWith(hint) || h.endsWith(hint)) best = Math.max(best, 70);
    else if (h.includes(hint)) best = Math.max(best, 50);
  }
  return best;
}

/** Does this column's data actually look like dates / amounts / prose? */
function contentScore(values: string[], field: keyof ColumnMapping): number {
  const sample = values.filter((v) => v.trim()).slice(0, 40);
  if (!sample.length) return 0;

  if (field === "date") {
    const hits = sample.filter((v) => parseDate(v) !== null).length;
    return (hits / sample.length) * 100;
  }
  if (field === "amount" || field === "debit" || field === "credit" || field === "balance") {
    const hits = sample.filter((v) => parseAmount(v) !== null).length;
    return (hits / sample.length) * 100;
  }
  if (field === "description") {
    // Prose: mostly letters, reasonably long, and highly varied row to row.
    const alpha = sample.filter((v) => /[a-z]{3,}/i.test(v)).length / sample.length;
    const avgLen = sample.reduce((a, v) => a + v.length, 0) / sample.length;
    const unique = new Set(sample).size / sample.length;
    return alpha * 60 + Math.min(avgLen / 30, 1) * 20 + unique * 20;
  }
  if (field === "category") {
    // A category column repeats a small set of short values.
    const unique = new Set(sample).size;
    const avgLen = sample.reduce((a, v) => a + v.length, 0) / sample.length;
    if (unique > sample.length * 0.6 || avgLen > 24) return 0;
    return 60;
  }
  return 0;
}

/**
 * Choose the best column for each field. Header text is the strong signal;
 * the data itself breaks ties and rescues files with missing or junk headers.
 */
export function detectMapping(headers: string[], rows: string[][]): ColumnMapping {
  const cols = headers.map((_, i) => rows.map((r) => r[i] ?? ""));
  const taken = new Set<number>();

  const pick = (field: keyof ColumnMapping, minimum: number): number => {
    let bestIdx = -1;
    let bestScore = minimum;
    for (let i = 0; i < headers.length; i++) {
      if (taken.has(i)) continue;
      const score = headerScore(headers[i], field) * 1.6 + contentScore(cols[i], field);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) taken.add(bestIdx);
    return bestIdx;
  };

  // Order matters: the most distinctive fields claim their column first.
  const date = pick("date", 40);
  const debit = pick("debit", 95);
  const credit = pick("credit", 95);
  const amount = debit >= 0 && credit >= 0 ? -1 : pick("amount", 70);
  const balance = pick("balance", 95);
  const description = pick("description", 25);
  const category = pick("category", 90);

  return { date, description, amount, debit, credit, category, balance };
}

/** Heuristic: does the first row look like headers rather than data? */
export function looksLikeHeader(row: string[]): boolean {
  if (!row.length) return false;
  const dateish = row.filter((c) => parseDate(c) !== null).length;
  const numeric = row.filter((c) => parseAmount(c) !== null).length;
  const wordy = row.filter((c) => /^[a-z][a-z /_&()-]*$/i.test(c.trim()) && c.trim().length > 1).length;
  return dateish === 0 && numeric <= 1 && wordy >= Math.max(2, Math.floor(row.length * 0.5));
}

/* ---------------------------------------------------------------------- */
/* Row extraction                                                          */
/* ---------------------------------------------------------------------- */

export interface ParsedRow {
  date: string;
  description: string;
  amountMinor: number;
  suggestedCategory: string | null;
  rowIndex: number;
}

export interface ParseIssue {
  rowIndex: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  headers: string[];
  mapping: ColumnMapping;
  rows: ParsedRow[];
  issues: ParseIssue[];
  delimiter: Delimiter;
  totalRows: number;
  /** True when dates were ambiguous and we assumed day-first */
  assumedDayFirst: boolean;
}

/**
 * Decide between DD/MM and MM/DD for the whole file at once. If any row has a
 * first component above 12 the file must be day-first; if any *second*
 * component exceeds 12 it must be month-first. Deciding per-file rather than
 * per-row keeps a statement internally consistent.
 */
function detectDayFirst(values: string[]): boolean {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const m = String(v).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}$/);
    if (!m) continue;
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
  }
  if (monthFirst > dayFirst) return false;
  return true; // default day-first (UK/EU convention)
}

export function parseStatement(text: string, override?: Partial<ColumnMapping>): ParseResult {
  const delimiter = sniffDelimiter(text);
  const grid = parseCsv(text, delimiter);

  if (!grid.length) {
    return {
      headers: [],
      mapping: { date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1, balance: -1 },
      rows: [],
      issues: [],
      delimiter,
      totalRows: 0,
      assumedDayFirst: true,
    };
  }

  const hasHeader = looksLikeHeader(grid[0]);
  const headers = hasHeader ? grid[0] : grid[0].map((_, i) => `Column ${i + 1}`);
  const body = hasHeader ? grid.slice(1) : grid;

  const detected = detectMapping(headers, body);
  const mapping: ColumnMapping = { ...detected, ...stripUnset(override) };

  const dayFirst =
    mapping.date >= 0 ? detectDayFirst(body.map((r) => r[mapping.date] ?? "")) : true;

  const rows: ParsedRow[] = [];
  const issues: ParseIssue[] = [];

  body.forEach((cells, i) => {
    const rawLine = cells.join(delimiter === "\t" ? " | " : delimiter);

    const date = mapping.date >= 0 ? parseDate(cells[mapping.date] ?? "", dayFirst) : null;
    if (!date) {
      issues.push({ rowIndex: i, reason: "Unreadable date", raw: rawLine });
      return;
    }

    let amountMinor: number | null = null;
    if (mapping.amount >= 0) {
      amountMinor = parseAmount(cells[mapping.amount] ?? "");
    } else {
      const debit = mapping.debit >= 0 ? parseAmount(cells[mapping.debit] ?? "") : null;
      const credit = mapping.credit >= 0 ? parseAmount(cells[mapping.credit] ?? "") : null;
      if (debit != null && debit !== 0) amountMinor = -Math.abs(debit);
      else if (credit != null && credit !== 0) amountMinor = Math.abs(credit);
      else if (debit === 0 || credit === 0) amountMinor = 0;
    }

    if (amountMinor == null) {
      issues.push({ rowIndex: i, reason: "Unreadable amount", raw: rawLine });
      return;
    }
    if (amountMinor === 0) {
      issues.push({ rowIndex: i, reason: "Zero amount — skipped", raw: rawLine });
      return;
    }

    const description =
      (mapping.description >= 0 ? cells[mapping.description] : "")?.trim() || "Unknown transaction";

    const suggestedCategory =
      mapping.category >= 0 ? (cells[mapping.category] ?? "").trim() || null : null;

    rows.push({ date, description, amountMinor, suggestedCategory, rowIndex: i });
  });

  return {
    headers,
    mapping,
    rows,
    issues,
    delimiter,
    totalRows: body.length,
    assumedDayFirst: dayFirst,
  };
}

function stripUnset(o?: Partial<ColumnMapping>): Partial<ColumnMapping> {
  if (!o) return {};
  const out: Partial<ColumnMapping> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && !Number.isNaN(v)) out[k as keyof ColumnMapping] = v;
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Export                                                                  */
/* ---------------------------------------------------------------------- */

/** Serialise rows back to CSV, quoting only what needs it. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}
