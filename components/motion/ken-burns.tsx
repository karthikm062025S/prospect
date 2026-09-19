"use client";

import { useSettled } from "@/components/motion/settled";

// v7 S3 D26.2. A continuous Ken Burns drift for a full-bleed art layer:
// scale 1.00 -> 1.06 over 28s, ease-in-out, infinite alternate. The animation
// is CSS keyframes (.scout-drift-kenburns in app/globals.css) on the poster
// wrapper only — never on text, never on the main thread. Settled
// (prefers-reduced-motion / ?motion=final) drops the class entirely.

export function KenBurns({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const settled = useSettled();
  const drift = settled ? "" : "scout-drift-kenburns";
  return <div className={`${drift} ${className}`.trim()}>{children}</div>;
}
