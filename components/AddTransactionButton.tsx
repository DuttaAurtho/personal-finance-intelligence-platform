"use client";

import { useState } from "react";
import TransactionForm from "./TransactionForm";

interface Props {
  categories: { name: string; kind: string }[];
  accounts: { id: number; name: string }[];
  currency: string;
}

/** Owns the open/closed state for the add form so the page can stay a server component. */
export default function AddTransactionButton({ categories, accounts, currency }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary h-9">
        <span aria-hidden="true">＋</span> Add transaction
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
