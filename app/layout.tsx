import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Personal Finance Intelligence Platform",
    template: "%s · Personal Finance Intelligence Platform",
  },
  description:
    "Import your bank statements and see where the money actually goes. Automatic categorisation, budget tracking, recurring-payment detection and machine-learned spending forecasts — running entirely on your own machine.",
  keywords: [
    "personal finance",
    "budgeting",
    "spending analysis",
    "bank statement CSV",
    "expense tracker",
    "financial forecasting",
  ],
  authors: [{ name: "Aurtho Dutta" }],
  openGraph: {
    title: "Personal Finance Intelligence Platform",
    description:
      "Import bank CSVs, categorise automatically, track budgets and forecast next month's spending. Free, open and private by design.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#080b12" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Applied before first paint so a dark-mode user never sees a white flash.
 * Kept tiny and inline — a network round-trip here would defeat the purpose.
 */
const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('pfip-theme');
var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
if(d)document.documentElement.classList.add('dark');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
