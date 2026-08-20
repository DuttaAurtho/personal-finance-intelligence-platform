interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * The brand lockup: an ascending bar trio with a growth curve sweeping over it,
 * beside a three-tier wordmark.
 *
 * Drawn as inline SVG rather than shipped as an image file: it stays crisp at
 * any size, needs no network request, and the wordmark inherits the theme's
 * text colour so it works on both light and dark without a second asset.
 */
export default function Logo({ size = 34, withWordmark = true, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="pfip-bars" x1="6" y1="44" x2="42" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5eead4" />
            <stop offset="0.5" stopColor="#0d9488" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="pfip-curve" x1="4" y1="42" x2="40" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>

        {/* Three columns, each taller than the last */}
        <rect x="5" y="29" width="9.5" height="15" rx="4.75" fill="url(#pfip-bars)" opacity="0.55" />
        <rect x="18.5" y="21" width="9.5" height="23" rx="4.75" fill="url(#pfip-bars)" opacity="0.8" />
        <rect x="32" y="13" width="9.5" height="31" rx="4.75" fill="url(#pfip-bars)" />

        {/* The growth curve, rising across the columns to a terminal node */}
        <path
          d="M3.5 41.5C6 30 13.5 18.5 35 9.5"
          stroke="url(#pfip-curve)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="36.5" cy="9" r="4" fill="#14b8a6" />
      </svg>

      {withWordmark && (
        <>
          {/* Hairline rule separating mark from wordmark, as in the lockup */}
          <span
            aria-hidden="true"
            className="h-8 w-px shrink-0 bg-line-strong"
          />
          <span className="flex flex-col leading-none">
            <span className="text-[0.5rem] font-medium tracking-[0.22em] text-muted">
              PERSONAL
            </span>
            <span className="mt-[0.15rem] text-[0.9375rem] font-extrabold tracking-tight text-fg">
              FINANCE
            </span>
            <span className="mt-[0.15rem] text-[0.4375rem] font-medium tracking-[0.15em] text-muted">
              INTELLIGENCE PLATFORM
            </span>
          </span>
        </>
      )}
    </span>
  );
}
