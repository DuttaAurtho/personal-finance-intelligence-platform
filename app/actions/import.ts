"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { parseStatement, type ColumnMapping } from "@/lib/csv";
import {
  createAccount,
  deleteBatch,
  importTransactions,
  listAccounts,
} from "@/lib/repository";

export interface ImportResult {
  ok: boolean;
  error?: string;
  summary?: {
    imported: number;
    duplicates: number;
    categorised: number;
    needsReview: number;
    skipped: number;
    total: number;
  };
}

/** Guard against someone pasting a 200MB file into the textarea. */
const MAX_CHARS = 12 * 1024 * 1024;

/**
 * Commit an import.
 *
 * The client already parsed the file to build the preview, but the server
 * re-parses the original text rather than trusting parsed rows over the wire —
 * a client could otherwise post arbitrary transactions into another shape.
 */
export async function importCsv(
  text: string,
  mapping: Partial<ColumnMapping>,
  accountId: number,
  filename: string,
): Promise<ImportResult> {
  const user = await requireUser();

  if (!text || typeof text !== "string") return { ok: false, error: "No file contents received." };
  if (text.length > MAX_CHARS)
    return { ok: false, error: "That file is too large. Try splitting it by year." };

  const accounts = await listAccounts(user.id);
  const target = accounts.find((a) => a.id === accountId) ?? accounts[0];
  if (!target) return { ok: false, error: "No account to import into." };

  let parsed;
  try {
    parsed = parseStatement(text, mapping);
  } catch {
    return { ok: false, error: "That file couldn't be read as CSV." };
  }

  if (!parsed.rows.length) {
    return {
      ok: false,
      error:
        parsed.issues.length > 0
          ? "No usable rows found — check that the date and amount columns are mapped correctly."
          : "That file appears to be empty.",
    };
  }

  const summary = await importTransactions(
    user.id,
    target.id,
    filename || "statement.csv",
    parsed.rows,
  );

  revalidatePath("/app", "layout");

  return {
    ok: true,
    summary: {
      imported: summary.imported,
      duplicates: summary.duplicates,
      categorised: summary.categorised,
      needsReview: summary.needsReview,
      skipped: parsed.issues.length,
      total: parsed.totalRows,
    },
  };
}

export async function undoImport(batchId: number) {
  const user = await requireUser();
  const removed = await deleteBatch(user.id, batchId);
  revalidatePath("/app", "layout");
  return { removed };
}

export async function addAccount(name: string, type: string, institution?: string) {
  const user = await requireUser();
  const account = await createAccount(
    user.id,
    name,
    (["current", "savings", "credit", "cash", "investment"].includes(type)
      ? type
      : "current") as "current",
    institution,
  );
  revalidatePath("/app", "layout");
  return { id: account.id, name: account.name };
}
