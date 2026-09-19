"use client";

/*
 * Component shape vendored from motion-primitives
 * (`components/core/infinite-slider.tsx`), design/vendor/motion-primitives —
 * MIT License, Copyright (c) 2024 ibelick.
 *
 * Changes for this codebase (v7 S3 D26.1):
 *   - `react-use-measure` is NOT a dependency here and no dependency may be
 *     added, so the track is measured with a plain `ResizeObserver`.
 *   - `cn` dropped (no such helper in this project).
 *   - The constant `animate(...)` tween is replaced by a scroll-velocity loop:
 *     useScroll -> useVelocity -> useSpring -> useTransform gives a factor
 *     clamped to [-5, 5]; a `useAnimationFrame` tick advances the offset by
 *     `baseVelocity * dt * (1 + |factor|)` and flips direction while the
 *     factor is negative, so the strip speeds up and reverses with the scroll
 *     and springs back to its 40px/s base drift when the scroll stops.
 *   - Settled (prefers-reduced-motion / ?motion=final) renders the children
 *     once in a plain wrapped row, with no observer and no frame loop.
 *
 * No per-frame React state: the loop writes a MotionValue, which drives a
 * transform. The only state here is the copy count, which changes on resize.
 *
 * PERF (v7 perf lane): the motion machinery — useScroll/useVelocity/useSpring
 * and the useAnimationFrame tick — is MOUNTED lazily. The strip is section 8
 * of 10, so at page load two rows were each registering a per-frame callback
 * on Motion's global frame loop (which keeps that loop running for the life of
 * the page) purely to early-return off screen. The viewport element and its
 * first frame render either way, so no pixel changes: the static branch below
 * IS what Drift paints at offset 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useSettled } from "@/components/motion/settled";

/** popmotion's `wrap`, inlined: motion@13's react entry does not export it. */
function wrap(min: number, max: number, value: number): number {
  const range = max - min;
  if (range <= 0) return min;
  return (((value - min) % range) + range) % range + min;
}

const SPRING = { damping: 50, stiffness: 400 } as const;
/** Scroll speed (px/s) that maps to the full [-5, 5] boost. */
const VELOCITY_RANGE = 1000;
const MAX_FACTOR = 5;

export type ScrollVelocityMarqueeProps = {
  children: React.ReactNode;
  /** Base drift in px/s. The sign is the direction. */
  baseVelocity?: number;
  className?: string;
};

export function ScrollVelocityMarquee({
  children,
  baseVelocity = 40,
  className = "",
}: ScrollVelocityMarqueeProps) {
  const settled = useSettled();
  const hostRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  // A viewport and a half of lead time, so the drift is already running before
  // the strip can be looked at. `once`: it never unmounts again.
  const near = useInView(hostRef, { once: true, margin: "150% 0px 150% 0px" });

  if (settled) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-y-4">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`overflow-hidden ${className}`.trim()}
      onPointerEnter={() => {
        paused.current = true;
      }}
      onPointerLeave={() => {
        paused.current = false;
      }}
      onFocusCapture={() => {
        paused.current = true;
      }}
      onBlurCapture={() => {
        paused.current = false;
      }}
    >
      {near ? (
        <Drift baseVelocity={baseVelocity} hostRef={hostRef} paused={paused}>
          {children}
        </Drift>
      ) : (
        // Frame zero of the drift, painted with no motion values at all.
        <div className="flex w-max">
          <div className="flex shrink-0 items-center whitespace-nowrap">{children}</div>
          <div className="flex shrink-0 items-center whitespace-nowrap" aria-hidden="true">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function Drift({
  children,
  baseVelocity,
  hostRef,
  paused,
}: {
  children: React.ReactNode;
  baseVelocity: number;
  hostRef: React.RefObject<HTMLDivElement | null>;
  paused: React.RefObject<boolean>;
}) {
  const copyRef = useRef<HTMLDivElement>(null);
  // Read every frame by the transform, so it must not trigger a render.
  const copyWidth = useRef(0);
  const [copies, setCopies] = useState(2);
  // Offscreen rows do not tick: the frame loop reads this ref, so the
  // in-view flip is one render, never a per-frame state change.
  const inView = useInView(hostRef, { margin: "20% 0px 20% 0px" });
  const onScreen = useRef(false);
  useEffect(() => {
    onScreen.current = inView;
  }, [inView]);

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, SPRING);
  const velocityFactor = useTransform(
    smoothVelocity,
    [-VELOCITY_RANGE, VELOCITY_RANGE],
    [-MAX_FACTOR, MAX_FACTOR],
    { clamp: true },
  );

  const baseX = useMotionValue(0);
  const x = useTransform(baseX, (value) =>
    copyWidth.current > 0 ? `${wrap(-copyWidth.current, 0, value)}px` : "0px",
  );

  const measure = useCallback(() => {
    const copy = copyRef.current;
    const viewport = hostRef.current;
    if (!copy || !viewport) return;
    const width = copy.offsetWidth;
    copyWidth.current = width;
    // Enough copies to cover the viewport plus one, so the wrap is seamless.
    const needed = width > 0 ? Math.ceil(viewport.offsetWidth / width) + 1 : 2;
    setCopies(Math.max(2, needed));
  }, [hostRef]);

  useEffect(() => {
    const copy = copyRef.current;
    const viewport = hostRef.current;
    if (!copy || !viewport) return;
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, [hostRef, measure]);

  useAnimationFrame((_, delta) => {
    if (paused.current || !onScreen.current) return;
    const seconds = delta / 1000;
    const factor = velocityFactor.get();
    const direction = factor < 0 ? -1 : 1;
    baseX.set(baseX.get() + direction * baseVelocity * seconds * (1 + Math.abs(factor)));
  });

  return (
    <motion.div className="flex w-max will-change-transform" style={{ x }}>
      {Array.from({ length: copies }, (_, copy) => (
        <div
          key={copy}
          ref={copy === 0 ? copyRef : undefined}
          className="flex shrink-0 items-center whitespace-nowrap"
          aria-hidden={copy === 0 ? undefined : true}
        >
          {children}
        </div>
      ))}
    </motion.div>
  );
}
