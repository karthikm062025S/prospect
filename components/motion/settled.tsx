"use client";

import { createContext, useContext } from "react";
import { useReducedMotion } from "motion/react";

// v7 D20 item 9. One switch that forces every reveal on the landing to its
// settled end state, so a screenshot is deterministic. Two things flip it:
//   - prefers-reduced-motion (always, in production too)
//   - /welcome?motion=final (development builds only, see app/welcome/page.tsx)
// When it is on, the animated components render plain markup: no observers,
// no motion values, no --text-unrevealed anywhere on the page.
const SettledContext = createContext(false);

export function SettledProvider({
  settled,
  children,
}: {
  settled: boolean;
  children: React.ReactNode;
}) {
  return <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>;
}

/** True when this render must be the final, static state. */
export function useSettled(): boolean {
  const forced = useContext(SettledContext);
  const reduced = useReducedMotion();
  return forced || reduced === true;
}
