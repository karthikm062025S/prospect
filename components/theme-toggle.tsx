"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark";

// The page is server-rendered (no `document`), but the inline head script
// (app/layout.tsx) sets [data-theme] on <html> before the client paints.
// useSyncExternalStore is the React-sanctioned way to read that external,
// client-only value without a server/client hydration mismatch: it renders
// getServerSnapshot() during SSR/hydration, then swaps to getSnapshot() —
// no manual "mounted" state + effect needed.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function getServerSnapshot(): Theme {
  return "light";
}
function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // storage unavailable (private mode, quota) — theme still flips for this load
  }
  listeners.forEach((cb) => cb());
}

// Flips [data-theme] on <html> + persists localStorage.theme (04-uiux-brief §1/§6).
// No transition on the swap — a full-page color transition is slop (§6 ThemeToggle spec).
// D4: the toggle left the app bar and lives in the account menu, so it needs a
// row skin (label left, current value right) alongside the original icon pill.
// The default variant is unchanged for every other caller.
export function ThemeToggle({ variant }: { variant?: "menu" } = {}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card px-3 text-left font-sans text-sm text-text hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <span>Theme</span>
        <span className="flex items-center gap-1.5 text-text-dim">
          {isDark ? <MoonIcon /> : <SunIcon />}
          {isDark ? "Dark" : "Light"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 font-label text-[11px] tracking-label uppercase text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
