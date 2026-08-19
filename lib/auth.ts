import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import type { User } from "./types";

/**
 * Authentication.
 *
 * Self-hosted and dependency-free: scrypt for password hashing (memory-hard,
 * which is what makes it expensive to attack in bulk) and opaque random session
 * tokens in an httpOnly cookie. No third-party auth provider, so nothing to pay
 * for and no account data leaving the machine.
 */

const COOKIE = "fiscora_session";
const SESSION_DAYS = 30;

/* ---------------------------------------------------------------------- */
/* Password hashing                                                        */
/* ---------------------------------------------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });

    // Constant-time compare so response timing can't be used to probe passwords.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------- */
/* Users                                                                   */
/* ---------------------------------------------------------------------- */

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  currency?: string;
  isDemo?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const email = normaliseEmail(input.email);
  const existing = await get<{ id: number }>("SELECT id FROM users WHERE email = ?", email);
  if (existing) throw new Error("An account with that email already exists.");

  const { lastInsertRowid } = await run(
    `INSERT INTO users (email, name, password_hash, currency, is_demo)
     VALUES (?, ?, ?, ?, ?)`,
    email,
    input.name?.trim() || email.split("@")[0],
    hashPassword(input.password),
    input.currency ?? "GBP",
    input.isDemo ? 1 : 0,
  );

  return (await get<User>("SELECT * FROM users WHERE id = ?", lastInsertRowid))!;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const row = await get<User & { password_hash: string }>(
    "SELECT * FROM users WHERE email = ?",
    normaliseEmail(email),
  );
  if (!row) {
    // Burn roughly the same time as a real verification so a missing account
    // isn't detectable from how fast we answer.
    hashPassword(password);
    return null;
  }
  return verifyPassword(password, row.password_hash) ? row : null;
}

export function getUserById(id: number): Promise<User | undefined> {
  return get<User>("SELECT * FROM users WHERE id = ?", id);
}

/* ---------------------------------------------------------------------- */
/* Sessions                                                                */
/* ---------------------------------------------------------------------- */

export async function startSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;

  await run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", token, userId, expiresAt);
  await purgeExpired();

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE id = ?", token);
  store.delete(COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const row = await get<User & { expires_at: number }>(
    `SELECT u.*, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    token,
  );
  if (!row) return null;

  if (row.expires_at < Date.now()) {
    await run("DELETE FROM sessions WHERE id = ?", token);
    return null;
  }
  return row;
}

/**
 * For pages that must have a user. Throws a redirect rather than returning
 * null, so callers get a non-nullable `User` and can't forget the check.
 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

function purgeExpired(): Promise<unknown> {
  return run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
}

/* ---------------------------------------------------------------------- */
/* Validation                                                              */
/* ---------------------------------------------------------------------- */

export function validateEmail(email: string): string | null {
  const e = normaliseEmail(email);
  if (!e) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return "That doesn't look like a valid email.";
  if (e.length > 254) return "That email is too long.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return "Include at least one letter and one number.";
  return null;
}
