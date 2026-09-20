"use client";

import { useEffect, useState, type RefObject } from "react";
import { useScroll, useTransform, type MotionValue } from "motion/react";

// The ONE pinning primitive on the landing (redesign 2026-09-20, lane L3).
// Extracted verbatim from components/landing/pinned-steps.tsx, which proved
// the mechanic: a tall wrapper owns the runway, a `sticky top-0 h-dvh` child
// is the frame, and scroll position inside that runway is the only input the
// scene animates against. Every value is a function of scroll offset, so a
// scene is reversible and never a fired-once timeline.
//
// Why scrollY + a measured range rather than useScroll({ target, offset }):
// it is the mechanic already running in this codebase, it needs no assumption
// about how Motion resolves an offset pair against a sticky child, and the
// sentinel range below keeps progress at ~0 on first paint instead of
// snapping when the measurement lands.

/**
 * Scroll progress, 0 at the top of the runway and 1 at its end.
 *
 * `skip` is the scene's own "not pinned right now" — reduced motion, the
 * settled flag, or a viewport too narrow to pin in. It is a dependency of the
 * measurement, not just a guard: a scene only mounts its runway element while
 * it is pinned, so the measure has to run again when that flips.
 */
export function usePinProgress(
  ref: RefObject<HTMLElement | null>,
  skip: boolean,
): MotionValue<number> {
  const { scrollY } = useScroll();
  // Sentinel until measured: a huge end keeps progress at ~0 on first paint.
  const [range, setRange] = useState<[number, number]>([0, 1e9]);

  useEffect(() => {
    if (skip) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const top = el.getBoundingClientRect().top + globalThis.scrollY;
      // Math.max keeps the range ascending: Motion's WAAPI hand-off rejects a
      // non-monotonic input range outright.
      setRange([top, top + Math.max(el.offsetHeight - globalThis.innerHeight, 1)]);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    globalThis.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
  }, [ref, skip]);

  return useTransform(scrollY, range, [0, 1]);
}

/**
 * True once the viewport is at least `query` wide.
 *
 * A pinned scene holds one viewport-tall frame, so a scene whose settled
 * layout does not fit a phone screen must not pin there — clipping content
 * mid-scroll would put it behind a scroll position, which the accessibility
 * floor forbids. Server render and first paint are false, i.e. the plain
 * un-pinned layout, and the scene opts into the pin after mount.
 */
export function useWideViewport(query: string): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = globalThis.matchMedia(query);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return wide;
}
