"use client";

import { InView } from "@/components/motion/in-view";

// v7 D20 item 4.5. The ONE non-text entrance on the landing: a 12px rise and
// fade, 200ms, strong ease-out (feel.md: entering motion is ease-out and UI
// animation stays under 300ms; the custom curve rather than the bare keyword).
// It is deliberately NOT a text reveal — the two are different mechanics and
// mixing them is what made the previous pass read as noise.
const VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};
const TRANSITION = { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };

export function Rise({
  children,
  as = "div",
  className = "",
  delay = 0,
  immediate = false,
}: {
  children: React.ReactNode;
  as?: "div" | "li" | "section";
  className?: string;
  /** Stagger between siblings. feel.md caps this at 30-80ms. */
  delay?: number;
  /** Animate in on mount instead of on intersection (hero copy). */
  immediate?: boolean;
}) {
  return (
    <InView
      as={as}
      className={className}
      variants={VARIANTS}
      transition={{ ...TRANSITION, delay }}
      viewOptions={{ once: true, margin: "0px 0px -12% 0px" }}
      immediate={immediate}
    >
      {children}
    </InView>
  );
}
