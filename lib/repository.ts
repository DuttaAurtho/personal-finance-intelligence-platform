import { createHash } from "node:crypto";
import { all, get, placeholders, run, transact } from "./db";
import { DEFAULT_CATEGORIES } from "./categories";
import { Categorizer, merchantKey, normalizeDescription } from "./categorize";
import type { TrainingSample, UserRule } from "./categorize";
import type { Account, Transaction } from "./types";
import type { ParsedRow } from "./csv";

/**
 * Write-side data access: account setup, import, and the feedback loop that
 * turns a user's corrections into training data for the categoriser.
 */

/* ---------------------------------------------------------------------- */
/* Setup                                                                   */
/* ---------------------------------------------------------------------- */

/** Idempotently give a new user their category taxonomy and a default account. */
export async function ensureUserSetup(userId: number): Promise<Account> {
  return transact(async (t) => {
    const existing = await t.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM categories WHERE user_id = ?",
      userId,
    );
    if (!existing?.n) {
      for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
        await t.run(
          `INSERT OR IGNORE INTO categories (user_id, name, icon, color, kind, sort)
           VALUES (?, ?, ?, ?, ?, ?)`,
          userId,
          c.name,
          c.icon,
          c.color,
          c.kind,
          i,
        );
      }
    }

    let account = await t.get<Account>(
      "SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      userId,
    );
    if (!account) {
      const { lastInsertRowid } = await t.run(
        "INSERT INTO accounts (user_id, name, institution, type) VALUES (?, ?, ?, ?)",
        userId,
        "Main Account",
        null,
        "current",
      );
      account = (await t.get<Account>("SELECT * FROM accounts WHERE id = ?", lastInsertRowid))!;
    }
    return account;
  });
}

export function listAccounts(userId: number): Promise<Account[]> {
  return all<Account>("SELECT * FROM accounts WHERE user_id = ? ORDER BY id ASC", userId);
}

export async function createAccount(
  userId: number,
  name: string,
  type: Account["type"] = "current",
  institution?: string,
): Promise<Account> {
  const { lastInsertRowid } = await run(
    "INSERT INTO accounts (user_id, name, institution, type) VALUES (?, ?, ?, ?)",
    userId,
    name.trim() || "Account",
    institution?.trim() || null,
    type,
  );
  return (await get<Account>("SELECT * FROM accounts WHERE id = ?", lastInsertRowid))!;
}

/* ---------------------------------------------------------------------- */
/* Categoriser construction                                                */
/* ---------------------------------------------------------------------- */

/**
 * Build a categoriser primed with this user's rules and their confirmed
 * history. Confirmed transactions are the ground truth the model learns from;
 * high-confidence automatic labels are included as weak supervision once there
 * are enough of them to be worth the risk of reinforcing a mistake.
 */
export async function buildCategorizer(userId: number): Promise<Categorizer> {
  const rules = await all<UserRule>(
    "SELECT pattern, category, priority FROM rules WHERE user_id = ? ORDER BY priority ASC",
    userId,
  );

  const confirmed = await all<TrainingSample>(
    `SELECT description, amount_minor, date, category
       FROM transactions
      WHERE user_id = ? AND is_confirmed = 1 AND category != 'Uncategorised'`,
    userId,
  );

  // Self-training: only once the user has given us a real signal of their own.
  const auto =
    confirmed.length >= 15
      ? await all<TrainingSample>(
          `SELECT description, amount_minor, date, category
             FROM transactions
            WHERE user_id = ? AND is_confirmed = 0 AND confidence >= 0.9
              AND category != 'Uncategorised'
            LIMIT 3000`,
          userId,
        )
      : [];

  return new Categorizer(rules, [...confirmed, ...auto]);
}

/* ---------------------------------------------------------------------- */
/* Fingerprinting                                                          */
/* ---------------------------------------------------------------------- */

/**
 * A transaction's identity for de-duplication purposes.
 *
 * Statements overlap — people export "last 3 months" every month — so
 * re-importing must not double-count. But two identical £3.20 coffees on the
 * same day are genuinely two transactions, so a pure content hash would wrongly
 * collapse them. We therefore hash the content and append an occurrence index,
 * counting how many identical rows already exist.
 */
function fingerprintBase(accountId: number, row: { date: string; description: string; amountMinor: number }): string {
  const key = [accountId, row.date, row.amountMinor, normalizeDescription(row.description)].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/* ---------------------------------------------------------------------- */
/* Import                                                                  */
/* ---------------------------------------------------------------------- */

export interface ImportSummary {
  batchId: number;
  imported: number;
  duplicates: number;
  categorised: number;
  needsReview: number;
  total: number;
}

export async function importTransactions(
  userId: number,
  accountId: number,
  filename: string,
  rows: ParsedRow[],
): Promise<ImportSummary> {
  const categorizer = await buildCategorizer(userId);
  const knownCategories = await knownCategorySet(userId);

  // One query rather than one per row — imports are frequently thousands long.
  const existing = new Set(
    (
      await all<{ fingerprint: string }>("SELECT fingerprint FROM transactions WHERE user_id = ?", userId)
    ).map((r) => r.fingerprint),
  );

  return transact(async (t) => {
    const { lastInsertRowid: batchId } = await t.run(
      "INSERT INTO import_batches (user_id, filename, row_count) VALUES (?, ?, ?)",
      userId,
      filename.slice(0, 200),
      rows.length,
    );

    let imported = 0;
    let duplicates = 0;
    let categorised = 0;
    let needsReview = 0;

    const seen = new Map<string, number>();

    for (const row of rows) {
      const base = fingerprintBase(accountId, row);

      // The nth identical row *within this file* claims occurrence slot n.
      // Counting within the file rather than searching for a free slot is what
      // makes re-imports idempotent: the same statement always produces the
      // same fingerprints, so every row is recognised the second time round,
      // while two genuinely distinct same-day coffees still get slots 0 and 1.
      const idx = seen.get(base) ?? 0;
      seen.set(base, idx + 1);
      const fingerprint = `${base}:${idx}`;

      if (existing.has(fingerprint)) {
        duplicates++;
        continue;
      }

      const prediction = categorizer.classify(row.description, row.amountMinor, row.date);

      // A category column in the source file is a stronger signal than our guess.
      const category = row.suggestedCategory && knownCategories.has(row.suggestedCategory)
        ? row.suggestedCategory
        : prediction.category;
      const confidence = row.suggestedCategory && category === row.suggestedCategory ? 0.95 : prediction.confidence;

      const merchant = merchantKey(row.description);
      const isTransfer = categoryIsTransfer(category) ? 1 : 0;

      await t.run(
        `INSERT INTO transactions
           (user_id, account_id, date, description, merchant, amount_minor,
            category, confidence, is_confirmed, is_transfer, fingerprint, batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        userId,
        accountId,
        row.date,
        row.description.slice(0, 300),
        merchant,
        row.amountMinor,
        category,
        confidence,
        isTransfer,
        fingerprint,
        batchId,
      );

      existing.add(fingerprint);
      imported++;
      if (category !== "Uncategorised" && confidence >= 0.6) categorised++;
      else needsReview++;
    }

    await t.run(
      "UPDATE import_batches SET imported_count = ?, duplicate_count = ? WHERE id = ?",
      imported,
      duplicates,
      batchId,
    );

    return { batchId, imported, duplicates, categorised, needsReview, total: rows.length };
  });
}

const TRANSFER_NAMES = new Set(["Transfers", "Savings", "Investments", "Credit Card Payment"]);
function categoryIsTransfer(name: string): boolean {
  return TRANSFER_NAMES.has(name);
}

const knownCategoryCache = new Map<number, Set<string>>();
async function knownCategorySet(userId: number): Promise<Set<string>> {
  let set = knownCategoryCache.get(userId);
  if (!set) {
    const rows = await all<{ name: string }>("SELECT name FROM categories WHERE user_id = ?", userId);
    set = new Set(rows.map((r) => r.name));
    knownCategoryCache.set(userId, set);
  }
  return set;
}

/* ---------------------------------------------------------------------- */
/* Corrections and the learning loop                                       */
/* ---------------------------------------------------------------------- */

/**
 * Record a user's category choice. This is the single most valuable event in
 * the system: it is both an immediate correction and a labelled training
 * example that improves every future classification.
 */
export function setCategory(userId: number, transactionId: number, category: string): Promise<unknown> {
  return run(
    `UPDATE transactions
        SET category = ?, confidence = 1.0, is_confirmed = 1, is_transfer = ?
      WHERE user_id = ? AND id = ?`,
    category,
    categoryIsTransfer(category) ? 1 : 0,
    userId,
    transactionId,
  );
}

/** Apply a category to every transaction from the same merchant. */
export async function setCategoryForMerchant(
  userId: number,
  merchant: string,
  category: string,
): Promise<number> {
  const { changes } = await run(
    `UPDATE transactions
        SET category = ?, confidence = 1.0, is_confirmed = 1, is_transfer = ?
      WHERE user_id = ? AND merchant = ?`,
    category,
    categoryIsTransfer(category) ? 1 : 0,
    userId,
    merchant,
  );
  return changes;
}

export function setTransferFlag(userId: number, transactionId: number, isTransfer: boolean): Promise<unknown> {
  return run(
    "UPDATE transactions SET is_transfer = ? WHERE user_id = ? AND id = ?",
    isTransfer ? 1 : 0,
    userId,
    transactionId,
  );
}

export function setNotes(userId: number, transactionId: number, notes: string): Promise<unknown> {
  return run(
    "UPDATE transactions SET notes = ? WHERE user_id = ? AND id = ?",
    notes.slice(0, 500) || null,
    userId,
    transactionId,
  );
}

export async function deleteTransactions(userId: number, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const { changes } = await run(
    `DELETE FROM transactions WHERE user_id = ? AND id IN (${placeholders(ids.length)})`,
    userId,
    ...ids,
  );
  return changes;
}

/**
 * Re-run the classifier over everything the user hasn't confirmed by hand.
 * Called after a batch of corrections, so the lessons learned from ten
 * relabelled rows immediately propagate to the other nine hundred.
 */
export async function recategorizeAll(userId: number): Promise<{ updated: number; scanned: number }> {
  const categorizer = await buildCategorizer(userId);
  const rows = await all<Transaction>(
    `SELECT id, description, amount_minor, date, category
       FROM transactions
      WHERE user_id = ? AND is_confirmed = 0`,
    userId,
  );

  let updated = 0;
  await transact(async (t) => {
    for (const tx of rows) {
      const p = categorizer.classify(tx.description, tx.amount_minor, tx.date);
      if (p.category !== tx.category) {
        await t.run(
          `UPDATE transactions SET category = ?, confidence = ?, is_transfer = ? WHERE id = ?`,
          p.category,
          p.confidence,
          categoryIsTransfer(p.category) ? 1 : 0,
          tx.id,
        );
        updated++;
      } else {
        await t.run("UPDATE transactions SET confidence = ? WHERE id = ?", p.confidence, tx.id);
      }
    }
  });

  return { updated, scanned: rows.length };
}

/** Backfill merchant keys — used after changing the normalisation rules. */
export async function rebuildMerchants(userId: number): Promise<number> {
  const rows = await all<{ id: number; description: string }>(
    "SELECT id, description FROM transactions WHERE user_id = ?",
    userId,
  );
  await transact(async (t) => {
    for (const r of rows) {
      await t.run("UPDATE transactions SET merchant = ? WHERE id = ?", merchantKey(r.description), r.id);
    }
  });
  return rows.length;
}

/* ---------------------------------------------------------------------- */
/* Rules                                                                   */
/* ---------------------------------------------------------------------- */

export function listRules(userId: number) {
  return all<{ id: number; pattern: string; category: string; priority: number }>(
    "SELECT id, pattern, category, priority FROM rules WHERE user_id = ? ORDER BY priority ASC, id ASC",
    userId,
  );
}

export function createRule(userId: number, pattern: string, category: string, priority = 100) {
  const clean = pattern.trim().toLowerCase();
  if (!clean) throw new Error("A rule needs something to match on.");
  return run(
    "INSERT INTO rules (user_id, pattern, category, priority) VALUES (?, ?, ?, ?)",
    userId,
    clean,
    category,
    priority,
  );
}

export function deleteRule(userId: number, id: number) {
  return run("DELETE FROM rules WHERE user_id = ? AND id = ?", userId, id);
}

/* ---------------------------------------------------------------------- */
/* Budgets                                                                 */
/* ---------------------------------------------------------------------- */

export function setBudget(userId: number, category: string, amountMinor: number) {
  if (amountMinor <= 0) {
    return run("DELETE FROM budgets WHERE user_id = ? AND category = ?", userId, category);
  }
  return run(
    `INSERT INTO budgets (user_id, category, amount_minor) VALUES (?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET amount_minor = excluded.amount_minor`,
    userId,
    category,
    amountMinor,
  );
}

export function listBudgets(userId: number) {
  return all<{ category: string; amount_minor: number }>(
    "SELECT category, amount_minor FROM budgets WHERE user_id = ? ORDER BY amount_minor DESC",
    userId,
  );
}

/**
 * Propose a budget for every category from the user's own history: the median
 * of recent months, rounded up to a memorable number. Median rather than mean
 * so one blow-out month doesn't set an over-generous target.
 */
export async function suggestBudgets(userId: number, months = 6) {
  const rows = await all<{ category: string; month: string; total: number }>(
    `SELECT category, substr(date,1,7) AS month, SUM(-amount_minor) AS total
       FROM transactions
      WHERE user_id = ? AND amount_minor < 0 AND is_transfer = 0
      GROUP BY category, month
      ORDER BY month DESC`,
    userId,
  );

  const byCategory = new Map<string, number[]>();
  const monthsSeen = new Map<string, Set<string>>();

  for (const r of rows) {
    let seen = monthsSeen.get(r.category);
    if (!seen) {
      seen = new Set();
      monthsSeen.set(r.category, seen);
    }
    if (seen.size >= months && !seen.has(r.month)) continue;
    seen.add(r.month);

    const list = byCategory.get(r.category);
    if (list) list.push(r.total);
    else byCategory.set(r.category, [r.total]);
  }

  const suggestions: { category: string; amountMinor: number; basis: number }[] = [];
  for (const [category, values] of byCategory) {
    if (category === "Uncategorised" || values.length < 2) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    if (med < 500) continue; // below £5/month isn't worth budgeting
    suggestions.push({ category, amountMinor: roundToNice(med), basis: Math.round(med) });
  }

  return suggestions.sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Round up to a number a human would actually choose: £5 / £10 / £25 steps. */
function roundToNice(minor: number): number {
  const pounds = minor / 100;
  const step = pounds < 50 ? 5 : pounds < 200 ? 10 : pounds < 1000 ? 25 : 50;
  return Math.ceil(pounds / step) * step * 100;
}

/* ---------------------------------------------------------------------- */
/* Manual entry & housekeeping                                             */
/* ---------------------------------------------------------------------- */

export async function addManualTransaction(
  userId: number,
  accountId: number,
  input: { date: string; description: string; amountMinor: number; category?: string },
): Promise<number> {
  const categorizer = await buildCategorizer(userId);
  const category =
    input.category ?? categorizer.classify(input.description, input.amountMinor, input.date).category;

  const base = fingerprintBase(accountId, input);
  const existing = await all<{ fingerprint: string }>(
    "SELECT fingerprint FROM transactions WHERE user_id = ? AND fingerprint LIKE ?",
    userId,
    `${base}:%`,
  );

  const { lastInsertRowid } = await run(
    `INSERT INTO transactions
       (user_id, account_id, date, description, merchant, amount_minor,
        category, confidence, is_confirmed, is_transfer, fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?)`,
    userId,
    accountId,
    input.date,
    input.description.slice(0, 300),
    merchantKey(input.description),
    input.amountMinor,
    category,
    input.category ? 1 : 0,
    categoryIsTransfer(category) ? 1 : 0,
    `${base}:${existing.length}`,
  );
  return lastInsertRowid;
}

export function listBatches(userId: number) {
  return all<{
    id: number;
    filename: string;
    row_count: number;
    imported_count: number;
    duplicate_count: number;
    created_at: string;
  }>(
    `SELECT id, filename, row_count, imported_count, duplicate_count, created_at
       FROM import_batches WHERE user_id = ? ORDER BY id DESC LIMIT 25`,
    userId,
  );
}

/** Undo an import wholesale — vital trust feature for a data-import product. */
export async function deleteBatch(userId: number, batchId: number): Promise<number> {
  const { changes } = await run(
    "DELETE FROM transactions WHERE user_id = ? AND batch_id = ?",
    userId,
    batchId,
  );
  await run("DELETE FROM import_batches WHERE user_id = ? AND id = ?", userId, batchId);
  return changes;
}

export async function wipeUserData(userId: number): Promise<void> {
  await transact(async (t) => {
    await t.run("DELETE FROM transactions WHERE user_id = ?", userId);
    await t.run("DELETE FROM import_batches WHERE user_id = ?", userId);
    await t.run("DELETE FROM budgets WHERE user_id = ?", userId);
    await t.run("DELETE FROM rules WHERE user_id = ?", userId);
  });
  knownCategoryCache.delete(userId);
}
