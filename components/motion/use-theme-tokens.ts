"use client";

import { useEffect, useState } from "react";

// v7 D20. Resolves CSS custom properties to concrete colour strings on the
// client and re-resolves them when the theme changes.
//
// Two consumers need this and neither can use var() directly:
//   - the text reveal interpolates colour with motion, and Motion cannot
//     interpolate `var(--a)` -> `var(--b)`; it needs real rgb()/rgba() values.
//   - the WebGL shaders take colours as uniforms, not as CSS.
//
// The theme changes two ways in this app: app/layout.tsx writes data-theme on
// <html> before paint (and the toggle rewrites it), and with no stored choice
// the palette follows prefers-color-scheme. Both are watched.
export function useThemeTokens(names: readonly string[]): Record<string, string> | null {
  const [values, setValues] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const style = getComputedStyle(root);
      const next: Record<string, string> = {};
      for (const name of names) next[name] = style.getPropertyValue(name).trim();
      // Only re-render when something actually moved, so a theme write that
      // does not change these tokens costs nothing.
      setValues((previous) =>
        previous && names.every((name) => previous[name] === next[name]) ? previous : next,
      );
    };
    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
    // `names` is a module-level constant at every call site; joining it keeps
    // the effect from re-subscribing on every render without an extra memo.
  }, [names.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return values;
}
