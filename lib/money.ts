/**
 * Money helpers. Everything internal is integer minor units; these functions
 * are the only place a value becomes a float, and only for display.
 */

const SYMBOLS: Record<string, string> = {
  BDT: "৳",
  GBP: "£",
  USD: "$",
  EUR: "€",
  INR: "₹",
  PKR: "₨",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  NZD: "NZ$",
  ZAR: "R",
  SEK: "kr ",
  NGN: "₦",
};

/** Full display names, so the picker reads "৳ BDT — Bangladeshi Taka". */
const CURRENCY_NAMES: Record<string, string> = {
  BDT: "Bangladeshi Taka",
  GBP: "British Pound",
  USD: "US Dollar",
  EUR: "Euro",
  INR: "Indian Rupee",
  PKR: "Pakistani Rupee",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  NZD: "New Zealand Dollar",
  ZAR: "South African Rand",
  SEK: "Swedish Krona",
  NGN: "Nigerian Naira",
};

export const CURRENCIES = Object.keys(SYMBOLS);

export function currencyName(code: string): string {
  return CURRENCY_NAMES[code] ?? code;
}

/** `{code, label}` pairs for a currency `<select>`. */
export const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({
  code,
  label: `${symbolFor(code).trim()} ${code} — ${currencyName(code)}`,
}));

export function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? currency + " ";
}

/**
 * Parse a human-written amount into minor units.
 * Handles "1,234.56", "(45.00)" for negatives, "£12.30", "12,30" (EU decimal
 * comma), and trailing "CR"/"DR" markers used by several UK banks.
 */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let sign = 1;

  // Accounting-style negatives: (12.34)
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }

  // Credit/debit markers
  if (/\bCR\b\.?$/i.test(s)) s = s.replace(/\bCR\b\.?$/i, "").trim();
  else if (/\bDR\b\.?$/i.test(s)) {
    sign = -1;
    s = s.replace(/\bDR\b\.?$/i, "").trim();
  }

  // Strip currency symbols, spaces and non-breaking spaces
  s = s.replace(/[£$€₹¥₦৳₨]|\bGBP\b|\bUSD\b|\bEUR\b/gi, "").replace(/[\s  ]/g, "");

  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  }
  if (!s) return null;

  // Decide which separator is the decimal point.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A lone comma is a decimal separator only when it looks like one (,dd)
    const tail = s.length - lastComma - 1;
    s = tail === 2 || tail === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  }

  if (!/^\d*\.?\d*$/.test(s) || s === "." || s === "") return null;

  const [whole, frac = ""] = s.split(".");
  const cents = (frac + "00").slice(0, 2);
  const value = Number(whole || "0") * 100 + Number(cents);
  if (!Number.isFinite(value)) return null;
  return sign * value;
}

/** Format minor units for display: 132050 -> "£1,320.50" */
export function formatMoney(
  minor: number,
  currency = "GBP",
  opts: { signed?: boolean; compact?: boolean; decimals?: boolean } = {},
): string {
  const { signed = false, compact = false, decimals = true } = opts;
  const sym = symbolFor(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor);

  let body: string;
  if (compact && abs >= 100_000_00) body = (abs / 100_000_00).toFixed(1).replace(/\.0$/, "") + "m";
  else if (compact && abs >= 100_000) body = (abs / 100_000).toFixed(1).replace(/\.0$/, "") + "k";
  else
    body = (abs / 100).toLocaleString("en-GB", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });

  const prefix = negative ? "−" : signed ? "+" : "";
  return `${prefix}${sym}${body}`;
}

/** Compact axis label: 1420 -> "£1.4k" */
export function formatAxis(minor: number, currency = "GBP"): string {
  return formatMoney(minor, currency, { compact: true, decimals: false });
}

export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(decimals)}%`;
}

/**
 * Unsigned percentage — for when the direction is already carried by a
 * neighbouring word ("up"/"down", "higher"/"lower", "error"). Pairing that
 * wording with `formatPercent`'s own "+" prefix produces contradictions like
 * "+31% down"; this is the version to reach for instead.
 */
export function formatPercentAbs(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${(Math.abs(value) * 100).toFixed(decimals)}%`;
}

/** Safe percentage delta that avoids Infinity when the base is zero. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}
