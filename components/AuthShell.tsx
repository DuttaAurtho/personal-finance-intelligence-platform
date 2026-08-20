import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const POINTS = [
  { icon: "🏷️", text: "Categorisation that learns from your corrections" },
  { icon: "🔁", text: "Finds the subscriptions you forgot you had" },
  { icon: "🔮", text: "Forecasts next month with an honest error range" },
  {
    icon: "🔒",
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
      <div className="aurora" aria-hidden="true" />

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
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />

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
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-sm"
              >
                {p.icon}
              </span>
              <span className="pt-1">{p.text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
