"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { SlidingNumber } from "@/components/motion/sliding-number";
import { useSettled } from "@/components/motion/settled";

// Lane L3, item 4: the landing's stat figures count up ONCE, when the band is
// actually on screen — not on mount, six sections below the fold.
//
// The roll itself is the SlidingNumber primitive that is already installed and
// already has its reduced-motion branch (components/motion/sliding-number.tsx);
// this only decides when it starts and paints the group separator. It is the
// same shape components/landing/coverage-odometer.tsx uses on the art band,
// which is a different component with a different ground and type role.

/** "1052" -> ["1", "052"]; the caller paints a "," between the groups. */
function groupDigits(text: string): string[] {
  const groups: string[] = [];
  for (let end = text.length; end > 0; end -= 3) {
    groups.unshift(text.slice(Math.max(0, end - 3), end));
  }
  return groups;
}

export function StatOdometer({
  value,
  text,
  className,
}: {
  /** The counted figure, or null when the read failed. */
  value: number | null;
  /** The rendered string for that figure — the only thing read aloud. */
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const settled = useSettled();
  const rolling = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });

  return (
    <span ref={ref} className={className}>
      {value === null || settled ? (
        text
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden="true" className="inline-flex items-center">
            {groupDigits(String(Math.max(0, Math.floor(value)))).map((group, index) => (
              <span key={group + String(index)} className="inline-flex items-center">
                {index > 0 ? <span>,</span> : null}
                <SlidingNumber value={rolling ? Number(group) : 0} digits={group.length} />
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
