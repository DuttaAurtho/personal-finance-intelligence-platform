import type { CategoryKind } from "./types";

export interface CategoryDef {
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
}

/**
 * The default taxonomy. Colours are a hand-tuned categorical ramp: distinct
 * hues at roughly matched chroma so no single slice dominates a donut chart,
 * and all of them clear 3:1 contrast against both the light and dark surfaces.
 */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // ── Essentials ─────────────────────────────────────────────
  { name: "Rent & Mortgage", icon: "🏠", color: "#6366f1", kind: "expense" },
  { name: "Bills & Utilities", icon: "💡", color: "#8b5cf6", kind: "expense" },
  { name: "Groceries", icon: "🛒", color: "#10b981", kind: "expense" },
  { name: "Transport", icon: "🚇", color: "#0ea5e9", kind: "expense" },
  { name: "Fuel", icon: "⛽", color: "#0891b2", kind: "expense" },
  { name: "Insurance", icon: "🛡️", color: "#64748b", kind: "expense" },
  { name: "Health & Fitness", icon: "💊", color: "#14b8a6", kind: "expense" },

  // ── Lifestyle ──────────────────────────────────────────────
  { name: "Eating Out", icon: "🍔", color: "#f59e0b", kind: "expense" },
  { name: "Shopping", icon: "🛍️", color: "#ec4899", kind: "expense" },
  { name: "Subscriptions", icon: "📱", color: "#a855f7", kind: "expense" },
  { name: "Entertainment", icon: "🎬", color: "#f43f5e", kind: "expense" },
  { name: "Travel", icon: "✈️", color: "#3b82f6", kind: "expense" },
  { name: "Personal Care", icon: "💇", color: "#d946ef", kind: "expense" },
  { name: "Home & Garden", icon: "🪴", color: "#84cc16", kind: "expense" },

  // ── Life admin ─────────────────────────────────────────────
  { name: "Education", icon: "📚", color: "#7c3aed", kind: "expense" },
  { name: "Kids & Family", icon: "👶", color: "#fb7185", kind: "expense" },
  { name: "Pets", icon: "🐾", color: "#a16207", kind: "expense" },
  { name: "Gifts & Donations", icon: "🎁", color: "#e11d48", kind: "expense" },
  { name: "Fees & Charges", icon: "🏦", color: "#94a3b8", kind: "expense" },
  { name: "Taxes", icon: "🧾", color: "#78716c", kind: "expense" },
  { name: "Cash & ATM", icon: "🏧", color: "#a3a3a3", kind: "expense" },
  { name: "Uncategorised", icon: "❓", color: "#71717a", kind: "expense" },

  // ── Income ─────────────────────────────────────────────────
  { name: "Salary", icon: "💼", color: "#22c55e", kind: "income" },
  { name: "Freelance", icon: "🧑‍💻", color: "#4ade80", kind: "income" },
  { name: "Interest & Dividends", icon: "📈", color: "#16a34a", kind: "income" },
  { name: "Refunds", icon: "↩️", color: "#65a30d", kind: "income" },
  { name: "Benefits", icon: "🤝", color: "#059669", kind: "income" },
  { name: "Other Income", icon: "💰", color: "#15803d", kind: "income" },

  // ── Transfers (excluded from spend totals) ─────────────────
  { name: "Transfers", icon: "🔄", color: "#475569", kind: "transfer" },
  { name: "Savings", icon: "🐖", color: "#0d9488", kind: "transfer" },
  { name: "Investments", icon: "📊", color: "#1d4ed8", kind: "transfer" },
  { name: "Credit Card Payment", icon: "💳", color: "#334155", kind: "transfer" },
];

const BY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c]));

export function categoryDef(name: string): CategoryDef {
  return (
    BY_NAME.get(name) ?? { name, icon: "💷", color: "#71717a", kind: "expense" as CategoryKind }
  );
}

export function categoryColor(name: string): string {
  return categoryDef(name).color;
}

export function categoryIcon(name: string): string {
  return categoryDef(name).icon;
}

export function categoryKind(name: string): CategoryKind {
  return categoryDef(name).kind;
}

export const EXPENSE_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.kind === "expense").map(
  (c) => c.name,
);
export const INCOME_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.kind === "income").map(
  (c) => c.name,
);
export const TRANSFER_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.kind === "transfer").map(
  (c) => c.name,
);

/** Categories a household realistically budgets for, in a sensible default order. */
export const BUDGETABLE = EXPENSE_CATEGORIES.filter((c) => c !== "Uncategorised");
