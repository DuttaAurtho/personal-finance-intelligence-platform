"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark switch. The initial class is applied by the inline script in the
 * root layout before first paint; this component only keeps the UI in sync and
 * persists the choice.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("fiscora-theme", next ? "dark" : "light");
    } catch {
      /* private mode — the choice just won't persist */
    }
  }

  // Render a neutral placeholder until mounted so the markup matches the server.
  const icon = !mounted ? "◐" : dark ? "☀" : "☾";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost ${compact ? "h-9 w-9 !px-0" : ""}`}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icon}
      </span>
      {!compact && <span>{!mounted ? "Theme" : dark ? "Light" : "Dark"}</span>}
    </button>
  );
}
