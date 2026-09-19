"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ArtPoster, type ArtWork } from "@/components/landing/art";
import { useSettled } from "@/components/motion/settled";

// v7 D20 item 4.4 / 4.6 / 4.9. A 70vh band of one work with a single line of
// copy over it.
//
// Parallax: the art moves at 0.6x page scroll, so the layer is 140% of the
// band's height and travels 0.4 * bandHeight across the band's own scroll
// range. Derived from `scrollY` against a measured range for the same reason
// the text reveal is (see components/motion/text-reveal.tsx): a ViewTimeline
// stops applying past its range and the layer snaps back.
//
// Scrim: a fixed ink veil, not a decorative gradient. The alpha is the
// measured minimum that keeps --ink-text at 4.5:1 over the LIGHTEST step of
// the poster palette (#F7F7F5 in light, #B9C2BD in dark); the gradient only
// ever adds more. Numbers are printed by `node scripts/contrast-pairs.mjs`.
const PARALLAX = 0.4;

export function ArtBand({
  work,
  children,
  labelledBy,
  id,
  align = "bottom",
}: {
  work: ArtWork;
  children: React.ReactNode;
  labelledBy: string;
  id?: string;
  /** Where the copy sits, which picks the scrim: centred copy needs the heavy
      even veil, bottom copy can use the one that leaves the top open. */
  align?: "bottom" | "center";
}) {
  const settled = useSettled();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const [range, setRange] = useState<[number, number]>([0, 1e9]);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    if (settled) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const top = el.getBoundingClientRect().top + globalThis.scrollY;
      const height = el.offsetHeight;
      setRange([top - globalThis.innerHeight, top + height]);
      setTravel(height * PARALLAX);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    globalThis.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
  }, [settled]);

  const y = useTransform(scrollY, range, [travel, -travel]);

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      ref={ref}
      className={`relative isolate flex h-[70dvh] min-h-[360px] overflow-hidden ${
        align === "center" ? "items-center" : "items-end"
      }`}
    >
      <motion.div
        className="absolute inset-x-0 -top-[20%] h-[140%]"
        style={settled ? undefined : { y }}
      >
        <ArtPoster work={work} />
      </motion.div>
      <div
        className={`${align === "center" ? "scout-scrim-even" : "scout-scrim"} absolute inset-0`}
        aria-hidden="true"
      />
      <div className="relative w-full px-gutter pb-section">
        <div className="mx-auto w-full max-w-page">{children}</div>
      </div>
    </section>
  );
}
