"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="group relative flex h-9 w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--panel)_70%,transparent)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[color-mix(in_oklab,var(--accent)_55%,var(--border))] hover:text-[var(--text)]"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-500 ${
          mounted ? "" : "opacity-0"
        } ${isDark ? "rotate-0" : "rotate-[360deg]"}`}
      >
        {isDark ? "🌙" : "☀️"}
      </span>
      <span className="transition-opacity">{isDark ? "Dark mode" : "Light mode"}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100">
        {isDark ? "→ light" : "→ dark"}
      </span>
    </button>
  );
}
