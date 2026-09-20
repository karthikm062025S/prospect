// Phosphor THIN weight (MIT), copied verbatim from
// C:\My_WorkSpace\design\icons\phosphor\SVGs\thin\ — only the four the feature
// grid uses, inlined so the landing adds no icon dependency. Same recipe as
// components/icons.tsx: viewBox 256, stroke currentColor, aria-hidden.

type IconProps = { size?: number };

function Frame({ size = 22, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="8"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** funnel-thin — filter by term and role. */
export function FunnelIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M34.1,61.38A8,8,0,0,1,40,48H216a8,8,0,0,1,5.92,13.38L152,136v58.65a8,8,0,0,1-3.56,6.66l-32,21.33A8,8,0,0,1,104,216V136Z" />
    </Frame>
  );
}

/** lock-key-thin — private tracking. */
export function LockKeyIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="40" y="88" width="176" height="128" rx="8" />
      <path d="M88,88V56a40,40,0,0,1,80,0V88" />
      <circle cx="128" cy="140" r="20" />
      <line x1="128" y1="160" x2="128" y2="184" />
    </Frame>
  );
}

/** article-thin — the posting, in place. */
export function ArticleIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="32" y="48" width="192" height="160" rx="8" />
      <line x1="80" y1="96" x2="176" y2="96" />
      <line x1="80" y1="128" x2="176" y2="128" />
      <line x1="80" y1="160" x2="176" y2="160" />
    </Frame>
  );
}

/** magnifying-glass-thin — step 01, browse the feed. */
export function MagnifyingGlassIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <circle cx="112" cy="112" r="80" />
      <line x1="168.57" y1="168.57" x2="224" y2="224" />
    </Frame>
  );
}

/** sign-in-thin — step 02, sign in when you find one. */
export function SignInIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <line x1="24" y1="128" x2="136" y2="128" />
      <polyline points="96 88 136 128 96 168" />
      <polyline points="136 40 200 40 200 216 136 216" />
    </Frame>
  );
}

/** bookmark-simple-thin — step 03, track it. */
export function BookmarkSimpleIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M192,224l-64-40L64,224V48a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8Z" />
    </Frame>
  );
}

/** chat-circle-thin — the nav feedback pill (D22). */
export function ChatCircleIcon({ size = 18 }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M79.93,211.11a96,96,0,1,0-35-35h0L32.42,213.46a8,8,0,0,0,10.12,10.12l37.39-12.47Z" />
    </Frame>
  );
}

/** Directional arrow for the circular CTAs — rotate with a wrapper class. */
export function ArrowDownIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <line x1="12" y1="4" x2="12" y2="20" />
      <polyline points="5 13 12 20 19 13" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 20 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <line x1="12" y1="20" x2="12" y2="4" />
      <polyline points="5 11 12 4 19 11" />
    </svg>
  );
}

export function CaretDownIcon({ size = 12 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Phosphor BOLD weight (MIT), copied verbatim from
// C:\My_WorkSpace\design\icons\phosphor\SVGs\bold\ — the three the feature
// cards use. Bold, not thin: at 40px on a card a thin stroke disappears, and
// the reference's card art is heavy. Same recipe as the thin set above.

function BoldFrame({ size = 40, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="20"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** list-magnifying-glass-bold — the ranked live feed. */
export function ListSearchIcon({ size }: IconProps) {
  return (
    <BoldFrame size={size}>
      <line x1="40" y1="64" x2="216" y2="64" />
      <line x1="40" y1="128" x2="104" y2="128" />
      <line x1="40" y1="192" x2="120" y2="192" />
      <circle cx="184" cy="144" r="32" />
      <line x1="206.63" y1="166.63" x2="232" y2="192" />
    </BoldFrame>
  );
}

/** path-bold — the semester roadmap. */
export function PathIcon({ size }: IconProps) {
  return (
    <BoldFrame size={size}>
      <circle cx="200" cy="200" r="24" />
      <path d="M72,56h96a32,32,0,0,1,0,64H72a40,40,0,0,0,0,80H176" />
    </BoldFrame>
  );
}

/** robot-bold — the four agents. */
export function RobotIcon({ size }: IconProps) {
  return (
    <BoldFrame size={size}>
      <circle cx="88" cy="104" r="12" fill="currentColor" stroke="none" />
      <circle cx="168" cy="104" r="12" fill="currentColor" stroke="none" />
      <rect x="32" y="56" width="192" height="160" rx="24" />
      <line x1="128" y1="56" x2="128" y2="16" />
      <rect x="68" y="144" width="120" height="36" rx="18" />
    </BoldFrame>
  );
}

/** check-bold — the bullet glyph in the showcase and under-the-hood lists. */
export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <BoldFrame size={size}>
      <polyline points="216 72 104 184 40 120" />
    </BoldFrame>
  );
}
