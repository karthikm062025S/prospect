"use client";

// The ONE filter-chip row (v5 contract: "Home filter chips + Applications
// status chips share ONE visual"). Home and Applications each grew their own
// copy of this and they drifted — same pills, different padding, and only the
// Applications one had the pre-measure fallback, so Home's active chip painted
// bg-coloured text on the bg until the first measurement landed.
//
// A filled pill SLIDES between the chips (translateX + width) rather than each
// chip toggling its own background, which is what makes the travel read as one
// object moving. Under prefers-reduced-motion the transition is dropped and the
// pill jumps — no second code path.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type FilterChipItem = { key: string; label: string; count: number };

export function FilterChips({
  items,
  active,
  onSelect,
  ariaLabel,
}: {
  items: FilterChipItem[];
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const el = chipRefs.current[active];
    if (!el) return;
    const left = el.offsetLeft;
    const top = el.offsetTop;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    // A zero width means the chip has no layout yet (fonts still loading, the
    // tab backgrounded). Keep `pill` null so the active chip holds its own
    // bg-text fill instead of handing over to an invisible 0px pill.
    if (width === 0) return;
    // Bail when nothing moved. The parent may hand back a fresh `items` array
    // on every render while an optimistic transition is pending, and a setPill
    // with a new object identity on each measure re-rendered forever
    // ("Maximum update depth exceeded" on the first Save — seen on Home).
    setPill((prev) =>
      prev && prev.left === left && prev.top === top && prev.width === width && prev.height === height
        ? prev
        : { left, top, width, height },
    );
  }, [active]);

  // Depend on the count VALUES, never the items array's identity.
  const countsKey = items.map((i) => `${i.key}:${i.count}`).join("|");
  useLayoutEffect(() => {
    measure();
    // Hydration paints before the web fonts settle, so the first measurement
    // can land on pills that are still the fallback width. One re-measure on
    // the next frame is what keeps the pill from starting at the wrong size.
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure, countsKey]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // The row is `flex flex-wrap`, so chips reflow onto new rows at narrower
  // widths independent of any window resize event (e.g. a sidebar toggling,
  // or a container query breakpoint) — a ResizeObserver on the row itself is
  // what catches that and re-measures the active chip's new offsetTop.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      className="relative -mx-1 flex flex-wrap items-center gap-1 px-1"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 rounded-pill bg-text transition-[transform,width,height] duration-[240ms] ease-[cubic-bezier(0,0,0.2,1)] motion-reduce:transition-none ${
          pill ? "" : "opacity-0"
        }`}
        style={
          pill
            ? { transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }
            : undefined
        }
      />
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            ref={(el) => {
              chipRefs.current[item.key] = el;
            }}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(item.key)}
            // Lane handoffs 2026-09-20 (L9 logged first; adopted here):
            // min-h-11 (44px, accessibility floor), not D10's literal 36px --
            // shared by Home and Applications (the one filter-chip component).
            className={`relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-[13px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
              isActive ? "border-transparent text-bg" : "border-text-dim text-text-dim hover:bg-raised hover:text-text"
            } ${
              // Before the first measurement (server HTML, slow hydrate) the
              // sliding pill is invisible — the active chip carries its own
              // fill so bg-coloured text is never painted on bg.
              isActive && !pill ? "bg-text" : ""
            }`}
          >
            {item.label}
            <span className={`text-[11px] tabular-nums ${isActive ? "text-bg" : "text-text-dim"}`}>{item.count}</span>
          </button>
        );
      })}
    </div>
  );
}
