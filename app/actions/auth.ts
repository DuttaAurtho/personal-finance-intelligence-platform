"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import {
  authenticate,
  createUser,
  currentUser,
  endSession,
  startSession,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { ensureUserSetup } from "@/lib/repository";
import { seedDemoData } from "@/lib/demo";
import { CURRENCIES } from "@/lib/money";

export interface FormState {
  error?: string;
  field?: "email" | "password" | "name";
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const currency = String(formData.get("currency") ?? "GBP");
  const wantsDemo = formData.get("seed") === "on";

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, field: "email" };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError, field: "password" };

  let userId: number;
  try {
    const user = await createUser({
      email,
      password,
      name,
      currency: CURRENCIES.includes(currency) ? currency : "GBP",
    });
    userId = user.id;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create that account.",
      field: "email",
    };
  }

  const account = await ensureUserSetup(userId);
  if (wantsDemo) await seedDemoData(userId, account.id);

  await startSession(userId);
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const user = await authenticate(email, password);
  if (!user) return { error: "That email and password don't match an account." };

  await ensureUserSetup(user.id);
  await startSession(user.id);
  // Without this, the router can serve the previous session's rendered /app
  // from cache and the new user briefly sees somebody else's figures.
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function signOut(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * One-click demo: provisions a throwaway account pre-loaded with two years of
 * synthetic history. Nobody evaluates an analytics product against an empty
 * database, and asking for a signup before showing anything is a bad trade.
 */
export async function startDemo(): Promise<void> {
  const suffix = randomBytes(4).toString("hex");
  const user = await createUser({
    email: `demo-${suffix}@fiscora.local`,
    password: randomBytes(18).toString("base64url"),
    name: "Demo User",
    currency: "GBP",
    isDemo: true,
  });

  const account = await ensureUserSetup(user.id);
  await seedDemoData(user.id, account.id);

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect("/app");
}

export async function requireSession() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
