/**
 * Line icons for the category taxonomy.
 *
 * These replace the emoji the categories originally shipped with. Emoji render
 * differently on every platform, sit awkwardly against the type, and read as a
 * placeholder rather than a decision — a consistent stroked set is the single
 * biggest lift in making the interface look considered.
 *
 * One 24×24 grid, 1.6 stroke, round caps and joins throughout, all drawn with
 * `currentColor` so they inherit whatever colour the surrounding text uses.
 */

const P: Record<string, string> = {
  /* ── Essentials ─────────────────────────────────────────── */
  "Rent & Mortgage": "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20",
  "Bills & Utilities": "M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z",
  Groceries: "M3 4h2.2l2.3 10.5h9.6L19 7H6.5M9 19.5h.01M17 19.5h.01",
  Transport: "M5 16.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9.5M5 12h14M7.5 19.5h.01M16.5 19.5h.01M6 16.5v2.5M18 16.5v2.5",
  Fuel: "M4 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h11M6.5 9.5h4M16 8l3 2.5V17a1.5 1.5 0 0 1-3 0v-4h-3",
  Insurance: "M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z",
  "Health & Fitness": "M6.5 8.5a3.5 3.5 0 0 1 5.5-2.9A3.5 3.5 0 0 1 17.5 8.5c0 4-5.5 8-5.5 8s-5.5-4-5.5-8Z",

  /* ── Lifestyle ──────────────────────────────────────────── */
  "Eating Out": "M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3M7 11v10M17.5 3c-1.5 1.5-2 3.5-2 6 0 1.7.7 2.5 2 2.5V21",
  Shopping: "M4.5 8h15l-1 12.5h-13L4.5 8Zm3.5 0V6a4 4 0 0 1 8 0v2",
  Subscriptions: "M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5Zm3 16.5h4",
  Entertainment: "M3.5 6.5h17v12h-17v-12ZM3.5 10h17M7 6.5 5 3M12 6.5 10 3M17 6.5 15 3",
  Travel: "M3 15.5 21 9.5M6.5 13.5 4 10l2-.7 2.6 1.6M10 12l4.5 4.5 2-.8-1.4-3.2M16.5 5.5c.8-.8 2.2-1 3-.2s.6 2.2-.2 3",
  "Personal Care": "M8 3.5 6 9m10-5.5L18 9M4.5 9h15l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.2a1.5 1.5 0 0 1-1.5-1.3L4.5 9Zm5 4v4m5-4v4",
  "Home & Garden": "M12 21v-7m0 0c0-3 2-6 5.5-6.5C17 11 15 14 12 14Zm0 0C12 11 10 8 6.5 7.5 7 11 9 14 12 14Z",

  /* ── Life admin ─────────────────────────────────────────── */
  Education: "M12 4 2.5 8.5 12 13l9.5-4.5L12 4Zm-6 6.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5",
  "Kids & Family": "M12 8.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm-5 12.5v-5a5 5 0 0 1 10 0v5M9.5 21v-4m5 4v-4",
  Pets: "M8 11.5a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5Zm8 0a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5ZM12 21c-3 0-5-1.8-5-4 0-2 2-3.5 5-3.5s5 1.5 5 3.5c0 2.2-2 4-5 4Z",
  "Gifts & Donations": "M3.5 11h17v9.5h-17V11Zm0-3.5h17V11h-17V7.5ZM12 7.5V21M12 7.5S10.5 3 8 3a2.25 2.25 0 0 0 0 4.5m4 0S13.5 3 16 3a2.25 2.25 0 0 1 0 4.5",
  "Fees & Charges": "M3 20h18M5 20V9.5m4 10.5V9.5m6 10.5V9.5m4 10.5V9.5M12 3 3.5 7.5h17L12 3Z",
  Taxes: "M6 2.5h12v19l-3-2-3 2-3-2-3 2v-19ZM9.5 8h5m-5 4h5m-5 4h3",
  "Cash & ATM": "M2.5 6.5h19v11h-19v-11Zm4 0v11m11-11v11M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  Uncategorised: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2-11.5A2 2 0 1 1 12 13v1.5M12 17.5h.01",

  /* ── Income ─────────────────────────────────────────────── */
  Salary: "M3 7.5h18v13H3v-13Zm5.5 0V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M12 11v6m-2-4.5h3.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H14",
  Freelance: "M4 4.5h16v11H4v-11Zm4 15h8m-4-4v4M9 8l-2 2 2 2m6-4 2 2-2 2",
  "Interest & Dividends": "M3 19.5 9 13l4 3.5 8-9M15 7.5h6v6",
  Refunds: "M3.5 8.5h13a4 4 0 0 1 0 8H8M3.5 8.5 7 5M3.5 8.5 7 12",
  Benefits: "M12 20.5s-8-5-8-10.5A4 4 0 0 1 12 7a4 4 0 0 1 8 3c0 5.5-8 10.5-8 10.5Z",
  "Other Income": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v14M9 9.5h4.5a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5H15",

  /* ── Transfers ──────────────────────────────────────────── */
  Transfers: "M4 8.5h13M13.5 5 17 8.5 13.5 12M20 15.5H7M10.5 12 7 15.5 10.5 19",
  Savings: "M4 12.5c0-3.6 3.4-6.5 7.5-6.5 1.5 0 3 .4 4.2 1.1L19 6l-.6 3a6 6 0 0 1 1.6 3.5H21v3h-1.5c-.4 1-1 1.8-1.9 2.5V21h-3v-1.5h-3V21h-3v-2.2C5.2 17.5 4 15.2 4 12.5Zm3.5-1h.01",
  Investments: "M4 20V4m0 16h16M8 16.5V12m4 4.5V8m4 8.5v-7",
  "Credit Card Payment": "M2.5 6.5h19v11h-19v-11Zm0 4h19M6 14.5h3",
};

const FALLBACK = P.Uncategorised;

interface Props {
  category: string;
  size?: number;
  className?: string;
}

export default function CategoryIcon({ category, size = 16, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={P[category] ?? FALLBACK} />
    </svg>
  );
}
