"use client";

/*
 * Vendored from motion-primitives (`components/core/sliding-number.tsx`),
 * design/vendor/motion-primitives — MIT License, Copyright (c) 2024 ibelick.
 *
 * Changes for this codebase (v7 S3 D26.3):
 *   - `react-use-measure` is NOT a dependency here and no dependency may be
 *     added. The original measured each digit's pixel height to offset the
 *     column; every cell is `absolute inset-0`, so its height IS the column
 *     height and the same offset is expressible as a percentage. The measure,
 *     the `bounds.height` guard and the invisible first paint all go away.
 *   - `layoutId` dropped with `useId`: nothing here is a shared-layout morph,
 *     and two odometers on one page would otherwise share ids.
 *   - `padStart` generalised to `digits`, so a caller can render a fixed-width
 *     group (the "052" of "1,052") and group separators itself.
 *   - Decimals dropped: every number on this landing is an integer count.
 *   - The column reserves its width with `1ch` (the advance of "0" in the
 *     current face) so digits never reflow while they slide.
 */

import { useEffect } from "react";
import { motion, useSpring, useTransform, type MotionValue } from "motion/react";

const TRANSITION = { stiffness: 280, damping: 18, mass: 0.3 } as const;

function DigitCell({ mv, number }: { mv: MotionValue<number>; number: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    // One column height per step; > 5 wraps the short way round.
    const percent = offset > 5 ? (offset - 10) * 100 : offset * 100;
    return `${percent}%`;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {number}
    </motion.span>
  );
}

function Digit({ value, place }: { value: number; place: number }) {
  const digit = Math.floor(value / place) % 10;
  const animated = useSpring(digit, TRANSITION);

  useEffect(() => {
    animated.set(digit);
  }, [animated, digit]);

  return (
    <span className="relative inline-block w-[1ch] overflow-y-clip leading-none">
      <span className="invisible">0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <DigitCell key={i} mv={animated} number={i} />
      ))}
    </span>
  );
}

export type SlidingNumberProps = {
  value: number;
  /** Column count. Shorter values are zero-padded, so the width never changes. */
  digits?: number;
};

/**
 * An odometer for one integer (or one thousands group). Purely decorative:
 * every column paints all ten digits, so the caller owns the readable text.
 */
export function SlidingNumber({ value, digits }: SlidingNumberProps) {
  const safe = Math.max(0, Math.floor(value));
  const text = String(safe).padStart(digits ?? 1, "0");
  const places = text.split("").map((_, i) => 10 ** (text.length - 1 - i));

  return (
    <span className="inline-flex items-center">
      {places.map((place) => (
        <Digit key={place} value={safe} place={place} />
      ))}
    </span>
  );
}
