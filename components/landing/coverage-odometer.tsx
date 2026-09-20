"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { SlidingNumber } from "@/components/motion/sliding-number";
import { useSettled } from "@/components/motion/settled";
import { formatStat, roundToTen } from "@/lib/public-stats-format";

// v7 S3 D26.3. The odometer coverage band (replaced the spring count-up):
// same grid, same labels, same scrim rule (--ink-text on the art band). Only
// the value cell differs — digit columns that roll from 0 to the real count
// once, when the band comes into view.
//
// D25: the digits are font-display (DM Sans, lining figures). Plex
// Mono's dotted zero never renders a
// digit on this page. Column width is reserved with `1ch` inside
// SlidingNumber, so a 1 and a 0 occupy the same column and nothing reflows.

export type Coverage = { label: string; value: number | null; approx?: boolean };

const VALUE_CLASS =
  "font-display lining-nums text-step-5 leading-display text-ink-text lg:text-step-6";

/** "1052" -> ["1", "052"]; the caller paints a "," between the groups. */
function groupDigits(text: string): string[] {
  const groups: string[] = [];
  for (let end = text.length; end > 0; end -= 3) {
    groups.unshift(text.slice(Math.max(0, end - 3), end));
  }
  return groups;
}

// PERF (v7 perf lane): frame zero of SlidingNumber, with no motion values.
// Every SlidingNumber column paints all ten digits as motion.spans behind an
// overflow clip, so four stats cost roughly 120 motion components and 120
// scroll-independent transforms MOUNTED AT PAGE LOAD, six sections below the
// fold, only to sit at 0 until the band is reached. This renders the identical
// box — same 1ch column, same invisible "0" spacer, same absolutely positioned
// cell at offset 0 — as plain spans until the band is one viewport away.
function StaticColumns({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center">
      {text.split("").map((digit, index) => (
        <span
          key={String(index)}
          className="relative inline-block w-[1ch] overflow-y-clip leading-none"
        >
          <span className="invisible">0</span>
          <span className="absolute inset-0 flex items-center justify-center">{digit}</span>
        </span>
      ))}
    </span>
  );
}

function Odometer({
  value,
  approx,
  rolling,
  mounted,
}: {
  value: number;
  approx: boolean;
  rolling: boolean;
  mounted: boolean;
}) {
  const target = approx ? roundToTen(value) : value;
  const groups = groupDigits(String(target));

  return (
    <>
      <span className="sr-only">{formatStat(value, approx)}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        {approx ? "~" : null}
        {groups.map((group, index) => (
          <span key={group + String(index)} className="inline-flex items-center">
            {index > 0 ? <span>,</span> : null}
            {mounted ? (
              <SlidingNumber value={rolling ? Number(group) : 0} digits={group.length} />
            ) : (
              <StaticColumns text={"0".repeat(group.length)} />
            )}
          </span>
        ))}
      </span>
    </>
  );
}

export function CoverageOdometer({ items }: { items: Coverage[] }) {
  const ref = useRef<HTMLDListElement>(null);
  const settled = useSettled();
  // One state flip for the whole band, never per frame.
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  // PERF: a second, earlier flip that only decides WHEN the digit columns are
  // built. A full viewport of lead time, so the odometer is mounted and idling
  // at 0 long before `inView` tells it to roll; the roll itself is unchanged.
  const mounted = useInView(ref, { once: true, margin: "100% 0px 100% 0px" });

  return (
    <dl ref={ref} className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dd className={VALUE_CLASS}>
            {item.value === null ? (
              <span className="font-sans text-step-2">not available</span>
            ) : settled ? (
              formatStat(item.value, item.approx)
            ) : (
              <Odometer
                value={item.value}
                approx={item.approx === true}
                rolling={inView}
                mounted={mounted}
              />
            )}
          </dd>
          <dt className="font-label mt-3 text-step-2xs uppercase leading-title tracking-label text-ink-text/75">
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
