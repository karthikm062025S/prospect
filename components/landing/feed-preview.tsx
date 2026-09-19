"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BrandMark } from "@/components/landing/brand-marks";
import { GoogleCta, SIGN_IN_EVENT, SIGN_IN_REASON } from "@/components/landing/google-cta";
import { ArrowSquareOutIcon } from "@/components/icons";
import { SEASON_LABEL } from "@/lib/season";
import { formatStat } from "@/lib/public-stats-format";
import { Rise } from "@/components/landing/rise";
import { capPerCompany, type FeedRow } from "@/lib/public-feed-format";

// v9 "ticker" (Karthik 2026-09-05): the live feed is one screen. The six
// newest postings as rows, Save + Open on each, one link into the app for the
// rest. Season chips, role chips, the Just-dropped tiles, the per-company cap
// and Show-more are gone from the landing; the app has all of them.
//
// Rows are the SAME primitives the app uses (CompanyAvatar, the hairline row)
// so the landing and the product read as one thing. Sign-in is asked at the
// point of saving, never before.

const ROWS = 6;
/** Below sm the Save/Open controls wrap under each row, so four rows is one phone screen. */
const ROWS_PHONE = 4;
/** One batch (Solidigm posting five at once) must not be the whole ticker. */
const ROWS_PER_COMPANY = 2;
/** feel.md caps a stagger at 30-80ms. */
const STAGGER = 0.04;

const FEED_PILL =
  "inline-flex min-h-11 items-center rounded-pill border border-hairline px-4 text-step-xs font-medium text-text hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export function FeedPreview({
  rows,
  total,
  signedIn = false,
}: {
  rows: FeedRow[];
  total: number | null;
  signedIn?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-8 max-w-[46ch] text-text-dim">
        Nothing in the last few hours. The feed refreshes every 30 minutes.
      </p>
    );
  }

  const shown = capPerCompany(rows, ROWS_PER_COMPANY).rows.slice(0, ROWS);

  return (
    <div className="mt-6">
      <p className="text-step-xs tabular-nums text-text-dim">
        The newest{total === null ? "" : ` of ${formatStat(total)} open postings`}.
      </p>
      <ul className="mt-4 border-t border-hairline">
        {shown.map((row, index) => (
          <Row
            key={row.id}
            row={row}
            delay={index * STAGGER}
            className={index >= ROWS_PHONE ? "hidden sm:flex" : ""}
          />
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {signedIn ? null : (
          <p className="max-w-[46ch] text-pretty text-step-xs text-text-dim">{SIGN_IN_REASON}</p>
        )}
        {signedIn ? (
          <Link href="/" className={FEED_PILL}>
            {total === null ? "See the whole feed" : `See all ${formatStat(total)}`}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(SIGN_IN_EVENT))}
            className={FEED_PILL}
          >
            {total === null ? "Sign in to see the whole feed" : `Sign in to see all ${formatStat(total)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ row, delay, className = "" }: { row: FeedRow; delay: number; className?: string }) {
  const label = `${row.title} at ${row.company}`;
  return (
    // Below md the text block takes the whole row and the two controls wrap
    // under it, right-aligned: at 390 the controls cost ~115px of a 327px
    // content width, which truncated every title to about twenty characters.
    // `relative` is the sign-in prompt's anchor (see SaveWithSignIn): anchoring
    // it to the Save button instead put its left edge 1px off-screen at 390,
    // because the button sits ~300px in. The row spans the full content width,
    // so a right-aligned panel capped at the viewport minus both gutters always
    // lands inside them.
    // v8 D14: one entrance family for the whole landing, staggered per row.
    // Rise renders a plain <li> with no observer under prefers-reduced-motion
    // (components/motion/in-view.tsx short-circuits on `settled`).
    <Rise
      as="li"
      delay={delay}
      className={`relative flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline py-2 ${className}`.trim()}
    >
      <div className="flex w-full min-w-0 items-center gap-3 md:w-auto md:flex-1">
        {/* A real licensed brand mark or nothing at all: no invented glyph, and no
            initials disc pretending to be one. The 16px box is reserved either
            way so every row's text starts on the same line (ui_laws 16). */}
        <span className="flex size-4 shrink-0 items-center justify-center text-text-dim">
          <BrandMark name={row.company} size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-step-0 font-medium leading-title text-text">{row.title}</p>
          {/* Most ATS titles never name a term, so "Unspecified" would be the
              word on two rows out of three. It stays a filter (the chip counts
              it) but it is not information worth a line of the row. */}
          {/* D25: this line ends in "added 3 h ago", so it cannot sit in the
              dotted-zero face. */}
          <p className="truncate font-sans text-step-xs tabular-nums text-text-dim">
            {row.company}
            {row.season === "unspecified" ? "" : ` · ${SEASON_LABEL[row.season]}`}
            {row.location ? ` · ${row.location}` : ""} · added {row.added}
          </p>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SaveWithSignIn label={label} />
        {row.href ? (
          <a
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${label} on the employer's site. Opens in a new tab.`}
            className="inline-flex size-11 items-center justify-center rounded-pill text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <ArrowSquareOutIcon />
          </a>
        ) : null}
      </div>
    </Rise>
  );
}

// v7 S4 LANDING-FLOW, persona blocker 1. Save used to be a bare
// `<form action={signInWithGoogleAction}>`: one click and the whole tab left
// the landing for a Google chooser that says "continue to
// <a database host>", with no explanation anywhere. That is the
// single biggest drop-off on the page.
//
// Now the click opens a small non-modal prompt anchored to the row that says
// WHY first (the same SIGN_IN_REASON sentence the hero and the closing CTA
// carry, D19/D27), with the Google button inside it. Nothing navigates until
// the visitor presses that button.
//
// Not a modal on purpose (viral doc rule 1: explain at the moment of the ask,
// do not interrupt): the feed stays readable behind it and Escape or a click
// anywhere else puts the visitor back where they were.
function SaveWithSignIn({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const id = useId();
  const panelId = `${id}-signin`;
  const titleId = `${id}-signin-title`;

  // Focus the PANEL, not the Google button inside it: a keyboard or screen
  // reader user has to reach the reason before the control that acts on it.
  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    // No `relative` here on purpose: the panel below anchors to the ROW, which
    // is the element wide enough to keep it inside the page gutters at 390.
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Save ${label}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close(true);
          }
        }}
        className="inline-flex min-h-11 items-center rounded-pill border border-hairline px-3.5 text-step-xs font-medium text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Save
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal={false}
            aria-labelledby={titleId}
            tabIndex={-1}
            // Same entrance the app's own pill dropdown uses, including its
            // reduced-motion branch (components/pill-dropdown.tsx).
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close(true);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}
            className="absolute right-0 top-full z-30 mt-2 w-[19rem] max-w-[calc(100vw-3rem)] rounded-card border border-hairline bg-raised p-4 text-left shadow-lg focus:outline-none"
          >
            <p id={titleId} className="text-step-0 font-medium leading-title text-text">
              Sign in to save this one
            </p>
            <p className="mt-2 text-pretty text-step-xs leading-body text-text-dim">{SIGN_IN_REASON}</p>
            <div className="mt-4">
              <GoogleCta />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
