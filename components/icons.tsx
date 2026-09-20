// Inline Phosphor icons (MIT). UI/UX polish lane D (2026-09-19) moved the whole
// set to the BOLD weight (strokeWidth 24, path data copied verbatim from
// C:\My_WorkSpace\design\icons\phosphor\SVGs\bold\*.svg) — Karthik asked for
// bold icons, and the previous thin (8) / light (12) strokes rendered as
// sub-pixel hairlines at 16-20px on a DPR-1.5 screen.
//
// Recipe: stroke currentColor, viewBox 256, strokeWidth 24, aria-hidden,
// shrink-0. Export names are unchanged so no call site moves; sizes are
// unchanged too (20px is the row/control size, 16px the inline-with-11px-label
// size, 48px the empty-state moment). Every ICON-ONLY control that renders one
// of these carries its own 44px target + aria-label at the call site.
//
// `fill` marks an active/selected state (BookmarkIcon), never a second weight.

const BOLD = "24";

export function SunIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="128" y1="36" x2="128" y2="20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <circle cx="128" cy="128" r="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="60" y1="60" x2="48" y2="48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="60" y1="196" x2="48" y2="208" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="196" y1="60" x2="208" y2="48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="196" y1="196" x2="208" y2="208" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="36" y1="128" x2="20" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="128" y1="220" x2="128" y2="236" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="220" y1="128" x2="236" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d="M108.11,28.11A96.09,96.09,0,0,0,227.89,147.89,96,96,0,1,1,108.11,28.11Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={BOLD}
      />
    </svg>
  );
}

export function ArrowSquareOutIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="136" y1="120" x2="216" y2="40" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="216 104 215.99 40.01 152 40" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M184,140v68a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8h68" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// 16 is the inline-beside-an-11px-label size (ApplyConfirm, the GetStarted
// done disc); a caller that needs the 20px control size passes `size`.
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="shrink-0">
      <polyline points="40 144 96 200 224 72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="shrink-0">
      <line x1="200" y1="56" x2="56" y2="200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="200" y1="200" x2="56" y2="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function CaretDownIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="208 96 128 176 48 96" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// "filter" — funnel. get-started.tsx's checklist is the one caller.
export function FunnelSimpleIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d="M34.1,61.38A8,8,0,0,1,40,48H216a8,8,0,0,1,5.92,13.38L152,136v58.65a8,8,0,0,1-3.56,6.66l-32,21.33A8,8,0,0,1,104,216V136Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={BOLD}
      />
    </svg>
  );
}

// "sort" — sort-ascending. Never the funnel: that means filter everywhere else
// in the app (Jakob's Law, ui_laws.md #3 / #16).
export function SortIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="48" y1="128" x2="116" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="48" y1="64" x2="180" y2="64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="48" y1="192" x2="100" y2="192" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="144 168 184 208 224 168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="184" y1="208" x2="184" y2="112" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// Kept as its own export (the GetStarted checklist glyph); same bold weight as
// BookmarkIcon now, so the two never read as two different icon sets.
export function BookmarkThinIcon() {
  return (
    <svg
      viewBox="0 0 256 256"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={BOLD}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M192,224l-64-40L64,224V48a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8Z" />
    </svg>
  );
}

export function MagnifyingGlassIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <circle cx="112" cy="112" r="80" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="168.57" y1="168.57" x2="224" y2="224" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <rect x="40" y="88" width="176" height="128" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <circle cx="128" cy="152" r="16" fill="currentColor" />
      <path d="M88,88V56a40,40,0,0,1,80,0V88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// --- Slice 7 (Applications 50/50) ------------------------------------------

export function NotePencilIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <polygon points="128 160 96 160 96 128 192 32 224 64 128 160" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="164" y1="60" x2="196" y2="92" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M216,140.57V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8h67.43" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function CalendarCheckIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <rect x="40" y="40" width="176" height="176" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="176" y1="24" x2="176" y2="52" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="80" y1="24" x2="80" y2="52" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="40" y1="88" x2="216" y2="88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="92 152 116 176 164 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// size 20 = the row/control size; the 48px variant is the RB-024 empty-state
// moment. Both are the same bold weight — `thin` now only picks the SIZE, and
// the prop name is kept so no call site moves.
export function FileTextIcon({ thin = false }: { thin?: boolean }) {
  const size = thin ? 48 : 20;
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d="M200,224H56a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h96l56,56V216A8,8,0,0,1,200,224Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="148 32 148 92 208 92" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="96" y1="132" x2="160" y2="132" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="96" y1="172" x2="160" y2="172" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function ClockCountdownIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <path d="M224,136c-4.07,49.28-45.67,88-96,88a96,96,0,0,1-96-96c0-50.33,38.72-91.93,88-96" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="128 76 128 128 180 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <circle cx="208" cy="80" r="16" fill="currentColor" />
      <circle cx="176" cy="48" r="16" fill="currentColor" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="216" y1="128" x2="40" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="112 56 40 128 112 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function ArrowCounterClockwiseIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="24 56 24 104 72 104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M67.59,192A88,88,0,1,0,65.77,65.77L24,104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function ArrowClockwiseIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="184 104 232 104 232 56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M188.4,192a88,88,0,1,1,1.83-126.23L232,104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function EnvelopeSimpleIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path d="M32,56H224a0,0,0,0,1,0,0V192a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V56A0,0,0,0,1,32,56Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <polyline points="224 56 128 144 32 56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// feedback-box.tsx trigger. Phosphor "chat-circle-dots" bold.
export function ChatIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <circle cx="104" cy="128" r="16" fill="currentColor" />
      <circle cx="152" cy="128" r="16" fill="currentColor" />
      <path
        d="M79.93,211.11a96,96,0,1,0-35-35h0L32.42,213.46a8,8,0,0,0,10.12,10.12l37.39-12.47Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={BOLD}
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="216" y1="60" x2="40" y2="60" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="104" y1="104" x2="104" y2="168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <line x1="152" y1="104" x2="152" y2="168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M200,60V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V60" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M168,60V36a16,16,0,0,0-16-16H104A16,16,0,0,0,88,36V60" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

// `filled` marks the Saved state (feel.md icons: outline is the default, fill
// marks active/selected) — not a second stroke weight.
export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width="20"
      height="20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={BOLD}
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M192,224l-64-40L64,224V48a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8Z" />
    </svg>
  );
}

export function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="48" y1="40" x2="208" y2="216" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M74,68.6C33.23,89.24,16,128,16,128s32,72,112,72a118.05,118.05,0,0,0,54-12.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <path d="M214.41,163.59C232.12,145.73,240,128,240,128S208,56,128,56c-3.76,0-7.42.16-11,.46" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
      <circle cx="128" cy="128" r="32" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={BOLD} />
    </svg>
  );
}
