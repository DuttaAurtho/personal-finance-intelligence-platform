import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

/** Stroked glyphs rather than emoji, matching the icon set used in the app. */
const POINTS = [
  {
    d: "M3.5 12.5 12 4h7.5v7.5L11 20l-7.5-7.5ZM16 8h.01",
    text: "Categorisation that learns from your corrections",
  },
  {
    d: "M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5",
    text: "Finds the subscriptions you forgot you had",
  },
  {
    d: "M3 19.5 9 13l4 3.5 8-9M15 7.5h6v6",
    text: "Forecasts next month with an honest error range",
  },
  {
    d: "M6.5 10.5V8a5.5 5.5 0 1 1 11 0v2.5M5 10.5h14V20H5v-9.5Z",
    text: process.env.TURSO_DATABASE_URL
      ? "Stored in a SQLite database only your account can reach"
      : "Stored in a local SQLite file — nothing leaves your machine",
  },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen">
      {/* Form column */}
      <div className="relative z-10 flex w-full flex-col px-5 py-6 lg:w-[52%]">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Personal Finance Intelligence Platform home">
            <Logo />
          </Link>
          <ThemeToggle compact />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
            <div className="mt-6 text-center text-sm text-muted">{footer}</div>
          </div>
        </div>
      </div>

      {/* Brand column — hidden on small screens where it would just be noise */}
      <aside className="relative z-10 hidden border-l border-line/60 bg-surface/40 lg:flex lg:w-[48%] lg:flex-col lg:justify-center lg:px-14">
        <blockquote className="max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight text-fg">
            &ldquo;You can&apos;t change a spending habit you can&apos;t see.&rdquo;
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Most people can name their rent and their salary. Almost nobody can name the third
            biggest thing they spend money on. This exists to answer that question in about
            thirty seconds.
          </p>
        </blockquote>

        <ul className="mt-10 max-w-md space-y-3.5">
          {POINTS.map((p) => (
            <li key={p.text} className="flex items-start gap-3 text-sm text-muted">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-brand">
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  <path d={p.d} />
                </svg>
              </span>
              <span className="pt-1">{p.text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
