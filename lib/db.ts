import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Storage layer.
 *
 * Uses `node:sqlite`, built into Node 22.5+ — a real relational database with
 * zero dependencies, zero install step and zero hosting cost. The file lives
 * under ./data and never leaves the machine, which is the whole privacy pitch
 * of the product.
 *
 * The connection is cached on globalThis so Next's dev-mode module reloading
 * doesn't open a new handle on every edit.
 */

const DB_PATH = process.env.FISCORA_DB ?? path.join(process.cwd(), "data", "fiscora.db");

declare global {
  // eslint-disable-next-line no-var
  var __fiscoraDb: DatabaseSync | undefined;
}

function connect(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // WAL keeps reads fast while an import writes; foreign keys must be asked for.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__fiscoraDb) globalThis.__fiscoraDb = connect();
  return globalThis.__fiscoraDb;
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

function migrate(db: DatabaseSync) {
  db.exec(SCHEMA);
}

/* ---------------------------------------------------------------------- */
/* Query helpers                                                           */
/* ---------------------------------------------------------------------- */

export type SqlValue = string | number | bigint | Uint8Array | null;

/**
 * SQLite rejects booleans and `undefined`. Normalise once here so callers can
 * pass ordinary JS values without every call site remembering the rule.
 */
function normalise(params: unknown[]): SqlValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number") return Number.isFinite(p) ? p : 0;
    if (typeof p === "string" || typeof p === "bigint" || p instanceof Uint8Array) return p;
    return String(p);
  });
}

/**
 * node:sqlite returns row objects created with `Object.create(null)` — no
 * prototype at all. That's invisible almost everywhere, but React's Server
 * Component serializer explicitly rejects null-prototype objects when a
 * server value is passed to a Client Component, so every row is normalised
 * into a plain object here, once, rather than at every call site that
 * happens to feed a client component.
 */
function toPlainObject<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return (getDb().prepare(sql).all(...normalise(params)) as unknown[]).map(toPlainObject<T>);
}

export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  const row = getDb().prepare(sql).get(...normalise(params));
  return row === undefined ? undefined : toPlainObject<T>(row);
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
  const r = getDb().prepare(sql).run(...normalise(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Run `fn` inside a transaction, rolling back if it throws. */
export function transact<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* the transaction was already unwound */
    }
    throw err;
  }
}

/** Build `IN (?,?,?)` placeholders for a list of ids. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}
