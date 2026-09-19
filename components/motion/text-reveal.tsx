"use client";

import { useRef } from "react";
import { motion, useInView, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { splitUnits, unitRange, type Granularity } from "@/components/motion/reveal-math";
import { useSettled } from "@/components/motion/settled";
import { useThemeTokens } from "@/components/motion/use-theme-tokens";

// v7 D20 item 5. THE shared scroll-tied text reveal for the landing: the
// integratedbio mechanic, per character in the hero and per word in the pinned
// statements, rebuilt on motion@13.
//
// v9: two modes. With a parent `progress` (the pinned statements) each unit
// interpolates its colour against that scroll progress, reversible. Without
// one the reveal is AUTOMATIC: the first time the block is half in view every
// unit transitions to its revealed colour on a CSS stagger. The old own-scroll
// mode measured a pixel span against scrollY and never lit up on the deployed
// page (the span state never reached the useTransform), so it is gone.

type Tone = "text" | "ink-text";

// Each tone owns BOTH ends of its interpolation. The unrevealed colour has to
// suit the ground it sits on: the page tone dims toward a muted sage on --bg,
// the ink tone stays light because it sits on the hero/band scrims.
const TONE: Record<Tone, { from: string; to: string }> = {
  text: { from: "--text-unrevealed", to: "--text" },
  "ink-text": { from: "--text-unrevealed-ink", to: "--ink-text" },
};

// Resolved on the client; Motion needs real colour values, not var() strings.
const TOKENS = [
  "--text-unrevealed",
  "--text-unrevealed-ink",
  "--text",
  "--ink-text",
] as const;

function Unit({
  text,
  lead,
  progress,
  start,
  end,
  unrevealed,
  revealed,
}: {
  text: string;
  lead: string;
  progress: MotionValue<number>;
  start: number;
  end: number;
  unrevealed: string;
  revealed: string;
}) {
  const color = useTransform(progress, [start, end], [unrevealed, revealed]);
  return (
    <>
      {lead ? <span>{lead}</span> : null}
      <motion.span style={{ color }}>{text}</motion.span>
    </>
  );
}

export type TextRevealProps = {
  text: string;
  granularity: Granularity;
  /** Revealed colour token. Defaults to --text; the hero uses --ink-text. */
  tone?: Tone;
  className?: string;
  as?: "h1" | "h2" | "p";
  id?: string;
  /**
   * Drive the reveal from a parent's scroll progress (the hero pin) instead of
   * this element's own position. `window` narrows it to a slice of that
   * progress, e.g. [0, 0.6] for "the first 60% of the pin".
   */
  progress?: MotionValue<number>;
  window?: [number, number];
};

export function TextReveal({
  text,
  granularity,
  tone = "text",
  className = "",
  as = "p",
  id,
  progress: external,
  window: range = [0, 1],
}: TextRevealProps) {
  const settled = useSettled();
  const colors = useThemeTokens(TOKENS);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [windowStart, windowEnd] = range;
  const fallback = useMotionValueZero();
  const progress = useTransform(
    external ?? fallback,
    [windowStart, Math.max(windowStart + 1e-4, windowEnd)],
    [0, 1],
  );

  const Tag = as;
  const units = splitUnits(text, granularity);

  // Automatic mode. Plain spans, a CSS colour transition per unit, staggered
  // by index; `data-revealed` flips the whole line once it is half in view.
  // Settled paints the revealed colour outright.
  if (!external) {
    const step = granularity === "char" ? 0.025 : 0.06;
    const revealed = settled || inView;
    return (
      <Tag
        id={id}
        ref={ref as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
        className={`scout-reveal ${className}`.trim()}
        data-revealed={revealed ? "" : undefined}
        style={
          {
            "--reveal-from": `var(${TONE[tone].from})`,
            "--reveal-to": `var(${TONE[tone].to})`,
          } as React.CSSProperties
        }
      >
        {units.map((unit, index) => (
          <span key={`${index}-${unit.text}`}>
            {unit.lead}
            <span style={{ transitionDelay: `${(index * step).toFixed(3)}s` }}>{unit.text}</span>
          </span>
        ))}
      </Tag>
    );
  }

  // Scroll-driven mode. Until the tokens resolve (SSR and the first client
  // frame) the whole line paints in the unrevealed colour through plain CSS.
  // It is the same pixel as progress 0, so the swap to per-unit spans is
  // invisible.
  if (settled || !colors) {
    return (
      <Tag
        id={id}
        ref={ref as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
        className={className}
        style={{ color: `var(${settled ? TONE[tone].to : TONE[tone].from})` }}
      >
        {text}
      </Tag>
    );
  }

  return (
    <Tag
      id={id}
      ref={ref as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
      className={className}
      style={{ color: `var(${TONE[tone].from})` }}
    >
      {units.map((unit, index) => {
        const [start, end] = unitRange(index, units.length, granularity);
        return (
          <Unit
            key={`${index}-${unit.text}`}
            text={unit.text}
            lead={unit.lead}
            progress={progress}
            start={start}
            end={end}
            unrevealed={colors[TONE[tone].from]}
            revealed={colors[TONE[tone].to]}
          />
        );
      })}
    </Tag>
  );
}

/** A constant 0 MotionValue so the hook order is identical in both modes. */
function useMotionValueZero() {
  return useMotionValue(0);
}
