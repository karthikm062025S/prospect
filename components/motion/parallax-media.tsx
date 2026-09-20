"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useSettled } from "@/components/motion/settled";

// Depth for the two product bands (lane L3, item 3). The screenshot column
// travels SLOWER than the copy column beside it, so the band reads as two
// planes instead of one flat row, and the shot settles out of a small
// perspective tilt as it enters.
//
// The rate: y runs +TRAVEL -> -TRAVEL across the whole time the band is on
// screen, which is roughly (viewport + band height) of scrolling. At 10vh
// each way that is ~20vh of give against ~145vh of travel, i.e. the shot moves
// at about 0.86x the page — the 0.85x the redesign asked for, expressed in the
// one unit that holds at any viewport height.
//
// Layout is untouched: `y`, `rotateX` and `perspective` are compositor
// properties, so nothing reflows and nothing widens the container.
const TRAVEL = ["10vh", "-10vh"];
const TILT = [7, 0];

export function ParallaxMedia({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useSettled();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], TRAVEL);
  // Settled by the time the band is centred, so the shot is square-on while
  // it is actually being read.
  const rotateX = useTransform(scrollYProgress, [0.1, 0.45], TILT);

  return (
    <div ref={ref} className={className} style={settled ? undefined : { perspective: "1200px" }}>
      {settled ? (
        // prefers-reduced-motion / ?motion=final: the shot in its final
        // position, with no transform and no scroll subscription.
        children
      ) : (
        <motion.div style={{ y, rotateX, transformOrigin: "50% 100%" }}>{children}</motion.div>
      )}
    </div>
  );
}
