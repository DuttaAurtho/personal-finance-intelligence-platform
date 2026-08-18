"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { rebuildMerchants, recategorizeAll, wipeUserData } from "@/lib/repository";
import { seedDemoData } from "@/lib/demo";
import { listAccounts } from "@/lib/repository";
import { CURRENCIES } from "@/lib/money";

export interface SettingsState {
  error?: string;
  success?: string;
}

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? user.currency);

  if (!name) return { error: "Give yourself a name." };
  if (!CURRENCIES.includes(currency)) return { error: "Unknown currency." };

  run("UPDATE users SET name = ?, currency = ? WHERE id = ?", name, currency, user.id);
  revalidatePath("/app", "layout");

  return { success: "Saved." };
}

/**
 * Re-run the classifier over everything the user hasn't confirmed by hand.
 * Worth doing after a batch of corrections — the lessons from ten relabelled
 * rows propagate to the other nine hundred.
 */
export async function retrainClassifier(): Promise<SettingsState> {
  const user = await requireUser();
  rebuildMerchants(user.id);
  const { updated, scanned } = recategorizeAll(user.id);
  revalidatePath("/app", "layout");

  return {
    success:
      updated > 0
        ? `Reclassified ${updated} of ${scanned} unconfirmed transactions.`
        : `Checked ${scanned} transactions — the model didn't change its mind about any of them.`,
  };
}

export async function loadDemoData(): Promise<void> {
  const user = await requireUser();
  const account = listAccounts(user.id)[0];
  if (account) seedDemoData(user.id, account.id);
  revalidatePath("/app", "layout");
}

/** Irreversible: removes every transaction, budget and rule for this user. */
export async function wipeEverything(formData: FormData): Promise<void> {
  const user = await requireUser();

  // Typed confirmation, because there is no undo for this one.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return;

  wipeUserData(user.id);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return;

  // Cascades through transactions, budgets, rules and sessions.
  run("DELETE FROM users WHERE id = ?", user.id);
  redirect("/");
}
