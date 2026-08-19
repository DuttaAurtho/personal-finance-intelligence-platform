"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setBudget, suggestBudgets } from "@/lib/repository";
import { parseAmount } from "@/lib/money";

function refresh() {
  revalidatePath("/app", "layout");
}

export async function saveBudget(category: string, amount: string) {
  const user = await requireUser();
  const minor = parseAmount(amount);
  if (minor === null) return { ok: false, error: "That isn't a valid amount." };

  await setBudget(user.id, category, Math.abs(minor));
  refresh();
  return { ok: true };
}

export async function clearBudget(category: string) {
  const user = await requireUser();
  await setBudget(user.id, category, 0);
  refresh();
  return { ok: true };
}

/**
 * Adopt the suggested budget for every category at once.
 *
 * Suggestions come from the median of the user's own recent months, rounded up
 * to a memorable figure. Median rather than mean so one blow-out month doesn't
 * quietly set a generous target that's impossible to fail.
 */
export async function applyAllSuggestions(): Promise<void> {
  const user = await requireUser();
  const suggestions = await suggestBudgets(user.id, 6);

  for (const s of suggestions) await setBudget(user.id, s.category, s.amountMinor);

  refresh();
}
