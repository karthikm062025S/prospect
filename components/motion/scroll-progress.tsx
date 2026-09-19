"use client";

/*
 * Vendored from motion-primitives (`components/core/scroll-progress.tsx`),
 * design/vendor/motion-primitives — MIT License, Copyright (c) 2024 ibelick.
 *
 * Changes for this codebase (v7 S3 D26, optional placement): `cn` and the
 * `containerRef` variant dropped (the landing only ever tracks the window),
 * the spring options fixed, and a settled short-circuit added so
 * prefers-reduced-motion / ?motion=final render no bar and no scroll listener.
 */

import { motion, useScroll, useSpring } from "motion/react";
import { useSettled } from "@/components/motion/settled";

const SPRING = { stiffness: 200, damping: 50, restDelta: 0.001 } as const;

export function ScrollProgress({ className = "" }: { className?: string }) {
  const settled = useSettled();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, SPRING);

  if (settled) return null;

  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-accent ${className}`.trim()}
      style={{ scaleX }}
    />
  );
}
