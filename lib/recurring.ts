import type { Transaction, RecurringSeries } from "./types";
import { merchantLabel } from "./categorize";
import { addDays, daysBetween, todayISO } from "./dates";
import { clamp, coefficientOfVariation, mad, median } from "./stats";

/**
 * Recurring-payment detection.
 *
 * A subscription is a merchant you pay on a *rhythm*. So rather than matching
 * against a list of known subscription brands — which can only ever find what
 * we already know about — we look for statistical regularity in each merchant's
 * own payment history: are the gaps between payments consistent, and is the
 * amount stable? That finds the gym, the window cleaner and the parking permit
 * just as well as it finds Netflix.
 */

/** Nearest named cadence for a median gap, with the tolerance we'll accept. */
const CADENCES: { name: RecurringSeries["cadence"]; days: number; tolerance: number }[] = [
  { name: "weekly", days: 7, tolerance: 2 },
  { name: "fortnightly", days: 14, tolerance: 3 },
  { name: "monthly", days: 30.44, tolerance: 6 },
  { name: "quarterly", days: 91.3, tolerance: 12 },
  { name: "yearly", days: 365.25, tolerance: 30 },
];

const AVG_MONTH_DAYS = 30.44;

function classifyCadence(intervalDays: number): {
  cadence: RecurringSeries["cadence"];
  fit: number;
} {
  let best: RecurringSeries["cadence"] = "irregular";
  let bestFit = 0;
  for (const c of CADENCES) {
    const error = Math.abs(intervalDays - c.days);
    if (error <= c.tolerance) {
      // 1.0 when the gap lands exactly on the cadence, falling to 0 at the edge.
      const fit = 1 - error / c.tolerance;
      if (fit > bestFit) {
        bestFit = fit;
        best = c.name;
      }
    }
  }
  return { cadence: best, fit: bestFit };
}

export interface RecurringOptions {
  /** Minimum occurrences before a merchant can be considered recurring */
  minOccurrences?: number;
  /** Discard series scoring below this */
  minConfidence?: number;
  /** Reference date for "next due" and lapsed detection */
  today?: string;
}

export function detectRecurring(
  transactions: Transaction[],
  opts: RecurringOptions = {},
): RecurringSeries[] {
  const { minOccurrences = 3, minConfidence = 0.45, today = todayISO() } = opts;

  // Only outflows can be subscriptions; ignore transfers between own accounts.
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.amount_minor >= 0) continue;
    if (t.is_transfer) continue;
    const key = t.merchant || t.description.toLowerCase().slice(0, 24);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const results: RecurringSeries[] = [];

  for (const [merchant, txsRaw] of groups) {
    if (txsRaw.length < 2) continue;

    // Collapse same-day repeats into a single occurrence — a zero-day gap would
    // otherwise destroy the median interval.
    const byDate = new Map<string, { amount: number; ids: number[] }>();
    for (const t of txsRaw) {
      const slot = byDate.get(t.date);
      if (slot) {
        slot.amount += -t.amount_minor;
        slot.ids.push(t.id);
      } else byDate.set(t.date, { amount: -t.amount_minor, ids: [t.id] });
    }

    const occurrences = [...byDate.entries()]
      .map(([date, v]) => ({ date, amount: v.amount, ids: v.ids }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (occurrences.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < occurrences.length; i++) {
      gaps.push(daysBetween(occurrences[i - 1].date, occurrences[i].date));
    }
    if (!gaps.length) continue;

    const intervalDays = median(gaps);
    if (intervalDays < 5 || intervalDays > 400) continue;

    const amounts = occurrences.map((o) => o.amount);
    const typicalAmount = median(amounts);
    if (typicalAmount <= 0) continue;

    /* ── Score the series ───────────────────────────────────────────── */

    // How consistent are the gaps? MAD relative to the interval itself.
    const gapDispersion = gaps.length > 1 ? mad(gaps) / intervalDays : 0.25;
    const regularity = clamp(1 - gapDispersion * 2.2, 0, 1);

    // How stable is the price? Subscriptions are near-constant; groceries aren't.
    const amountCv = coefficientOfVariation(amounts);
    const amountStability = clamp(1 - amountCv * 2.5, 0, 1);

    // Does the rhythm match a cadence a business would actually bill on?
    const { cadence, fit } = classifyCadence(intervalDays);

    // More observations means more evidence, with diminishing returns.
    const evidence = clamp((occurrences.length - 1) / 5, 0, 1);

    let confidence =
      regularity * 0.38 + amountStability * 0.27 + fit * 0.2 + evidence * 0.15;

    // An identical amount every single time is the strongest possible signal.
    if (amountCv < 0.01 && occurrences.length >= 3) confidence = Math.min(1, confidence + 0.18);

    // Two data points can suggest a subscription but never prove one.
    if (occurrences.length < minOccurrences) {
      if (amountCv > 0.02 || cadence === "irregular") continue;
      confidence *= 0.6;
    }

    if (cadence === "irregular") confidence *= 0.55;
    if (confidence < minConfidence) continue;

    /* ── Project the next payment ───────────────────────────────────── */

    const lastDate = occurrences[occurrences.length - 1].date;
    let nextDate = addDays(lastDate, Math.round(intervalDays));
    // If the projection is already in the past, roll it forward.
    let guard = 0;
    while (nextDate < today && guard++ < 24) nextDate = addDays(nextDate, Math.round(intervalDays));

    // Missed by more than half a cycle beyond one full cycle → probably cancelled.
    const overdueBy = daysBetween(lastDate, today) - intervalDays;
    const status: RecurringSeries["status"] = overdueBy > intervalDays * 0.75 ? "lapsed" : "active";

    results.push({
      merchant,
      label: merchantLabel(merchant),
      category: modeOf(txsRaw.map((t) => t.category)),
      intervalDays: Math.round(intervalDays),
      cadence,
      amountMinor: Math.round(typicalAmount),
      amountVariance: amountCv,
      occurrences: occurrences.length,
      lastDate,
      nextDate,
      confidence: clamp(confidence, 0, 1),
      monthlyEquivalentMinor: Math.round((typicalAmount * AVG_MONTH_DAYS) / intervalDays),
      status,
      transactionIds: occurrences.flatMap((o) => o.ids),
    });
  }

  return results.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.monthlyEquivalentMinor - a.monthlyEquivalentMinor;
  });
}

function modeOf(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? "Uncategorised";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

/** Total committed monthly outgoing from all active recurring series. */
export function monthlyCommitment(series: RecurringSeries[]): number {
  return series
    .filter((s) => s.status === "active")
    .reduce((total, s) => total + s.monthlyEquivalentMinor, 0);
}

/** Payments falling due in the next `days` days, soonest first. */
export function upcoming(series: RecurringSeries[], days = 30, today = todayISO()) {
  const horizon = addDays(today, days);
  return series
    .filter((s) => s.status === "active" && s.nextDate >= today && s.nextDate <= horizon)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/**
 * Price rises on existing subscriptions — the thing nobody notices. Compares
 * the most recent charge against the median of everything before it.
 */
export function priceIncreases(
  series: RecurringSeries[],
  transactions: Transaction[],
): { series: RecurringSeries; oldMinor: number; newMinor: number; changePct: number }[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.merchant || t.amount_minor >= 0) continue;
    const l = byMerchant.get(t.merchant);
    if (l) l.push(t);
    else byMerchant.set(t.merchant, [t]);
  }

  const out: { series: RecurringSeries; oldMinor: number; newMinor: number; changePct: number }[] = [];

  for (const s of series) {
    if (s.status !== "active" || s.occurrences < 4) continue;
    const txs = (byMerchant.get(s.merchant) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (txs.length < 4) continue;

    const latest = -txs[txs.length - 1].amount_minor;
    const priorValues = txs.slice(0, -1).map((t) => -t.amount_minor);
    const prior = median(priorValues);
    if (prior <= 0) continue;

    const changePct = (latest - prior) / prior;
    // Ignore rounding noise and anything under a meaningful cash amount.
    if (changePct > 0.05 && latest - prior >= 50) {
      out.push({ series: s, oldMinor: Math.round(prior), newMinor: latest, changePct });
    }
  }

  return out.sort((a, b) => b.changePct - a.changePct);
}
