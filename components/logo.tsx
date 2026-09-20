import Link from "next/link";

import { Mark as BrandMark } from "@/components/brand/wordmark";

// Redesign 2026-09-20 (Karthik D10): the nav brand is the REAL Prospect logo,
// not the old Grid S glyph. `Mark` is the "o" with its nugget from
// components/brand/wordmark.tsx -- the same geometry as app/icon.svg and the
// hero wordmark -- and the label beside it is set in the display face.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span className="flex shrink-0" style={{ width: size, height: size }}>
      <BrandMark label="Prospect" className="block size-full" />
    </span>
  );
}

// "/" changes meaning with authentication state, so the destination is the
// caller's call (D5): the landing scrolls to its own hero (`#hero`), the signed-in
// bar goes to the public landing's hero via "/welcome?view=landing" (proxy.ts
// lets that one query through its signed-in /welcome -> / redirect), and
// anything else still lands on the public route.
export function Logo({
  size = 22,
  className = "",
  href = "/welcome",
}: {
  size?: number;
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Prospect home"
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${className}`}
    >
      <LogoMark size={size} />
      <span className="font-display leading-none tracking-tight" style={{ fontSize: `${size * 0.75}px` }}>
        Prospect
      </span>
    </Link>
  );
}
