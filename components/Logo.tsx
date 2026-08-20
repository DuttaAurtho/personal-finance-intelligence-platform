interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * The mark: a rising bar trio inside a rounded square — spending turned into a
 * trend. Drawn as inline SVG so it inherits the theme and needs no asset.
 *
 * The wordmark sets on two lines. "Personal Finance Intelligence Platform" is
 * far too long to sit on one line beside the mark in a 240px sidebar, and
 * shrinking it to fit would make it unreadable; stacking it keeps the type at a
 * legible size and gives the lockup a deliberate shape rather than a squeezed one.
 */
export default function Logo({ size = 28, withWordmark = true, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <rect x="7" y="17" width="4.2" height="8" rx="1.6" fill="var(--brand-fg)" opacity="0.55" />
        <rect x="13.9" y="12" width="4.2" height="13" rx="1.6" fill="var(--brand-fg)" opacity="0.78" />
        <rect x="20.8" y="7" width="4.2" height="18" rx="1.6" fill="var(--brand-fg)" />
      </svg>
      {withWordmark && (
        <span className="flex flex-col text-[0.8125rem] font-semibold leading-[1.15] tracking-tight text-fg">
          <span>Personal Finance</span>
          <span>Intelligence Platform</span>
        </span>
      )}
    </span>
  );
}
