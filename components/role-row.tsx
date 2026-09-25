"use client";

// RoleRow (v5, D26/D27/D28/D31): one clickable line — avatar, company, title —
// that SELECTS the role into the detail pane, with the "added" chip and the
// Apply / Save / Hide / Remove controls beside it. The fit score is gone (D23).
// States: normal / selected / confirming / leaving / error.
// The confirm state renders from user_roles.apply_clicked_at (RB-013: no expiry,
// survives reload) with a local optimistic override so the flip is instant.
import { decodeEntities } from "@/lib/decode-entities";
import { memo, useRef, useState, useTransition } from "react";
import { armApplyIntentAction, applyNotYetAction } from "@/app/actions";
import { applyControlState, type ApplyControl } from "@/lib/apply-intent";
import { relativeDay } from "@/lib/sort";
import type { RoleLifecycle } from "@/lib/types";
import { SEASON_LABEL, type Season } from "@/lib/season";
import type { Family } from "@/lib/family";
import type { CorrectionField, SharedLabels } from "@/lib/corrections";
import { VISA_LABELS } from "@/components/correction-control";
import { CompanyAvatar } from "@/components/company-avatar";
import { LabelsBar, type LabelCounts } from "@/components/labels-bar";
import { Rise } from "@/components/motion/rise";
import {
  ArrowSquareOutIcon,
  BookmarkIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

// The row every component on Home reads. Deliberately NOT `Role & …`:
// jd_snapshot must never reach the page payload (A15) and half of Role is dead
// weight on Home, so this lists exactly what the client reads.
// NOTE: this is NOT what the server serializes — see HomeRowLite below.
export type HomeRow = {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  lifecycle: RoleLifecycle;
  created_at: string;
  posted_at: string | null;
  deadline: string | null;
  location: string | null;
  saved_at: string | null;
  hidden_at: string | null;
  visa_class: string | null;
  eligibility_note: string | null;
  // The SANITIZED posting URL (server-side safeHttpUrl). The raw `link` column
  // never ships: nothing on Home reads it, and sanitizing on the server keeps
  // the trust boundary off the client (A15).
  href: string | null;
  source: string | null;
  season: Season;
  family: Family;
  // Task 2 / D2-D4 (fold 2026-09-15): every family the title (or a
  // stored classification) matches; app/(app)/page.tsx is the only producer
  // and always sets it (families ?? familySignals(title)).
  families: Family[];
  // VTHacks speed pass (2026-09-20): dream-tier tags (lib/company-tier.ts),
  // derived from the company name + stored companies.tier — "Big 4" etc. as a
  // Home filter facet (Karthik: "I want to see big 4 as a filter").
  tierTags: string[];
  apply_clicked_at: string | null;
  company_tier: string | null;
  company_url: string | null;
  company_visa_note: string | null;
  // Task 3 T2/T3: derived at read time (lib/liveness.ts) / carried
  // from the row's ingest columns. No JSX reads these yet — L5 renders the
  // chips.
  liveness: string;
  repost_count: number;
  canonical_key: string | null;
  // Task 3 T5: which fields the CALLER has personally corrected on
  // this row (lib/corrections.ts overlayCorrections). No JSX reads this yet —
  // L5 renders the correction control.
  corrected: CorrectionField[];
  // Task 3 L5 fold 2: the row's five values BEFORE this caller's corrections,
  // set by overlayCorrections the first time any field on this row is
  // corrected; null when nothing on this row is corrected. Lets "Shared
  // label" (onUncorrectRow) restore the true shared value immediately,
  // instead of the last pre-overlaid server read.
  shared: SharedLabels | null;
  // L2c (Match agent, 2026-09-19): every field below is OPTIONAL so every
  // existing HomeRow literal (journey/page.tsx's compact feed rows, built
  // before this lane) keeps compiling with none of them set -- undefined
  // reads identically to "not scored yet" everywhere these are rendered.
  // match_scores.score for this caller, or null/undefined when unscored.
  matchScore?: number | null;
  // The printed fit reasons from the score row (lib/agents/match.ts scorePosting).
  matchReasons?: readonly string[] | null;
  // This POSTING's own archetype name (role_archetypes/archetypes), never the
  // student's target archetype (match_scores.target_archetype is the same
  // value on every row and is not what the chip shows).
  archetypeName?: string | null;
  // Top-40-only (match_scores.requirements_checked): met vs unknown, and
  // whether they were checked at all for this posting this run.
  requirementsMet?: readonly string[] | null;
  requirementsUnknown?: readonly string[] | null;
  requirementsChecked?: boolean;
  beforeYouApply?: ReadonlyArray<BeforeYouApplyNode> | null;
  // role_tasks label counts (lib/exposure.ts summarizeLabels), null when this
  // posting has no role_tasks rows at all (components/labels-bar.tsx "unmapped").
  taskLabelCounts?: LabelCounts;
};

export type BeforeYouApplyNode = { id: string; title: string; why: string };

// What the server ACTUALLY serializes into the HTML (A15). The four company
// columns are stripped here and rebuilt in HomeList from a companies map sent
// once — see lib/sort.ts hydrateHomeRows for the numbers.
export type HomeRowLite = Omit<
  HomeRow,
  "company_name" | "company_tier" | "company_url" | "company_visa_note"
>;

export const EXIT_MS = 240; // doc 4 §4: row exit ~240ms, exit easing

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The absolute stamp behind every relative label (D28: both shown, never
// conflated). Formatted in ONE fixed locale + zone, never the runtime's own:
// this string is rendered on the server (UTC) and re-rendered on the client
// (ET), and anything zone-dependent is a hydration mismatch. Same
// America/New_York call lib/sort.ts relativeDay and lib/mcp-helpers.ts make.
const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// A font-label relative date ("added today" / "added 2 days ago") must not
// render its digits in the label face (D1 + tests/app-numerals.test.ts) —
// split the FIRST run of digits (wherever it falls in the string) into a
// font-sans tabular-nums span.
function relativeDayLabel(text: string): React.ReactNode {
  const match = /(\d+)/.exec(text);
  if (!match) return text;
  const start = match.index;
  const digits = match[1];
  return (
    <>
      {text.slice(0, start)}
      <span className="font-sans tabular-nums">{digits}</span>
      {text.slice(start + digits.length)}
    </>
  );
}

// VTHacks speed pass (2026-09-20): the row's liveness chip ("seen today")
// sits right next to the "added" chip, so a bare "today"/"2d ago" read as a
// doubled "seen today today". Local to role-row.tsx's own "added" chip only —
// lib/sort.ts's relativeDay() stays untouched (role-detail-pane.tsx calls it
// directly, in its own non-chip sentence).
function addedLabel(relative: string): string {
  if (relative === "Today") return "added today";
  if (relative === "Yesterday") return "added 1 day ago";
  const days = /^(\d+)d ago$/.exec(relative);
  if (days) return `added ${days[1]} days ago`;
  const weeks = /^(\d+)w ago$/.exec(relative);
  if (weeks) return `added ${Number(weeks[1]) * 7} days ago`;
  return relative; // "Not recorded" (unparseable date) — left as-is
}

export function absoluteDateTime(iso: string | null): string {
  if (!iso) return "Not given by the ATS";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not listed";
  return STAMP.format(d);
}

export const actionButton =
  "inline-flex min-h-11 items-center gap-1 px-2 font-label text-[11px] tracking-label uppercase text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// D10 (Lane handoffs 2026-09-20): the "lg pill h48" token -- the ONE filled
// Apply pill, maroon fill, same shape/height as role-detail-pane.tsx's Apply
// (both restyled together so the same control is never two sizes/colors in
// two places).
export const applyPillCls =
  "inline-flex h-12 items-center gap-1.5 rounded-pill bg-sage px-5 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// L8 audit item 2: background tint (not just opacity/color) on hover, plus a
// visible focus-visible ring — matches the row's own hover:bg-raised below.
// D10: circular (rounded-pill) to match the mock's round icon buttons.
const iconButtonBase =
  "min-h-11 min-w-11 items-center justify-center rounded-pill text-text-dim hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

export type ApplyMode = "armed" | "already";

// The ONE apply flow, shared by the row and the detail pane (D26: the pane's
// Apply runs the SAME arm → "Applied? ✓ / Not yet" confirm, and its "Already
// applied" opens that same confirm without arming a link click).
export function useApplyFlow(
  row: HomeRow,
  onConfirmApplied: (id: string, mode: ApplyMode) => void,
) {
  const serverState = applyControlState(row);
  const [override, setOverride] = useState<ApplyControl | null>(null);
  // Reset-during-render: once the server catches up with the optimistic flip,
  // drop the override so the server row is the single source again.
  const [seenServerState, setSeenServerState] = useState(serverState);
  if (serverState !== seenServerState) {
    setSeenServerState(serverState);
    if (override === serverState) setOverride(null);
  }
  const state: ApplyControl = override ?? serverState;

  const [mode, setMode] = useState<ApplyMode>("armed");
  const [leaving, setLeaving] = useState(false);
  const [localError, setLocalError] = useState<{ kind: "arm" | "not_yet"; message: string } | null>(null);
  const [, startTransition] = useTransition();
  const exitTimer = useRef<number | null>(null);

  function arm() {
    // Flip locally first — the posting tab is already opening (RB-010).
    setMode("armed");
    setOverride("confirming");
    setLocalError(null);
    startTransition(async () => {
      const res = await armApplyIntentAction(row.id).catch(() => ({ ok: false as const, error: "network error" }));
      if (!res.ok) {
        setLocalError({
          kind: "arm",
          message: "Couldn't save the click, so this confirmation may not survive a reload.",
        });
      }
    });
  }

  // "Already applied": the same confirm UI, no link click, so nothing to arm.
  function openConfirm() {
    setMode("already");
    setOverride("confirming");
    setLocalError(null);
  }

  function confirmApplied() {
    if (leaving) return; // double-click guard
    setLocalError(null);
    setLeaving(true);
    const fire = () => onConfirmApplied(row.id, mode);
    if (prefersReducedMotion()) {
      fire(); // instant removal — the Applications badge tick is the confirmation
    } else {
      exitTimer.current = window.setTimeout(fire, EXIT_MS);
    }
  }

  function notYet() {
    // Silent return (RB-012) + server-side clear of apply_clicked_at (A7: a
    // declined role must never re-show a stale "Applied?" confirm). Nothing was
    // armed in "already" mode, so that path skips the server round trip.
    const wasArmed = mode === "armed";
    setOverride("idle");
    setLocalError(null);
    if (!wasArmed) return;
    startTransition(async () => {
      const res = await applyNotYetAction(row.id).catch(() => ({ ok: false as const, error: "network error" }));
      if (!res.ok) {
        setOverride("confirming");
        setLocalError({ kind: "not_yet", message: "Couldn't clear the confirmation." });
      }
    });
  }

  function retryConfirm() {
    setLeaving(false);
    confirmApplied();
  }

  return {
    state,
    leaving,
    arm,
    openConfirm,
    confirmApplied,
    notYet,
    retryConfirm,
    localError,
    retryLocal: () => (localError?.kind === "arm" ? arm() : notYet()),
  };
}

// v7 S4 (app-functional): memoised. Home renders up to HOME_GROUP_CAP groups
// (144 rows measured live), and every save/hide/apply used to re-render all of
// them. HomeList now keeps the object identity of every row it did NOT touch
// and passes stable callbacks, so one action re-renders one row.
function RoleRowBase({
  row,
  showCompany,
  nowMs,
  selectMode,
  selected,
  active,
  morphing,
  saveExits,
  onSelect,
  onToggleSelect,
  onConfirmApplied,
  onSave,
  onHide,
  onRequestDelete,
  confirmError,
  riseIndex,
}: {
  row: HomeRow;
  showCompany: boolean;
  nowMs: number;
  selectMode: boolean;
  selected: boolean;
  active: boolean;
  // True while this row is the shared-element source of a row→pane morph (D32).
  morphing: boolean;
  saveExits: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onConfirmApplied: (id: string, mode: ApplyMode) => void;
  onSave: (id: string, saved: boolean) => void;
  onHide: (id: string, hidden: boolean) => void;
  onRequestDelete: (ids: string[], label: string) => void;
  // Set by HomeList when confirmAppliedAction failed after the optimistic
  // exit — the row is back (RB error scenario: no phantom applied state).
  confirmError: string | null;
  // SYSTEM.md Motion grammar: feed rows Rise in with a 0.04-0.06s stagger.
  // Position among the rendered rows; undefined = no entrance (the row's own
  // exit animation and the row→pane morph are unaffected either way).
  riseIndex?: number;
}) {
  const flow = useApplyFlow(row, onConfirmApplied);
  const [exiting, setExiting] = useState(false);
  const leaving = flow.leaving || exiting;
  const isSaved = row.saved_at !== null;
  const isHidden = row.hidden_at !== null;
  const rowLabel = `${row.company_name} ${row.title}`;

  // Save/Hide reuse the row-exit animation, but only when the row actually
  // leaves the CURRENT view. Save exits only inside the Saved chip; hide/unhide
  // ALWAYS drops the row out of the chip it is being viewed under, so it has no
  // "stays put" case to guard.
  function runOrExit(exits: boolean, fire: () => void) {
    if (!exits || prefersReducedMotion()) {
      fire();
      return;
    }
    setExiting(true);
    window.setTimeout(fire, EXIT_MS);
  }

  return (
    <li
      className="group border-b border-hairline"
      style={{
        display: "grid",
        gridTemplateRows: leaving ? "0fr" : "1fr",
        opacity: leaving ? 0 : 1,
        transition: `grid-template-rows ${EXIT_MS}ms cubic-bezier(0.4,0,1,1), opacity ${EXIT_MS}ms cubic-bezier(0.4,0,1,1)`,
      }}
    >
      {/* Rise sits on the row BODY, not the <li>: the li owns the exit
          animation (grid-template-rows 0fr) and the row→pane morph, and
          stacking an entrance transform on the same element fought both. */}
      <Rise as="div" index={riseIndex ?? 0} className="overflow-hidden">
        <div
          // D10 (Lane handoffs 2026-09-20): rows now sit inside a bg-raised
          // list card (home-list.tsx), so active/hover use bg-bg for contrast
          // instead of the (now identical) bg-raised.
          className={`flex flex-wrap items-center gap-x-2 border-l-2 pr-2 ${
            active ? "border-sage bg-bg" : "border-transparent hover:bg-bg"
          }`}
          style={morphing ? { viewTransitionName: "role-card" } : undefined}
        >
          {selectMode ? (
            <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
              <input
                type="checkbox"
                aria-label={`Select ${rowLabel}`}
                checked={selected}
                onChange={() => onToggleSelect(row.id)}
                className="h-4 w-4 accent-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              />
            </label>
          ) : null}

          {/* The row itself is the selector (D26). Buttons/links live outside
              it so they stay independently reachable by keyboard. */}
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            aria-current={active ? "true" : undefined}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-3 pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage md:min-w-[16rem]"
          >
            {showCompany ? <CompanyAvatar name={row.company_name} url={row.company_url} size={28} /> : null}
            {showCompany ? <span className="max-w-[9rem] shrink-0 truncate text-[13px] text-text-dim">{row.company_name}</span> : null}
            <span title={decodeEntities(row.title)} className="min-w-0 line-clamp-2 text-[15px] font-medium text-text">
              {decodeEntities(row.title)}
            </span>
            {/* D10/mock: a status chip beside the title -- the row's real
                liveness label (information, not alarm: text-dim, never red,
                D28: posted/added/liveness are never conflated), never a
                fabricated Live/Stale binary this data doesn't support. */}
            <span className="inline-flex h-[26px] shrink-0 items-center rounded-pill border border-hairline px-2.5 font-label text-[11px] tracking-label uppercase text-text-dim">
              {row.liveness}
            </span>
            {row.repost_count > 0 ? (
              // House chip precedent (components/stale-badge.tsx): hairline
              // border, font-label, text-dim, digits split into a
              // font-sans tabular-nums span (Departure Mono digits misread).
              <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-pill border border-hairline px-2.5 font-label text-[11px] tracking-label uppercase text-text-dim">
                reposted <span className="font-sans tabular-nums">{row.repost_count}</span>x
              </span>
            ) : null}
          </button>

          <span
            className={`flex items-center gap-1 ${
              flow.state === "idle"
                ? "shrink-0"
                : "basis-full flex-wrap justify-end gap-y-1 pb-1.5 md:basis-auto md:ml-auto md:pb-0"
            }`}
          >
            {flow.state === "idle" ? (
              <>
                {row.href ? (
                  <a href={row.href} target="_blank" rel="noreferrer" onClick={flow.arm} className={applyPillCls}>
                    Apply <ArrowSquareOutIcon />
                  </a>
                ) : (
                  // No safe posting link — arm the confirmation anyway; he
                  // finds the posting himself but the record still happens.
                  <button type="button" onClick={flow.arm} className={applyPillCls}>
                    Apply
                  </button>
                )}
                {/* v6 L3 D/I: Save / Hide / Delete rest at opacity-60, not 0 —
                    invisible controls made APPLY float short of the row's right
                    edge and nobody could find them on a first pass. Below md,
                    Delete hides outright and Save/Hide hide only when idle (a
                    saved/hidden row still shows its state glyph) so the title
                    gets the width back. */}
                <button
                  type="button"
                  onClick={() => runOrExit(saveExits, () => onSave(row.id, !isSaved))}
                  aria-pressed={isSaved}
                  aria-label={`${isSaved ? "Unsave" : "Save"} ${rowLabel}`}
                  title={isSaved ? "Saved, click to unsave" : "Save for later"}
                  className={`${iconButtonBase} ${isSaved ? "flex" : "hidden md:flex"} ${
                    isSaved
                      ? "text-sage"
                      : "opacity-60 hover:text-text focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  <BookmarkIcon filled={isSaved} />
                </button>
                <button
                  type="button"
                  onClick={() => runOrExit(true, () => onHide(row.id, !isHidden))}
                  aria-pressed={isHidden}
                  aria-label={`${isHidden ? "Unhide" : "Hide"} ${rowLabel}`}
                  title={isHidden ? "Unhide" : "Hide from the list"}
                  className={`${iconButtonBase} ${isHidden ? "flex" : "hidden md:flex"} ${
                    isHidden
                      ? "text-text"
                      : "opacity-60 hover:text-text focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                  }`}
                >
                  {isHidden ? <EyeIcon /> : <EyeSlashIcon />}
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete([row.id], rowLabel)}
                  aria-label={`Remove ${rowLabel}`}
                  className={`${iconButtonBase} hidden md:flex opacity-60 hover:text-danger focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100`}
                >
                  <TrashIcon />
                </button>
              </>
            ) : (
              <ApplyConfirm flow={flow} />
            )}
          </span>
        </div>

        {/* D10/mock: the meta line -- season, location, when it was added.
            Company name is not repeated here: showCompany already put it in
            the row above, and CompanyGroup's own header names it otherwise. */}
        <p className="flex flex-wrap items-center gap-x-1.5 pb-3 pl-4 text-[13px] text-text-dim">
          <span>{SEASON_LABEL[row.season]}</span>
          {row.location ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{row.location}</span>
            </>
          ) : null}
          <span aria-hidden="true">&middot;</span>
          <span title={`Added ${absoluteDateTime(row.created_at)}`}>
            {relativeDayLabel(addedLabel(relativeDay(row.created_at, nowMs)))}
          </span>
        </p>

        {row.visa_class ? (
          // FR-007: the plain-words flag, never hiding the row or
          // disabling Apply (K2) — this paragraph is purely informational,
          // text-dim, and sits below the row's main line.
          <p className="pb-3 pl-4 text-[13px] text-text-dim">
            {row.eligibility_note ??
              `${VISA_LABELS[row.visa_class] ?? row.visa_class}${row.corrected.includes("visa_class") ? " (your correction)" : ""}`}
          </p>
        ) : null}

        {/* L2c: only a scored row gets a match line -- an unscored row (no
            profile yet, or ranked before the agent ran) shows nothing here. */}
        {row.matchScore != null ? (
          <div className="flex flex-wrap items-center gap-2 pb-3 pl-4">
            {row.archetypeName ? (
              // D10: the same chip h26 recipe as the title's status chips.
              <span className="inline-flex h-[26px] items-center rounded-pill border border-hairline px-2.5 font-label text-[10px] uppercase tracking-label text-text-dim">
                {row.archetypeName}
              </span>
            ) : null}
            <LabelsBar counts={row.taskLabelCounts ?? null} />
          </div>
        ) : null}

        {flow.localError ? (
          <p role="alert" className="pb-3 pl-4 text-[13px] text-danger">
            {flow.localError.message}{" "}
            <button
              type="button"
              onClick={flow.retryLocal}
              className="min-h-11 font-label text-[11px] tracking-label uppercase text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Retry
            </button>
          </p>
        ) : null}
        {confirmError && !leaving ? (
          <p role="alert" className="pb-3 pl-4 text-[13px] text-danger">
            {confirmError}{" "}
            <button
              type="button"
              onClick={flow.retryConfirm}
              className="min-h-11 font-label text-[11px] tracking-label uppercase text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Retry
            </button>
          </p>
        ) : null}
      </Rise>
    </li>
  );
}

export const RoleRow = memo(RoleRowBase);

// The "Applied? ✓ / Not yet" cluster — rendered by the row AND by the detail
// pane so there is exactly one confirm UI.
export function ApplyConfirm({ flow }: { flow: ReturnType<typeof useApplyFlow> }) {
  return (
    <>
      <span className="font-label text-[11px] tracking-label uppercase text-text">Applied?</span>
      <button type="button" onClick={flow.confirmApplied} disabled={flow.leaving} className={actionButton}>
        <CheckIcon /> Applied
      </button>
      <button
        type="button"
        onClick={flow.notYet}
        disabled={flow.leaving}
        className="inline-flex min-h-11 items-center gap-1 px-2 font-label text-[11px] tracking-label uppercase text-text-dim hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <XIcon /> Not yet
      </button>
    </>
  );
}
