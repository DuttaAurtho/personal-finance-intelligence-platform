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
  updateTransaction,
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

/**
 * Create or edit one transaction by hand.
 *
 * Add and edit share an action because they share a form: the only difference
 * is whether an `id` came along with it. Keeping them together means the
 * validation rules can't drift apart between the two paths.
 */
export async function saveTransaction(
  _prev: ManualState,
  formData: FormData,
): Promise<ManualState> {
  const user = await requireUser();

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId ? Number(rawId) : null;
  if (rawId && !Number.isInteger(id)) return { error: "That transaction couldn't be identified." };

  const date = parseDate(String(formData.get("date") ?? ""));
  if (!date) return { error: "Enter a valid date." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Give the transaction a description." };

  const raw = parseAmount(String(formData.get("amount") ?? ""));
  if (raw === null) return { error: "Enter an amount, for example 24.99." };
  if (raw === 0) return { error: "An amount of zero won't tell you anything." };

  // The form carries magnitude and direction separately, so a typed minus sign
  // can't quietly flip an expense into income.
  const direction = String(formData.get("direction") ?? "out");
  const amountMinor = direction === "in" ? Math.abs(raw) : -Math.abs(raw);

  const category = String(formData.get("category") ?? "").trim();
  if (!category) return { error: "Choose a category." };

  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (id) {
    const changed = await updateTransaction(user.id, id, {
      date, description, amountMinor, category, notes,
    });
    if (!changed) return { error: "That transaction no longer exists." };
    refresh();
    return { success: `Updated ${description}.` };
  }

  const accounts = await listAccounts(user.id);
  const accountId = Number(formData.get("account")) || accounts[0]?.id;
  if (!accountId) return { error: "No account to add this to." };

  await addManualTransaction(user.id, accountId, { date, description, amountMinor, category });
  if (notes) {
    // addManualTransaction doesn't take notes, so apply them once the row exists.
    const latest = await get<{ id: number }>(
      "SELECT id FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      user.id,
    );
    if (latest) await setNotes(user.id, latest.id, notes);
  }

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
