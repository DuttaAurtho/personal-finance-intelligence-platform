/**
 * Date helpers. All internal dates are ISO `YYYY-MM-DD` strings handled in UTC
 * so that a user in any timezone sees the same month boundaries as their bank.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY = 86_400_000;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toUTC(iso: string): number {
  return Date.parse(iso + "T00:00:00Z");
}

export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** `YYYY-MM` bucket for a date */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(monthKeyStr: string, n: number): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function monthStart(monthKeyStr: string): string {
  return `${monthKeyStr}-01`;
}

export function monthEnd(monthKeyStr: string): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  return `${monthKeyStr}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function daysInMonth(monthKeyStr: string): number {
  const [y, m] = monthKeyStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-03" -> "March 2026"; short -> "Mar 2026" */
export function formatMonth(monthKeyStr: string, short = false): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  if (!m || m < 1 || m > 12) return monthKeyStr;
  const name = MONTH_NAMES[m - 1];
  return `${short ? name.slice(0, 3) : name} ${y}`;
}

/** "2026-03-14" -> "14 Mar 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!m) return iso;
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/** Human relative day, e.g. "in 3 days", "yesterday" */
export function relativeDay(iso: string, from = todayISO()): string {
  const d = daysBetween(from, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 0) return d < 30 ? `in ${d} days` : `in ${Math.round(d / 30)} months`;
  const a = Math.abs(d);
  return a < 30 ? `${a} days ago` : `${Math.round(a / 30)} months ago`;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

/**
 * Parse the date formats that appear in real bank exports. Returns ISO or null.
 * `preferDMY` disambiguates 01/02/2026 — UK banks say 1 Feb, US banks say 2 Jan.
 */
export function parseDate(raw: string, preferDMY = true): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^["']|["']$/g, "");
  if (!s) return null;

  // ISO 8601, optionally with a time component
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return validate(+m[1], +m[2], +m[3]);

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return validate(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or MM/DD/YYYY (also 2-digit years)
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    // If one value can only be a day, that settles it.
    if (a > 12) return validate(year, b, a);
    if (b > 12) return validate(year, a, b);
    return preferDMY ? validate(year, b, a) : validate(year, a, b);
  }

  // "14 Mar 2026", "14 March 2026", "Mar 14, 2026"
  m = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*(\d{2,4})$/);
  if (m) {
    const mi = monthIndex(m[2]);
    let year = +m[3];
    if (year < 100) year += 2000;
    if (mi) return validate(year, mi, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,})[\s-]*(\d{1,2}),?[\s-]*(\d{2,4})$/);
  if (m) {
    const mi = monthIndex(m[1]);
    let year = +m[3];
    if (year < 100) year += 2000;
    if (mi) return validate(year, mi, +m[2]);
  }

  // Last resort: let the engine try, but only accept an unambiguous result.
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function monthIndex(name: string): number | null {
  const n = name.toLowerCase().slice(0, 3);
  const i = MONTH_NAMES.findIndex((x) => x.toLowerCase().startsWith(n));
  return i < 0 ? null : i + 1;
}

function validate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Inclusive list of month keys from `a` to `b`. */
export function monthRange(a: string, b: string): string[] {
  const out: string[] = [];
  let cur = a;
  let guard = 0;
  while (cur <= b && guard++ < 600) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}
