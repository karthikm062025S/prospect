"use client";

// Rise — the one non-text entrance in the house motion grammar
// (design/SYSTEM.md "Motion grammar"): 12px rise + fade, 200ms, ease
// [0.23, 1, 0.32, 1]. Used for feed rows and roadmap nodes; the stagger
// between siblings is 0.04-0.06s, never more.
//
// Reduced motion: `useSettled()` covers BOTH prefers-reduced-motion and the
// in-app Settled setting, and the settled branch renders the plain element in
// its final state — no observer, no motion value, no slowed-down version of
// the same animation (a11y floor).
//
// The stagger is capped at CAP siblings: Home renders up to 144 rows, and an
// uncapped 0.05s/row would leave the tail of the list blank for seven seconds.

import { motion } from "motion/react";
import { useSettled } from "@/components/motion/settled";
// The timings and the delay maths live in a plain .ts sibling so the node
// test runner can import and exercise them (see rise-math.ts).
import { RISE_DURATION, RISE_EASE, riseDelay } from "@/components/motion/rise-math";

export { RISE_DURATION, RISE_EASE, RISE_STAGGER, RISE_STAGGER_CAP, riseDelay } from "@/components/motion/rise-math";

export type RiseProps = {
  children: React.ReactNode;
  /** Position among siblings; drives the stagger. */
  index?: number;
  as?: "div" | "li" | "section";
  className?: string;
};

export function Rise({ children, index = 0, as = "div", className }: RiseProps) {
  const settled = useSettled();

  if (settled) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  // motion[as] is a union of three element types, so its ref prop is the
  // INTERSECTION of three refs — nothing here passes one, so no cast is
  // needed (unlike components/motion/in-view.tsx, which does hold a ref).
  const MotionComponent = motion[as];
  return (
    <MotionComponent
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: RISE_DURATION, ease: RISE_EASE, delay: riseDelay(index) }}
    >
      {children}
    </MotionComponent>
  );
}
