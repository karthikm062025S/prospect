"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSettled } from "@/components/motion/settled";
import { useThemeTokens } from "@/components/motion/use-theme-tokens";

// v7 D20 item 3. Paper grain over the sheet surface only.
//
// The canvas is `sticky` and one viewport tall, not as tall as the sheet: the
// sheet runs several thousand pixels and a full-height WebGL surface would be
// a multi-megapixel texture for a effect that is only ever visible one screen
// at a time.
//
// Contrast: this sits UNDER the sheet's text at 0.05 alpha, and its two tints
// are --bg and --text-dim, so the worst case a glyph can land on is
// bg mixed 5% toward text-dim. That moves --bg by under 2% of its luminance
// and leaves --text at 12.5:1 (measured in scripts/contrast-pairs.mjs, the
// "text on textured sheet" pair).
// PERF (v7 perf lane): the WebGL shader runtime is 105 KB of parsed JS and it
// paints nothing below 1024px, yet a static import shipped it to every phone.
// `next/dynamic` moves it to its own chunk that is only requested once
// `enabled` is true, so the mobile landing never downloads or parses it.
// `ssr: false` because a canvas cannot render on the server anyway, and
// `loading: () => null` matches what the component already renders while the
// media query and the theme tokens resolve, so nothing about the desktop
// result changes.
const PaperTexture = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.PaperTexture),
  { ssr: false, loading: () => null },
);

const TOKENS = ["--bg", "--text-dim"] as const;
const OPACITY = 0.05;

export function SheetTexture() {
  const settled = useSettled();
  const colors = useThemeTokens(TOKENS);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settled) return undefined;
    const desktop = matchMedia("(min-width: 1024px)");
    const update = () => setEnabled(desktop.matches);
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, [settled]);

  // Below 1024 and under reduced motion the grain is the static SVG
  // feTurbulence data-URI on `.scout-sheet` in app/globals.css instead.
  if (!enabled || !colors) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none sticky top-0 z-0 -mb-[100dvh] h-dvh w-full"
      style={{ opacity: OPACITY }}
    >
      <PaperTexture
        colorBack={colors["--bg"]}
        colorFront={colors["--text-dim"]}
        contrast={0.35}
        roughness={0.55}
        fiber={0.25}
        fiberSize={0.4}
        crumples={0.12}
        crumpleSize={0.35}
        folds={0}
        foldCount={1}
        drops={0.05}
        fade={0.3}
        seed={7}
        speed={0}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
