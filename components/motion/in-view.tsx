"use client";

/*
 * Vendored from motion-primitives (`components/core/in-view.tsx`),
 * design/vendor/motion-primitives — MIT License, Copyright (c) 2024 ibelick.
 *
 * Changes for this codebase: `cn`/`clsx` dropped (no such helper here, the
 * className is passed straight through), an explicit `reduced` short-circuit
 * added so the block renders in its final state with NO observer under
 * prefers-reduced-motion or ?motion=final, and the element union narrowed so
 * `motion[as]` typechecks under the project's strict tsconfig.
 */

import { useRef } from "react";
import { motion, useInView, type Transition, type Variant, type UseInViewOptions } from "motion/react";
import { useSettled } from "@/components/motion/settled";

export type InViewProps = {
  children: React.ReactNode;
  variants?: { hidden: Variant; visible: Variant };
  transition?: Transition;
  viewOptions?: UseInViewOptions;
  as?: "div" | "li" | "section";
  className?: string;
  once?: boolean;
  /** Skip the observer and animate in on mount: for content that is in view
      by construction (the hero), where an observer inside the pinned frame
      was seen not to fire until the first scroll. */
  immediate?: boolean;
};

const defaultVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function InView({
  children,
  variants = defaultVariants,
  transition,
  viewOptions,
  as = "div",
  className = "",
  once = true,
  immediate = false,
}: InViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useSettled();
  const isInView = useInView(ref, viewOptions) || immediate;
  const MotionComponent = motion[as];

  if (settled) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <MotionComponent
      // motion[as] is a union of three element types, so its ref prop is the
      // INTERSECTION of three element refs and no single ref satisfies it.
      // The runtime value is correct for whichever tag is rendered.
      ref={ref as never}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : once ? undefined : "hidden"}
      variants={variants}
      transition={transition}
    >
      {children}
    </MotionComponent>
  );
}
