"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  addManualTransaction,
  createRule,
  deleteRule,
  deleteTransactions,
  listAccounts,
  recategorizeAll,
  setCategory,
  setCategoryForMerchant,
  setNotes,
  setTransferFlag,
} from "@/lib/repository";
import { parseAmount } from "@/lib/money";
import { parseDate } from "@/lib/dates";
import { get } from "@/lib/db";

function refresh() {
  revalidatePath("/app", "layout");
}

export async function updateCategory(transactionId: number, category: string) {
  const user = await requireUser();
  await setCategory(user.id, transactionId, category);
  refresh();
}

/**
 * Apply a category to every transaction from the same merchant, and optionally
 * remember it as a standing rule. This is the highest-leverage action in the
 * product: one click can correctly label hundreds of rows and teach the model.
 */
export async function updateCategoryForMerchant(
  transactionId: number,
  category: string,
  createStandingRule = false,
) {
  const user = await requireUser();

  const tx = await get<{ merchant: string }>(
    "SELECT merchant FROM transactions WHERE user_id = ? AND id = ?",
    user.id,
    transactionId,
  );
  if (!tx?.merchant) {
    await setCategory(user.id, transactionId, category);
    refresh();
    return { updated: 1 };
  }

  const updated = await setCategoryForMerchant(user.id, tx.merchant, category);
  if (createStandingRule) {
    try {
      await createRule(user.id, tx.merchant, category, 50);
    } catch {
      /* a duplicate rule is harmless — the first one already wins */
    }
  }

  refresh();
  return { updated };
}

export async function toggleTransfer(transactionId: number, isTransfer: boolean) {
  const user = await requireUser();
  await setTransferFlag(user.id, transactionId, isTransfer);
  refresh();
}

export async function updateNotes(transactionId: number, notes: string) {
  const user = await requireUser();
  await setNotes(user.id, transactionId, notes);
  refresh();
}

export async function removeTransactions(ids: number[]) {
  const user = await requireUser();
  const deleted = await deleteTransactions(user.id, ids);
  refresh();
  return { deleted };
}

/** Re-run the classifier across everything the user hasn't confirmed by hand. */
export async function rerunCategorisation() {
  const user = await requireUser();
  const result = await recategorizeAll(user.id);
  refresh();
  return result;
}

export interface ManualState {
  error?: string;
  success?: string;
}

export async function addTransaction(
  _prev: ManualState,
  formData: FormData,
): Promise<ManualState> {
  const user = await requireUser();

  const date = parseDate(String(formData.get("date") ?? ""));
  if (!date) return { error: "Enter a valid date." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Give the transaction a description." };

  const raw = parseAmount(String(formData.get("amount") ?? ""));
  if (raw === null || raw === 0) return { error: "Enter an amount." };

  const direction = String(formData.get("direction") ?? "out");
  const amountMinor = direction === "in" ? Math.abs(raw) : -Math.abs(raw);

  const category = String(formData.get("category") ?? "").trim() || undefined;

  const accounts = await listAccounts(user.id);
  const accountId = Number(formData.get("account")) || accounts[0]?.id;
  if (!accountId) return { error: "No account to add this to." };

  await addManualTransaction(user.id, accountId, { date, description, amountMinor, category });
  refresh();

  return { success: `Added ${description}.` };
}

/* ── Rules ─────────────────────────────────────────────────────────── */

export async function addRule(_prev: ManualState, formData: FormData): Promise<ManualState> {
  const user = await requireUser();
  const pattern = String(formData.get("pattern") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!pattern) return { error: "Enter some text to match on." };
  if (!category) return { error: "Choose a category." };

  try {
    await createRule(user.id, pattern, category);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that rule." };
  }

  await recategorizeAll(user.id);
  refresh();
  return { success: `Anything matching "${pattern}" is now ${category}.` };
}

export async function removeRule(id: number) {
  const user = await requireUser();
  await deleteRule(user.id, id);
  await recategorizeAll(user.id);
  refresh();
}
