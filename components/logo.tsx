import Link from "next/link";

// Grid S: one square-ended path with the sage counter marker. The geometry is
// shared with app/icon.svg and the generated Apple/Open Graph assets.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M52 12H16V32H48V52H12"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="45.5" y="17.5" width="9" height="9" fill="var(--sage, #2d5a43)" />
    </svg>
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
