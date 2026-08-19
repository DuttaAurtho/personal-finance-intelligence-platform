import type { Client, InValue, ResultSet } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Storage layer, backed by libSQL.
 *
 * Locally this talks to a plain file (`file:./data/fiscora.db`) with zero
 * setup and zero cost — the original "runs on your machine" design. Set
 * TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (a free hosted libSQL database from
 * turso.tech) and the exact same code talks to that instead, which is what
 * makes this deployable to a serverless host like Vercel: those platforms
 * give functions a read-only filesystem, so a local SQLite *file* can't live
 * there, but a libSQL *client* can still reach a real database over the network.
 *
 * The client API is promise-based (it's a network protocol under the hood,
 * even for the local file case), so every query in this app is async —
 * unlike the node:sqlite version this replaced.
 *
 * The two modes deliberately load different builds of the client package.
 * `@libsql/client`'s default entry unconditionally imports its local-file
 * driver at module-evaluation time, which pulls in a native binary — fine for
 * local dev, but a well-known way for a serverless function's bundle to fail
 * to load on a platform it wasn't built for. `@libsql/client/web` has no
 * local-file support and therefore no native dependency at all, which is why
 * it's the build Turso recommends for exactly this deployment shape. Since
 * the remote path never needs `file:` URLs, it costs nothing to use it there
 * and sidesteps that failure mode entirely — loaded via dynamic `import()` so
 * the *other* build's native dependency is never evaluated in the same process.
 */

const isRemote = !!process.env.TURSO_DATABASE_URL;
const LOCAL_DB_PATH = process.env.FISCORA_DB ?? path.join(process.cwd(), "data", "fiscora.db");

declare global {
  // eslint-disable-next-line no-var
  var __fiscoraClient: Promise<Client> | undefined;
}

async function createFiscoraClient(): Promise<Client> {
  if (isRemote) {
    const { createClient } = await import("@libsql/client/web");
    return createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: "number",
    });
  }
  const { createClient } = await import("@libsql/client");
  mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  return createClient({ url: `file:${LOCAL_DB_PATH}`, intMode: "number" });
}

/** Lazily creates, migrates and caches the connection — every query awaits this first. */
function client(): Promise<Client> {
  if (!globalThis.__fiscoraClient) globalThis.__fiscoraClient = createFiscoraClient().then(initSchema);
  return globalThis.__fiscoraClient;
}

async function initSchema(c: Client): Promise<Client> {
  if (!isRemote) {
    // WAL and a busy timeout only make sense against a local file; a remote
    // libSQL server manages its own concurrency.
    await c.execute("PRAGMA journal_mode = WAL");
    await c.execute("PRAGMA busy_timeout = 5000");
  }
  await c.execute("PRAGMA foreign_keys = ON");
  await c.executeMultiple(SCHEMA);
  return c;
}

/* ---------------------------------------------------------------------- */
/* Schema                                                                  */
/* ---------------------------------------------------------------------- */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'GBP',
  locale        TEXT NOT NULL DEFAULT 'en-GB',
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  institution TEXT,
  type        TEXT NOT NULL DEFAULT 'current',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  icon    TEXT NOT NULL DEFAULT '💷',
  color   TEXT NOT NULL DEFAULT '#6366f1',
  kind    TEXT NOT NULL DEFAULT 'expense',
  sort    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  row_count       INTEGER NOT NULL DEFAULT 0,
  imported_count  INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_user ON import_batches(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  description  TEXT NOT NULL,
  merchant     TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Uncategorised',
  confidence   REAL NOT NULL DEFAULT 0,
  is_confirmed INTEGER NOT NULL DEFAULT 0,
  is_transfer  INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  fingerprint  TEXT NOT NULL,
  batch_id     INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat  ON transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_tx_merchant  ON transactions(user_id, merchant);

CREATE TABLE IF NOT EXISTS budgets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern    TEXT NOT NULL,
  category   TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rules_user ON rules(user_id);
`;

/* ---------------------------------------------------------------------- */
/* Query helpers                                                           */
/* ---------------------------------------------------------------------- */

/**
 * SQLite rejects `undefined`; booleans have no native type either. Normalise
 * once here so callers can pass ordinary JS values without every call site
 * remembering the rule.
 */
function normalise(params: unknown[]): InValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number") return Number.isFinite(p) ? p : 0;
    if (typeof p === "string" || typeof p === "bigint" || p instanceof Uint8Array || p instanceof ArrayBuffer)
      return p;
    return String(p);
  });
}

/**
 * Row values arrive column-order-indexed; rebuild plain `{column: value}`
 * objects explicitly rather than trusting whatever shape the driver's Row
 * type happens to be — the node:sqlite predecessor of this file returned
 * null-prototype rows that React's Server Component serializer silently
 * rejected, so this project doesn't pass driver row objects to callers unseen.
 */
function toPlainRows<T>(rs: ResultSet): T[] {
  const cols = rs.columns;
  return rs.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
    return obj as T;
  });
}

type Executor = (sql: string, args: InValue[]) => Promise<ResultSet>;

function makeQueries(exec: Executor) {
  return {
    async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      const rs = await exec(sql, normalise(params));
      return toPlainRows<T>(rs);
    },
    async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const rs = await exec(sql, normalise(params));
      return rs.rows.length ? toPlainRows<T>(rs)[0] : undefined;
    },
    async run(
      sql: string,
      ...params: unknown[]
    ): Promise<{ changes: number; lastInsertRowid: number }> {
      const rs = await exec(sql, normalise(params));
      return {
        changes: Number(rs.rowsAffected ?? 0),
        lastInsertRowid: rs.lastInsertRowid === undefined ? 0 : Number(rs.lastInsertRowid),
      };
    },
  };
}

const rootQueries = makeQueries(async (sql, args) => {
  const c = await client();
  return c.execute({ sql, args });
});

export const all = rootQueries.all;
export const get = rootQueries.get;
export const run = rootQueries.run;

export interface BatchStatement {
  sql: string;
  params?: unknown[];
}

/**
 * Runs many statements as one atomic round trip.
 *
 * `run()` called in a loop is fine against the local file this app started
 * with, where each call costs microseconds — but against a hosted database
 * every call is a network request, and a statement-per-row import of a real
 * bank statement turns into hundreds of sequential round trips, easily
 * blowing past a serverless function's time limit. `batch()` sends the whole
 * set in a single request instead, cutting an N-row import from N round trips
 * to one (or a handful, once chunked by the caller for very large imports).
 *
 * Statements are already-parameterised at call time — there is no facility to
 * read one statement's result and feed it into a later one in the same batch,
 * because they all go over the wire together. Run anything with that kind of
 * dependency as its own `run()`/`get()` before or after the batch.
 */
export async function batch(
  statements: BatchStatement[],
): Promise<{ changes: number; lastInsertRowid: number }[]> {
  if (!statements.length) return [];
  const c = await client();
  const results = await c.batch(
    statements.map((s) => ({ sql: s.sql, args: normalise(s.params ?? []) })),
    "write",
  );
  return results.map((rs) => ({
    changes: Number(rs.rowsAffected ?? 0),
    lastInsertRowid: rs.lastInsertRowid === undefined ? 0 : Number(rs.lastInsertRowid),
  }));
}

/**
 * Runs `fn` inside a real database transaction, rolling back on any throw.
 * The callback receives its own `{ all, get, run }` bound to the transaction
 * — use those, not the module-level ones, for every query that must be part
 * of the atomic unit.
 */
export async function transact<T>(
  fn: (t: { all: typeof all; get: typeof get; run: typeof run }) => Promise<T>,
): Promise<T> {
  const c = await client();
  const tx = await c.transaction("write");
  const scoped = makeQueries((sql, args) => tx.execute({ sql, args }));
  try {
    const result = await fn(scoped);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/** Build `IN (?,?,?)` placeholders for a list of ids. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Closes the connection — used by scripts and tests that need a clean exit. */
export async function closeDb(): Promise<void> {
  const pending = globalThis.__fiscoraClient;
  globalThis.__fiscoraClient = undefined;
  (await pending)?.close();
}
