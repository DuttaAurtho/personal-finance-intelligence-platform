import type { ParsedRow } from "./csv";
import { addDays, daysInMonth, monthKey, todayISO, addMonths } from "./dates";
import { importTransactions, setBudgets, suggestBudgets } from "./repository";

/**
 * Synthetic but realistic demo data.
 *
 * An analytics product is impossible to evaluate on an empty account, so the
 * demo generates two years of plausible transactions for a UK household. It is
 * deliberately *messy*: seasonal energy bills, a Christmas spike, a mid-series
 * pay rise, a Netflix price increase, a cancelled gym membership and a couple
 * of genuine outliers — the exact patterns the detection modules exist to find.
 *
 * A seeded PRNG drives all of it: pass the same seed and you get exactly the
 * same history back, which keeps bugs reproducible, while each new account is
 * given its own seed so no two demos look alike.
 */

/** Mulberry32 — small, fast, and good enough for generating fixtures. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  rand: () => number;
  rows: ParsedRow[];
  index: number;
}

function push(g: Gen, date: string, description: string, pounds: number) {
  g.rows.push({
    date,
    description,
    amountMinor: Math.round(pounds * 100),
    suggestedCategory: null,
    rowIndex: g.index++,
  });
}

/** Random float in [lo, hi). */
function between(g: Gen, lo: number, hi: number): number {
  return lo + g.rand() * (hi - lo);
}

function pick<T>(g: Gen, items: T[]): T {
  return items[Math.floor(g.rand() * items.length)];
}

/** Clamp a day number to a valid day within the given month. */
function dayIn(month: string, day: number): string {
  const max = daysInMonth(month);
  return `${month}-${String(Math.min(Math.max(1, day), max)).padStart(2, "0")}`;
}

const GROCERS = [
  "TESCO STORES 3411",
  "SAINSBURYS SMKT 0429",
  "ALDI 88 LONDON GB",
  "LIDL GB LONDON",
  "M&S SIMPLY FOOD",
  "CO-OP GROUP 3388",
  "WAITROSE 621",
];

const EATING_OUT = [
  "PRET A MANGER 442",
  "GREGGS PLC 1029",
  "SQ *THE ARCHIVE CAFE",
  "NANDOS CHELSEA",
  "WAGAMAMA SOHO",
  "DELIVEROO",
  "JUST EAT",
  "FRANCO MANCA",
  "HONEST BURGERS",
  "STARBUCKS 4821",
  "COSTA COFFEE 2210",
  "DISHOOM KINGS CROSS",
];

const SHOPPING = [
  "AMAZON.CO.UK*MK8YT",
  "ARGOS RETAIL 4412",
  "UNIQLO OXFORD ST",
  "ZARA UK 118",
  "JOHN LEWIS PLC",
  "IKEA WEMBLEY",
  "ASOS.COM",
  "SPORTS DIRECT 2201",
  "CURRYS 4410",
];

const TRANSPORT = ["TFL TRAVEL CHARGE", "TFL.GOV.UK/CP", "TRAINLINE.COM", "UBER *TRIP", "BOLT.EU"];

const HEALTH = ["BOOTS 4412", "SUPERDRUG 221", "PUREGYM LTD", "SPECSAVERS"];

const ENTERTAINMENT = ["ODEON CINEMAS", "CINEWORLD 442", "DICE FM", "TICKETMASTER UK", "STEAM GAMES"];

/**
 * Build the transaction set. `months` of history ending with the current month.
 */
export function generateDemoTransactions(months = 24, seed = 20260318): ParsedRow[] {
  const g: Gen = { rand: rng(seed), rows: [], index: 0 };

  const today = todayISO();
  const thisMonth = monthKey(today);
  const startMonth = addMonths(thisMonth, -(months - 1));

  /* ── The household ────────────────────────────────────────────────
     Drawn from the seed rather than hard-coded, so two accounts don't
     just differ in their random noise — they have different rent, pay
     and bills, which is what stops every demo looking like a copy of
     the last one. Ranges are chosen to stay plausible for one person. */
  const rent = Math.round(between(g, 780, 1650) / 5) * 5;
  const councilTax = Math.round(between(g, 95, 215) * 2) / 2;
  const energyBase = Math.round(between(g, 42, 88));
  const waterBill = Math.round(between(g, 22, 46) * 10) / 10;
  const broadband = Math.round(between(g, 24, 46));
  const mobile = Math.round(between(g, 8, 34));
  const contentsInsurance = Math.round(between(g, 8, 26) * 100) / 100;
  const savingsTransfer = Math.round(between(g, 120, 520) / 10) * 10;
  const investTransfer = Math.round(between(g, 50, 350) / 10) * 10;
  const payDay = Math.round(between(g, 24, 28));

  // Salary rises once, roughly two-thirds of the way through the history.
  const raiseAt = Math.floor(months * 0.65);
  const baseSalary = Math.round(between(g, 2350, 4600) / 10) * 10;
  const raisedSalary = Math.round((baseSalary * between(g, 1.06, 1.16)) / 10) * 10;
  let salary = baseSalary;

  // Netflix puts its price up at a fixed point so the price-rise detector has
  // something real to find.
  const netflixRiseAt = Math.floor(months * 0.55);
  // The gym is cancelled near the end, creating a genuine "lapsed" series.
  const gymEndsAt = months - 3;

  for (let i = 0; i < months; i++) {
    const month = addMonths(startMonth, i);
    const isCurrentMonth = month === thisMonth;
    const lastDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
    const monthNum = Number(month.slice(5, 7));

    // Only emit transactions up to today in the current month.
    const within = (day: number) => day <= lastDay;

    /* ── Income ──────────────────────────────────────────────── */
    if (i === raiseAt) salary = raisedSalary;
    if (within(payDay)) {
      push(g, dayIn(month, payDay), "ACME ANALYTICS LTD SALARY", salary + between(g, -12, 12));
    }
    // Occasional freelance work
    if (g.rand() < 0.25 && within(18)) {
      push(g, dayIn(month, Math.round(between(g, 8, 18))), "STRIPE PAYOUT FREELANCE", between(g, 220, 780));
    }
    // Interest on savings
    if (within(28)) push(g, dayIn(month, 28), "GROSS INTEREST PAID", between(g, 3, 14));

    /* ── Fixed commitments ───────────────────────────────────── */
    if (within(1)) push(g, dayIn(month, 1), "RENT PAYMENT LANDLORD", -rent);
    if (within(3)) push(g, dayIn(month, 3), "CAMDEN COUNCIL TAX", -councilTax);

    // Energy follows the weather: dear in winter, cheap in summer.
    const seasonal = 1 + 0.55 * Math.cos(((monthNum - 1) / 12) * 2 * Math.PI);
    if (within(6)) push(g, dayIn(month, 6), "OCTOPUS ENERGY LTD", -(energyBase * seasonal + between(g, -6, 6)));
    if (within(8)) push(g, dayIn(month, 8), "THAMES WATER UTILITIES", -waterBill);
    if (within(10)) push(g, dayIn(month, 10), "HYPEROPTIC BROADBAND", -broadband);
    if (within(12)) push(g, dayIn(month, 12), "VODAFONE LTD MOBILE", -mobile);
    if (within(14)) push(g, dayIn(month, 14), "ADMIRAL INSURANCE CONTENTS", -contentsInsurance);

    /* ── Subscriptions ───────────────────────────────────────── */
    if (within(2)) push(g, dayIn(month, 2), "NETFLIX.COM", -(i >= netflixRiseAt ? 17.99 : 15.99));
    if (within(4)) push(g, dayIn(month, 4), "SPOTIFY UK", -11.99);
    if (within(7)) push(g, dayIn(month, 7), "APPLE.COM/BILL ICLOUD", -2.99);
    if (within(16)) push(g, dayIn(month, 16), "AMAZON PRIME MEMBERSHIP", -8.99);
    if (i < gymEndsAt && within(20)) push(g, dayIn(month, 20), "PUREGYM LTD MEMBERSHIP", -24.99);
    if (i >= Math.floor(months * 0.4) && within(11)) push(g, dayIn(month, 11), "OPENAI *CHATGPT SUBSCR", -20);

    /* ── Savings & investments (transfers, not spending) ─────── */
    if (within(26)) push(g, dayIn(month, 26), "TRANSFER TO SAVINGS POT", -(i >= raiseAt ? savingsTransfer * 1.4 : savingsTransfer));
    if (within(26)) push(g, dayIn(month, 26), "VANGUARD INVESTMENTS DD", -investTransfer);

    /* ── Groceries: roughly weekly ───────────────────────────── */
    const shops = Math.round(between(g, 5, 9));
    for (let s = 0; s < shops; s++) {
      const day = Math.round(between(g, 1, 28));
      if (!within(day)) continue;
      const festive = monthNum === 12 ? 1.45 : 1;
      push(g, dayIn(month, day), pick(g, GROCERS), -between(g, 14, 68) * festive);
    }

    /* ── Eating out: weekend-biased ──────────────────────────── */
    const meals = Math.round(between(g, 6, 14));
    for (let s = 0; s < meals; s++) {
      let day = Math.round(between(g, 1, 28));
      // Nudge a portion of them onto Fri/Sat to create a real weekend skew.
      if (g.rand() < 0.45) {
        const iso = dayIn(month, day);
        const dow = new Date(Date.parse(iso + "T00:00:00Z")).getUTCDay();
        const shift = (5 - dow + 7) % 7;
        day = Math.min(28, day + shift);
      }
      if (!within(day)) continue;
      push(g, dayIn(month, day), pick(g, EATING_OUT), -between(g, 3.2, 46));
    }

    /* ── Transport ───────────────────────────────────────────── */
    const trips = Math.round(between(g, 8, 18));
    for (let s = 0; s < trips; s++) {
      const day = Math.round(between(g, 1, 28));
      if (!within(day)) continue;
      push(g, dayIn(month, day), pick(g, TRANSPORT), -between(g, 2.4, 24));
    }

    /* ── Discretionary ───────────────────────────────────────── */
    const buys = Math.round(between(g, 2, 6)) + (monthNum === 12 ? 4 : 0);
    for (let s = 0; s < buys; s++) {
      const day = Math.round(between(g, 1, 28));
      if (!within(day)) continue;
      push(g, dayIn(month, day), pick(g, SHOPPING), -between(g, 8, 95));
    }

    if (g.rand() < 0.6) {
      const day = Math.round(between(g, 1, 28));
      if (within(day)) push(g, dayIn(month, day), pick(g, ENTERTAINMENT), -between(g, 9, 52));
    }
    if (g.rand() < 0.5) {
      const day = Math.round(between(g, 1, 28));
      if (within(day)) push(g, dayIn(month, day), pick(g, HEALTH), -between(g, 6, 38));
    }
    if (g.rand() < 0.35) {
      const day = Math.round(between(g, 1, 28));
      if (within(day)) push(g, dayIn(month, day), "SHELL FUEL LONDON", -between(g, 42, 72));
    }
    if (g.rand() < 0.3) {
      const day = Math.round(between(g, 1, 28));
      if (within(day)) push(g, dayIn(month, day), "CASH WITHDRAWAL LINK ATM", -between(g, 20, 60));
    }

    /* ── Big, occasional events ──────────────────────────────── */
    // Summer holiday
    if ((monthNum === 7 || monthNum === 8) && g.rand() < 0.7) {
      if (within(12)) push(g, dayIn(month, 12), "RYANAIR FLIGHTS", -between(g, 180, 420));
      if (within(14)) push(g, dayIn(month, 14), "BOOKING.COM HOTEL", -between(g, 320, 760));
    }
    // Christmas
    if (monthNum === 12) {
      if (within(18)) push(g, dayIn(month, 18), "AMAZON.CO.UK*GIFTS", -between(g, 180, 340));
      if (within(20)) push(g, dayIn(month, 20), "JOHN LEWIS PLC", -between(g, 90, 220));
    }
    // A genuine outlier every so often, for the anomaly detector to catch
    if (g.rand() < 0.12) {
      const day = Math.round(between(g, 5, 25));
      if (within(day)) {
        push(
          g,
          dayIn(month, day),
          pick(g, ["CURRYS 4410 LAPTOP", "APPLE STORE REGENT ST", "DFS FURNITURE"]),
          -between(g, 520, 1400),
        );
      }
    }
    // Annual car insurance
    if (monthNum === 4 && within(15)) push(g, dayIn(month, 15), "DIRECT LINE CAR INSURANCE", -418);
    // Annual Amazon-adjacent renewal
    if (monthNum === 9 && within(9)) push(g, dayIn(month, 9), "ADOBE CREATIVE CLOUD ANNUAL", -196.9);
  }

  return g.rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Populate a fresh demo account and give it sensible budgets.
 *
 * The seed is derived per account rather than left at its default, so two
 * people trying the demo — or one person creating a second account — don't
 * get byte-identical histories and conclude the app is showing them somebody
 * else's data. Mixing in the clock as well as the id means re-seeding the
 * same account after a wipe also produces a fresh history.
 */
export async function seedDemoData(
  userId: number,
  accountId: number,
  months = 24,
  seed = (Math.imul(userId || 1, 2654435761) ^ Date.now()) >>> 0,
) {
  const rows = generateDemoTransactions(months, seed);
  const summary = await importTransactions(userId, accountId, "demo-statement.csv", rows);

  // Budgets derived from the generated history, so they're realistic and the
  // budget page has something meaningful to show immediately.
  const suggestions = await suggestBudgets(userId, 6);
  await setBudgets(userId, suggestions.slice(0, 9));

  return summary;
}

/** The demo statement, offered as a downloadable CSV so users can try importing. */
export function demoCsv(): string {
  const rows = generateDemoTransactions(4, 424242);
  const lines = ["Date,Description,Amount,Balance"];
  let balance = 240000;
  for (const r of rows) {
    balance += r.amountMinor;
    const [y, m, d] = r.date.split("-");
    lines.push(
      `${d}/${m}/${y},"${r.description}",${(r.amountMinor / 100).toFixed(2)},${(balance / 100).toFixed(2)}`,
    );
  }
  return lines.join("\r\n");
}

export { addDays };
