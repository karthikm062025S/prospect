"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { TextReveal } from "@/components/motion/text-reveal";
import { useSettled } from "@/components/motion/settled";

// v7 D20 item 4.3. Three pinned statements on the sheet, revealed WORD by word
// against scroll position (the integratedbio /company mechanic; the hero uses
// the same primitive at character granularity). Reversible, because every value
// is a function of scroll offset rather than a fired-once timeline.
//
// FOLD 1 item 3: two columns, the /company layout. Left ~30% carries the
// eyebrow, the step counter and the progress rule; right ~60% ends flush with
// the container's right edge and carries the statement itself. One column
// below 1024, where 30% would leave the counter orphaned on its own line.
//
// D19.3: the user's story, not a feature list. 01 the pain, 02 what changes,
// 03 the outcome.
const STEPS = [
  "You found out about the right role too late to prepare for it.",
  "Prospect ranks the live feed for you and turns the gaps into a roadmap.",
  "You apply to roles that fit, with a plan to close what's missing.",
] as const;

const SPAN = 1 / STEPS.length;

// 30% + 10% gutter + 60%, so the right column ends on the container edge.
const GRID = "grid w-full gap-8 lg:grid-cols-[30%_minmax(0,1fr)] lg:gap-[10%]";
const STATEMENT =
  "font-display max-w-[16ch] text-step-4 leading-display tracking-display sm:text-step-5 lg:text-step-6";

function Statement({
  text,
  index,
  progress,
}: {
  text: string;
  index: number;
  progress: MotionValue<number>;
}) {
  // Statement i owns its own third and cross-fades at the seams. Every offset
  // MUST stay inside [0, 1] and ascend: Motion hands a scroll-derived value to
  // the compositor through the Web Animations API, which rejects an
  // out-of-range or non-monotonic offset outright ("Failed to execute
  // 'animate' on 'Element'"). So the first statement starts opaque at 0 and
  // the last never fades, instead of reaching past the ends of the range.
  const first = index === 0;
  const last = index === STEPS.length - 1;
  const inAt = index * SPAN;
  const outAt = (index + 1) * SPAN;
  const opacity = useTransform(
    progress,
    first
      ? [0, outAt - 0.02, outAt + 0.02]
      : last
        ? [inAt - 0.03, inAt + 0.015, 1]
        : [inAt - 0.03, inAt + 0.015, outAt - 0.02, outAt + 0.02],
    first ? [1, 1, 0] : last ? [0, 1, 1] : [0, 1, 1, 0],
  );

  return (
    <motion.div style={{ opacity }} className="absolute inset-x-0 top-0">
      <TextReveal
        text={text}
        granularity="word"
        progress={progress}
        // Inset inside the statement's own third so the first and last words
        // are not still resolving as the statement fades out.
        window={[inAt + 0.035, outAt - 0.07]}
        className={STATEMENT}
      />
    </motion.div>
  );
}

export function PinnedSteps() {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useSettled();
  const { scrollY } = useScroll();
  // Sentinel until measured: a huge end keeps progress at ~0 on first paint.
  const [range, setRange] = useState<[number, number]>([0, 1e9]);

  useEffect(() => {
    if (settled) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const top = el.getBoundingClientRect().top + globalThis.scrollY;
      setRange([top, top + el.offsetHeight - globalThis.innerHeight]);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    globalThis.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
  }, [settled]);

  const scrollYProgress = useTransform(scrollY, range, [0, 1]);
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStep(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length))));
  });

  // Settled: no runway, no pin, no interpolation. Same two columns, the three
  // statements stacked and fully revealed. The information, none of the
  // choreography.
  if (settled) {
    return (
      <div className={GRID}>
        <Rail current={STEPS.length} />
        <div className="flex flex-col gap-12">
          {STEPS.map((text) => (
            <p key={text} className={`${STATEMENT} text-text`}>
              {text}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // The runway IS the section: 300vh of scroll with a viewport-tall sticky
  // frame inside it. Nothing pads the top (fold 1 item 4) — the pin length
  // lives in this element's own height, not in space above the statements.
  return (
    <div ref={ref} className="relative h-[300dvh]">
      <div className={`sticky top-0 h-dvh content-center ${GRID}`}>
        <Rail current={step + 1} progress={scrollYProgress} />
        {/* Height reserved for the tallest statement so nothing reflows. */}
        <div className="relative min-h-[46dvh] sm:min-h-[40dvh]">
          {STEPS.map((text, i) => (
            <Statement key={text} text={text} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Left column: eyebrow, step counter, and the scroll progress rule. */
function Rail({ current, progress }: { current: number; progress?: MotionValue<number> }) {
  return (
    <div className="flex flex-col gap-4 self-start lg:pt-2">
      <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
        What changes
      </p>
      {/* D25: digits never render in Departure Mono (old-style figures) or
          Plex Mono (dotted zero). Satoshi with tabular-nums, so "01 / 03" and
          "02 / 03" are the same width. */}
      <p className="font-sans text-step-2xs tabular-nums tracking-label text-text">
        {String(current).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
      </p>
      <div className="h-px w-full max-w-[220px] bg-hairline">
        {progress ? (
          <motion.div
            style={{ scaleX: progress, transformOrigin: "left" }}
            className="h-px w-full bg-accent"
          />
        ) : (
          <div className="h-px w-full bg-accent" />
        )}
      </div>
    </div>
  );
}
