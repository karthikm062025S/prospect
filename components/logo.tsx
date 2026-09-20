import Link from "next/link";
import { Wordmark as RawWordmark, Mark as RawMark } from "@/components/brand/wordmark";

// Thin nav wrapper around L2's components/brand/wordmark.tsx (the one place
// Karthik's real logo SVG is traced into paths -- build/MISSION.md's
// dependency note: L4 imports it instead of converting the SVG a second
// time). Its exports already give a static Wordmark/Mark; this file only
// adds the nav-specific crop and the signed-in-aware Link.
//
// The raw viewBox is the full 4096x2236 canvas (mostly whitespace above and
// below the ink, so the hero's rise-in letters have room to animate), and
// RawWordmark takes no size prop -- only className. The letters + sparkle
// measure y 676-1652 of that 2236-tall box (~43.65% ink), so a box 55px
// tall puts the ink at ~24px -- D10 (Karthik): one rendered height across
// the app tab bar AND the landing nav, never clipped. `w-auto` lets the
// browser derive the width from the svg's own intrinsic (viewBox) ratio.
export function Wordmark({ className = "" }: { className?: string }) {
  return <RawWordmark className={`h-[55px] w-auto shrink-0 ${className}`} />;
}

/** The "o" + nugget mark only, for tight spaces. RawMark has no size prop, so a sized wrapper does the fitting. */
export function Mark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ height: size, width: size }}>
      <RawMark className="h-full w-full" />
    </span>
  );
}

// "/" changes meaning with authentication state, so the destination is the
// caller's call (D5): the landing scrolls to its own hero (`#hero`), the signed-in
// bar goes to the public landing's hero via "/welcome?view=landing" (proxy.ts
// lets that one query through its signed-in /welcome -> / redirect), and
// anything else still lands on the public route.
export function Logo({
  className = "",
  href = "/welcome",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Prospect home"
      className={`flex min-h-11 shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${className}`}
    >
      <Wordmark />
    </Link>
  );
}
