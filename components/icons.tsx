// Inline Phosphor icons (MIT). L8 (2026-09-02) moved the action icons to the
// THIN set (strokeWidth 8, C:\My_WorkSpace\design\icons\phosphor\SVGs\thin);
// the remaining "light"-weight ones were copied from
// C:\My_WorkSpace\design\icons\phosphor\SVGs\light\*.svg (04-uiux-brief.md
// §3: no icon package dependency). Recipe: stroke currentColor, 20px,
// aria-hidden, strokeWidth 12, viewBox 256 — matches the pair that used to
// be inlined directly in theme-toggle.tsx. Icons rendered at 16px use
// strokeWidth 16 (the "regular below 16px" rule, doc 4 §3, approximated
// from the same light path data).

export function SunIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="128" y1="40" x2="128" y2="16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <circle cx="128" cy="128" r="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="64" y1="64" x2="48" y2="48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="64" y1="192" x2="48" y2="208" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="192" y1="64" x2="208" y2="48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="192" y1="192" x2="208" y2="208" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="40" y1="128" x2="16" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="128" y1="216" x2="128" y2="240" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="216" y1="128" x2="240" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
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
        strokeWidth="12"
      />
    </svg>
  );
}

// L8 audit item 3: "external link" — Phosphor THIN (design/icons/phosphor/
// SVGs/thin/arrow-square-out-thin.svg), 20px in rows.
export function ArrowSquareOutIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="136" y1="120" x2="216" y2="40" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <polyline points="216 104 215.99 40.01 152 40" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M184,136v72a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8h72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="40 144 96 200 224 72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

// L8 audit item 3 ("close"): evaluated for the Phosphor THIN treatment and
// kept at the existing light weight instead — every live caller (role-row.tsx
// "Not yet", search-input.tsx's clear button) sits directly beside a
// non-enumerated icon at this same 16px/light weight (CheckIcon,
// MagnifyingGlassIcon), and a thin 8-unit stroke at 16px renders as a
// sub-pixel (~0.5px) line — fainter, not more legible. feel.md: one stroke
// weight per icon set per surface; matching weight to its neighbors won here
// over the brief's general 20px/thin default for this specific icon.
export function XIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <line x1="200" y1="56" x2="56" y2="200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <line x1="200" y1="200" x2="56" y2="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

export function CaretDownIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="208 96 128 176 48 96" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

// L8 audit item 3: "filter" — Phosphor THIN (SVGs/thin/funnel-thin.svg),
// 20px in rows. (Previously three abstracted lines, not the real Phosphor
// glyph — get-started.tsx's checklist is the one remaining caller.)
export function FunnelSimpleIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d="M34.1,61.38A8,8,0,0,1,40,48H216a8,8,0,0,1,5.92,13.38L152,136v58.65a8,8,0,0,1-3.56,6.66l-32,21.33A8,8,0,0,1,104,216V136Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
    </svg>
  );
}

// L8 audit item 3: "sort" — Phosphor THIN (SVGs/thin/sort-ascending-thin.svg),
// 20px in rows. sort-control.tsx previously (mis)used the funnel/filter icon
// above for "Sort roles" — funnel reads as filter everywhere else in the app
// (Jakob's Law: an icon should mean the same thing every time it appears).
export function SortIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="48" y1="128" x2="120" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <line x1="48" y1="64" x2="184" y2="64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <line x1="48" y1="192" x2="104" y2="192" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <polyline points="144 168 184 208 224 168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <line x1="184" y1="208" x2="184" y2="112" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}

export function BookmarkThinIcon() {
  return (
    <svg
      viewBox="0 0 256 256"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M184,32H72A16,16,0,0,0,56,48V224l72-40,72,40V48A16,16,0,0,0,184,32Z" />
    </svg>
  );
}

export function MagnifyingGlassIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <circle cx="112" cy="112" r="80" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <line x1="168.57" y1="168.57" x2="224" y2="224" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <rect x="40" y="88" width="176" height="128" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <path d="M88,88V56a40,40,0,0,1,80,0V88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
    </svg>
  );
}

// --- Slice 7 (Applications 50/50) ------------------------------------------

export function NotePencilIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <polygon points="128 160 96 160 96 128 192 32 224 64 128 160" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="168" y1="56" x2="200" y2="88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <path d="M216,128v80a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8h80" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
    </svg>
  );
}

export function CalendarCheckIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <rect x="40" y="40" width="176" height="176" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="176" y1="24" x2="176" y2="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="80" y1="24" x2="80" y2="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <line x1="40" y1="88" x2="216" y2="88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <polyline points="92 152 116 176 164 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
    </svg>
  );
}

// size 20 = light weight (default); the 48px thin variant is the RB-024
// empty-state moment (doc 4 §3: thin for large empty-state moments).
export function FileTextIcon({ thin = false }: { thin?: boolean }) {
  const size = thin ? 48 : 20;
  const stroke = thin ? "8" : "12";
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d="M200,224H56a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h96l56,56V216A8,8,0,0,1,200,224Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke} />
      <polyline points="152 32 152 88 208 88" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke} />
      <line x1="96" y1="136" x2="160" y2="136" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke} />
      <line x1="96" y1="168" x2="160" y2="168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke} />
    </svg>
  );
}

export function ClockCountdownIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <path d="M224,136c-4.07,49.28-45.67,88-96,88a96,96,0,0,1-96-96c0-50.33,38.72-91.93,88-96" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <polyline points="128 72 128 128 184 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <circle cx="160" cy="36" r="12" fill="currentColor" />
      <circle cx="196" cy="60" r="12" fill="currentColor" />
      <circle cx="220" cy="96" r="12" fill="currentColor" />
    </svg>
  );
}

// L8 audit item 3: "back" — Phosphor THIN, 20px in rows/panes.
export function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="216" y1="128" x2="40" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <polyline points="112 56 40 128 112 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}

export function ArrowCounterClockwiseIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="24 56 24 104 72 104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <path d="M67.59,192A88,88,0,1,0,65.77,65.77L24,104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

export function ArrowClockwiseIcon() {
  return (
    <svg viewBox="0 0 256 256" width="16" height="16" aria-hidden="true" className="shrink-0">
      <polyline points="184 104 232 104 232 56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      <path d="M188.4,192a88,88,0,1,1,1.83-126.23L232,104" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
    </svg>
  );
}

export function EnvelopeSimpleIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path d="M32,56H224a0,0,0,0,1,0,0V192a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V56A0,0,0,0,1,32,56Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
      <polyline points="224 56 128 144 32 56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" />
    </svg>
  );
}

// D10: feedback-box.tsx trigger. Phosphor "chat-circle-dots" light,
// following the FileTextIcon/ClockCountdownIcon recipe (outline path +
// small filled currentColor dots for the sparkle/detail marks).
export function ChatIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="12"
      />
      <circle cx="92" cy="128" r="10" fill="currentColor" />
      <circle cx="128" cy="128" r="10" fill="currentColor" />
      <circle cx="164" cy="128" r="10" fill="currentColor" />
    </svg>
  );
}

// L8 audit item 3: "delete" — Phosphor THIN, 20px in rows/panes.
export function TrashIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="216" y1="56" x2="40" y2="56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <line x1="104" y1="104" x2="104" y2="168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <line x1="152" y1="104" x2="152" y2="168" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}

// L8 audit item 3: "bookmark" — Phosphor THIN, 20px in rows. Moved in from
// components/role-row.tsx (previously a hand-drawn 16x16 path, unrelated to
// the Phosphor set); `filled` marks the Saved state (feel.md icons: outline
// is the default, fill marks active/selected).
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
      strokeWidth="8"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M192,224l-64-40L64,224V48a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8Z" />
    </svg>
  );
}

// L8 audit item 3: "hide" — Phosphor THIN, 20px in rows. Moved in from
// components/role-row.tsx (same hand-drawn-16x16 situation as Bookmark
// above); EyeIcon is its Unhide counterpart, kept the same weight (feel.md:
// one stroke weight per icon set per surface).
export function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <line x1="48" y1="40" x2="208" y2="216" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M154.91,157.6a40,40,0,0,1-53.82-59.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M135.53,88.71a40,40,0,0,1,32.3,35.53" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M208.61,169.1C230.41,149.58,240,128,240,128S208,56,128,56a126,126,0,0,0-20.68,1.68" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <path d="M74,68.6C33.23,89.24,16,128,16,128s32,72,112,72a118.05,118.05,0,0,0,54-12.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 256 256" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
      <circle cx="128" cy="128" r="40" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
    </svg>
  );
}
