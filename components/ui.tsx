import Link from "next/link";
import type { ReactNode } from "react";
import Sparkline from "./charts/Sparkline";

/* ---------------------------------------------------------------------- */
/* Card                                                                    */
/* ---------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <section className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Stat tile                                                               */
/* ---------------------------------------------------------------------- */

export interface StatTileProps {
  label: string;
  value: string;
  /** Signed change vs a named period, e.g. "+12% vs last month" */
  delta?: { text: string; direction: "up" | "down" | "flat"; good: boolean };
  hint?: string;
  trend?: number[];
  /** The single number a view leads with — larger type, one per view */
  hero?: boolean;
  icon?: string;
  href?: string;
}

/**
 * Stat tile: label · value · optional delta · optional sparkline.
 *
 * Delta colour encodes direction × whether that direction is good, and always
 * ships with an arrow glyph and the comparison in words — never colour alone.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  trend,
  hero = false,
  icon,
  href,
}: StatTileProps) {
  const arrow = delta?.direction === "up" ? "↑" : delta?.direction === "down" ? "↓" : "→";
  const deltaColor =
    !delta || delta.direction === "flat"
      ? "text-muted"
      : delta.good
        ? "text-[var(--viz-good)]"
        : "text-[var(--viz-critical)]";

  const body = (
    <div className="card card-lift h-full px-5 py-4 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.8125rem] font-medium text-muted">
          {icon && (
            <span aria-hidden="true" className="mr-1.5">
              {icon}
            </span>
          )}
          {label}
        </p>
        {trend && trend.length > 1 && (
          <Sparkline
            values={trend}
            tone={delta ? (delta.good ? "positive" : "negative") : "neutral"}
          />
        )}
      </div>

      <p
        className={`mt-2 font-semibold tracking-tight text-fg ${
          hero ? "text-4xl sm:text-[2.75rem] sm:leading-[1.1]" : "text-2xl"
        }`}
      >
        {value}
      </p>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.8125rem]">
        {delta && (
          <span className={`font-medium ${deltaColor}`}>
            <span aria-hidden="true">{arrow}</span> {delta.text}
          </span>
        )}
        {hint && <span className="text-subtle">{hint}</span>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full rounded-[var(--radius)] focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ---------------------------------------------------------------------- */
/* Badge                                                                   */
/* ---------------------------------------------------------------------- */

export type Tone = "neutral" | "positive" | "warning" | "critical" | "info" | "brand";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  critical: "bg-negative-soft text-negative",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={`chip ${TONE_CLASS[tone]} ${className}`}>{children}</span>;
}

/* ---------------------------------------------------------------------- */
/* Empty state                                                             */
/* ---------------------------------------------------------------------- */

export function EmptyState({
  icon = "📊",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-3 text-2xl"
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Misc                                                                    */
/* ---------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A dividing rule with a caption, used to break long pages into sections. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</h2>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2 py-1 text-xs text-fg shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

/** Small circled "?" that reveals an explanation — used for ML terminology. */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip text={text}>
      <span
        aria-label={text}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line-strong text-[0.625rem] font-semibold text-subtle"
      >
        ?
      </span>
    </Tooltip>
  );
}
