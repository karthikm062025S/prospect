"use client";

import { ALL_BOARDS, ROW_A, ROW_B, BrandMark } from "@/components/landing/brand-marks";
import { ScrollVelocityMarquee } from "@/components/motion/scroll-velocity-marquee";
import { useSettled } from "@/components/motion/settled";

// v8 D6: two DISJOINT rows of 10 distinct companies (ROW_A/ROW_B, no repeats),
// drifting in opposite directions at a 40px/s base, with page scroll velocity
// adding speed and flipping direction (see components/motion/scroll-velocity-marquee.tsx).
//
// Every entry renders a mark + name in one consistent box; there are no
// text-only entries. Both rows are aria-hidden and BoardsList below is the
// accessible copy.
//
// Settled (reduced motion / ?motion=final) renders one static wrapped row.

function Item({ name }: { name: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 px-6 leading-none text-text-dim">
      <span className="flex size-8 shrink-0 items-center justify-center">
        <BrandMark name={name} size={32} />
      </span>
      <span className="font-sans text-step-1">{name}</span>
    </span>
  );
}

export function BoardsStrip() {
  const settled = useSettled();

  if (settled) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-y-6">
        {ALL_BOARDS.map((name) => (
          <Item key={name} name={name} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6" aria-hidden="true">
      <ScrollVelocityMarquee baseVelocity={40} className="scout-drift-edge-fade">
        {ROW_A.map((name) => (
          <Item key={name} name={name} />
        ))}
      </ScrollVelocityMarquee>
      <ScrollVelocityMarquee baseVelocity={-40} className="scout-drift-edge-fade mt-6">
        {ROW_B.map((name) => (
          <Item key={name} name={name} />
        ))}
      </ScrollVelocityMarquee>
    </div>
  );
}

/** The same names, once, for assistive technology. */
export function BoardsList() {
  return (
    <p className="sr-only">
      Boards Prospect watches include {ALL_BOARDS.join(", ")}, and about a
      thousand more.
    </p>
  );
}
