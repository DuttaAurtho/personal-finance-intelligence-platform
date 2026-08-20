"use client";

import { useState } from "react";
import TransactionForm from "./TransactionForm";

interface Props {
  categories: { name: string; kind: string }[];
  accounts: { id: number; name: string }[];
  currency: string;
  /** `lg` for the empty-state call to action, default for the header. */
  size?: "sm" | "lg";
  label?: string;
}

/** Owns the open/closed state for the add form so callers can stay server components. */
export default function AddTransactionButton({
  categories,
  accounts,
  currency,
  size = "sm",
  label = "Add transaction",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn btn-primary ${size === "lg" ? "h-10 px-4" : "h-9"}`}
      >
        <span aria-hidden="true">＋</span>
        <span className={size === "lg" ? "" : "hidden sm:inline"}>{label}</span>
      </button>

      <TransactionForm
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        accounts={accounts}
        currency={currency}
      />
    </>
  );
}
