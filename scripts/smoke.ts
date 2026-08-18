/**
 * End-to-end smoke test of the data and ML layers, run against a throwaway
 * database. Exercises the real code paths a user hits: generate a statement,
 * import it through the CSV parser, then run every model over the result.
 *
 *   node --experimental-strip-types scripts/smoke.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "fiscora-smoke-"));
process.env.FISCORA_DB = path.join(dir, "smoke.db");

const { run, get } = await import("../lib/db.ts");
const { ensureUserSetup, importTransactions, suggestBudgets, setBudget, setCategory } =
  await import("../lib/repository.ts");
const { generateDemoTransactions, demoCsv } = await import("../lib/demo.ts");
const { parseStatement, parseCsv, sniffDelimiter } = await import("../lib/csv.ts");
const { getMonthlySeries, getCategoryTotals, getKpis, getBudgetStatus, allTransactions, detectAnomalies, getCategoryMonthlyMap } =
  await import("../lib/analytics.ts");
const { detectRecurring, monthlyCommitment, priceIncreases } = await import("../lib/recurring.ts");
const { forecastSpending, backtestSeries } = await import("../lib/forecast.ts");
const { parseAmount } = await import("../lib/money.ts");
const { parseDate } = await import("../lib/dates.ts");
const { Categorizer, merchantKey, normalizeDescription } = await import("../lib/categorize.ts");
const { monthStart, monthEnd, currentMonth } = await import("../lib/dates.ts");

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

const money = (m: number) => `£${(m / 100).toFixed(2)}`;

try {
  /* ── Parsers ───────────────────────────────────────────────────── */
  section("Amount parsing");
  check("plain decimal", parseAmount("1234.56") === 123456);
  check("thousands separator", parseAmount("1,234.56") === 123456);
  check("currency symbol", parseAmount("£1,420.00") === 142000);
  check("accounting negative", parseAmount("(45.00)") === -4500);
  check("EU decimal comma", parseAmount("1.234,56") === 123456);
  check("lone comma decimal", parseAmount("12,30") === 1230);
  check("trailing DR marker", parseAmount("100.00 DR") === -10000);
  check("rejects junk", parseAmount("not a number") === null);

  section("Date parsing");
  check("ISO", parseDate("2026-03-14") === "2026-03-14");
  check("UK day-first", parseDate("14/03/2026", true) === "2026-03-14");
  check("US month-first", parseDate("03/14/2026", false) === "2026-03-14");
  check("unambiguous day", parseDate("25/12/2026", false) === "2026-12-25");
  check("written month", parseDate("14 Mar 2026") === "2026-03-14");
  check("rejects impossible", parseDate("32/13/2026") === null);

  section("Description normalisation");
  const noisy = normalizeDescription("CARD PAYMENT TO TESCO STORES 3411, LONDON GB");
  check(
    "strips card noise and trailing geography",
    !noisy.includes("card payment") && !noisy.includes("london") && noisy.startsWith("tesco"),
    noisy,
  );
  check(
    "unwraps processor prefix",
    normalizeDescription("SQ *BLUE BOTTLE COFFEE") === "blue bottle coffee",
    normalizeDescription("SQ *BLUE BOTTLE COFFEE"),
  );
  check(
    "branches collapse to one merchant",
    merchantKey("TESCO STORES 3411") === merchantKey("TESCO EXPRESS SOHO"),
    `${merchantKey("TESCO STORES 3411")} / ${merchantKey("TESCO EXPRESS SOHO")}`,
  );

  section("CSV handling");
  const semi = "Date;Description;Amount\n14/03/2026;SHOP;-12,50";
  check("sniffs semicolons", sniffDelimiter(semi) === ";");
  const quoted = parseCsv('a,b\n"has, comma","says ""hi"""');
  check("quoted delimiter", quoted[1][0] === "has, comma", quoted[1][0]);
  check("escaped quotes", quoted[1][1] === 'says "hi"', quoted[1][1]);

  const splitCols = [
    "Date,Description,Money Out,Money In,Balance",
    "01/03/2026,RENT PAYMENT,1250.00,,2000.00",
    "25/03/2026,ACME SALARY,,3180.00,5180.00",
  ].join("\n");
  const splitParsed = parseStatement(splitCols);
  check("maps split debit/credit columns", splitParsed.rows.length === 2, `${splitParsed.rows.length} rows`);
  check("negates money-out", splitParsed.rows[0].amountMinor === -125000, money(splitParsed.rows[0].amountMinor));
  check("keeps money-in positive", splitParsed.rows[1].amountMinor === 318000, money(splitParsed.rows[1].amountMinor));

  const sample = parseStatement(demoCsv());
  check("parses the generated sample statement", sample.rows.length > 100, `${sample.rows.length} rows`);
  check("no unreadable rows in sample", sample.issues.length === 0, `${sample.issues.length} issues`);

  /* ── Import ────────────────────────────────────────────────────── */
  section("Import pipeline");
  run(
    "INSERT INTO users (email, name, password_hash, currency) VALUES (?, ?, ?, ?)",
    "smoke@test.local",
    "Smoke",
    "x",
    "GBP",
  );
  const userId = get<{ id: number }>("SELECT id FROM users WHERE email = ?", "smoke@test.local")!.id;
  const account = ensureUserSetup(userId);

  const rows = generateDemoTransactions(24);
  const first = importTransactions(userId, account.id, "smoke.csv", rows);
  check("imports the whole statement", first.imported === rows.length, `${first.imported} of ${rows.length}`);
  check(
    "categorises most rows automatically",
    first.categorised / first.imported > 0.85,
    `${((first.categorised / first.imported) * 100).toFixed(1)}% auto-categorised`,
  );

  const second = importTransactions(userId, account.id, "smoke.csv", rows);
  check("re-import creates no duplicates", second.imported === 0, `${second.duplicates} skipped as duplicates`);

  /* ── Analytics ─────────────────────────────────────────────────── */
  section("Analytics");
  const series = getMonthlySeries(userId, 24);
  check("builds a monthly series", series.length >= 20, `${series.length} months`);
  check("no gaps in the series", series.every((s) => typeof s.spendMinor === "number"));

  const month = series[series.length - 2].month;
  const kpis = getKpis(userId, monthStart(month), monthEnd(month));
  check("computes KPIs", kpis.spendMinor > 0 && kpis.incomeMinor > 0, `spend ${money(kpis.spendMinor)}, income ${money(kpis.incomeMinor)}`);
  check("savings rate is plausible", kpis.savingsRate !== null && kpis.savingsRate > -1 && kpis.savingsRate < 1, `${((kpis.savingsRate ?? 0) * 100).toFixed(1)}%`);

  const cats = getCategoryTotals(userId, monthStart(month), monthEnd(month));
  check("breaks spending down by category", cats.length >= 5, `${cats.length} categories`);
  check("shares sum to 1", Math.abs(cats.reduce((a, c) => a + c.share, 0) - 1) < 0.001);
  check(
    "transfers excluded from spend",
    !cats.some((c) => ["Transfers", "Savings", "Investments"].includes(c.category)),
  );
  console.log(`      top: ${cats.slice(0, 5).map((c) => `${c.category} ${money(c.totalMinor)}`).join(", ")}`);

  /* ── Categoriser ───────────────────────────────────────────────── */
  section("Categorisation");
  const all = allTransactions(userId);
  const clf = new Categorizer(
    [],
    all.filter((t) => t.category !== "Uncategorised").map((t) => ({
      description: t.description,
      amount_minor: t.amount_minor,
      date: t.date,
      category: t.category,
    })),
  );
  check("model trains on history", clf.trainedOn > 500, `${clf.trainedOn} training examples`);

  const trials: [string, number, string][] = [
    ["TESCO STORES 4411 LONDON", -3450, "Groceries"],
    ["NETFLIX.COM", -1799, "Subscriptions"],
    ["TFL TRAVEL CHARGE", -580, "Transport"],
    ["RENT PAYMENT LANDLORD", -125000, "Rent & Mortgage"],
    ["ACME ANALYTICS LTD SALARY", 318000, "Salary"],
    ["PRET A MANGER 442", -890, "Eating Out"],
  ];
  let correct = 0;
  for (const [desc, amount, expected] of trials) {
    const p = clf.classify(desc, amount, "2026-03-14");
    if (p.category === expected) correct++;
    else console.log(`      miss: "${desc}" → ${p.category} (expected ${expected})`);
  }
  check("classifies known merchants", correct === trials.length, `${correct}/${trials.length} correct`);

  const unconfirmed = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND category = 'Uncategorised'",
    userId,
  )!.n;
  check("few rows left unlabelled", unconfirmed / all.length < 0.1, `${unconfirmed} of ${all.length}`);

  // Correcting one row should be recorded as training data
  setCategory(userId, all[0].id, "Pets");
  const confirmedRow = get<{ is_confirmed: number; category: string }>(
    "SELECT is_confirmed, category FROM transactions WHERE id = ?",
    all[0].id,
  )!;
  check("a correction is stored as confirmed", confirmedRow.is_confirmed === 1 && confirmedRow.category === "Pets");

  /* ── Recurring ─────────────────────────────────────────────────── */
  section("Recurring detection");
  const recurring = detectRecurring(all);
  const labels = recurring.map((r) => r.label.toLowerCase());
  check("finds subscriptions", recurring.length >= 8, `${recurring.length} series found`);
  check("finds Netflix", labels.some((l) => l.includes("netflix")));
  check("finds Spotify", labels.some((l) => l.includes("spotify")));
  check(
    "finds the monthly rent",
    recurring.some((r) => r.category === "Rent & Mortgage" && r.cadence === "monthly"),
    recurring.filter((r) => r.category === "Rent & Mortgage").map((r) => r.label).join(", "),
  );
  check(
    "monthly cadence detected correctly",
    recurring.filter((r) => r.cadence === "monthly").length >= 6,
    `${recurring.filter((r) => r.cadence === "monthly").length} monthly`,
  );
  check("gym shows as lapsed", recurring.some((r) => r.label.toLowerCase().includes("puregym") && r.status === "lapsed"));
  check("commitment is a sensible figure", monthlyCommitment(recurring) > 100000, money(monthlyCommitment(recurring)));

  const rises = priceIncreases(recurring, all);
  check("spots the Netflix price rise", rises.some((r) => r.series.label.toLowerCase().includes("netflix")), `${rises.length} rises found`);

  /* ── Anomalies ─────────────────────────────────────────────────── */
  section("Anomaly detection");
  const anomalies = detectAnomalies(all, { lookbackDays: 800 });
  check("finds outliers", anomalies.length > 0, `${anomalies.length} flagged`);
  check("outliers really are large", anomalies.every((a) => a.amountMinor > a.medianMinor * 2));

  /* ── Forecast ──────────────────────────────────────────────────── */
  section("Forecasting");
  const closed = series.filter((s) => s.month < currentMonth());
  const forecast = forecastSpending({
    history: closed,
    byCategory: getCategoryMonthlyMap(userId),
    commitmentMinor: monthlyCommitment(recurring),
  });
  check("produces a forecast", forecast !== null);
  if (forecast) {
    check("prediction is positive", forecast.predictedMinor > 0, money(forecast.predictedMinor));
    check("interval brackets the prediction", forecast.lowMinor <= forecast.predictedMinor && forecast.predictedMinor <= forecast.highMinor, `${money(forecast.lowMinor)} – ${money(forecast.highMinor)}`);
    check("model weights sum to 1", Math.abs(forecast.contributions.reduce((a, c) => a + c.weight, 0) - 1) < 0.001);
    check("reports an error rate", forecast.mape !== null, forecast.mape !== null ? `${(forecast.mape * 100).toFixed(1)}% MAPE` : "");
    check("error rate is reasonable", (forecast.mape ?? 1) < 0.35, `${((forecast.mape ?? 1) * 100).toFixed(1)}%`);
    check("breaks the forecast down by category", forecast.byCategory.length > 3, `${forecast.byCategory.length} categories`);
    const catSum = forecast.byCategory.reduce((a, c) => a + c.predictedMinor, 0);
    check("category forecasts reconcile with the total", Math.abs(catSum - forecast.predictedMinor) / forecast.predictedMinor < 0.05, `${money(catSum)} vs ${money(forecast.predictedMinor)}`);
    console.log(`      weights: ${forecast.contributions.map((c) => `${c.model} ${(c.weight * 100).toFixed(0)}%`).join(", ")}`);
  }

  const bt = backtestSeries(closed);
  check("backtest produces a track record", bt.length >= 10, `${bt.length} months replayed`);

  /* ── Budgets ───────────────────────────────────────────────────── */
  section("Budgets");
  const suggestions = suggestBudgets(userId, 6);
  check("suggests budgets from history", suggestions.length >= 5, `${suggestions.length} suggested`);
  check(
    "suggestions are rounded to memorable figures",
    suggestions.every((s) => s.amountMinor % 500 === 0),
    suggestions.slice(0, 4).map((s) => money(s.amountMinor)).join(", "),
  );

  for (const s of suggestions.slice(0, 5)) setBudget(userId, s.category, s.amountMinor);
  const status = getBudgetStatus(userId, currentMonth());
  check("budget status computed", status.length === 5, `${status.length} budgets`);
  check("every budget has a state", status.every((b) => ["under", "on-track", "at-risk", "over"].includes(b.state)));

  /* ── Result ────────────────────────────────────────────────────── */
  console.log(
    failures === 0
      ? "\n✓ All smoke checks passed.\n"
      : `\n✗ ${failures} check${failures > 1 ? "s" : ""} failed.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  try {
    (await import("../lib/db.ts")).getDb().close();
  } catch {
    /* already closed */
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will clear the temp directory eventually */
  }
}
