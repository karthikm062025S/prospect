"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useSyncExternalStore } from "react";
import {
  BookmarkThinIcon,
  ChatIcon,
  CheckIcon,
  FunnelSimpleIcon,
} from "@/components/icons";

export const GET_STARTED_DISMISSED_KEY = "scout_get_started_dismissed";
export const GET_STARTED_FEEDBACK_KEY = "scout_get_started_feedback_clicked";
export const GET_STARTED_ACTIVE_KEY = "scout_get_started_active";
export const GET_STARTED_PROGRESS_EVENT = "scout:get-started-progress";

// Same literal components/landing/feedback.tsx and components/feedback-box.tsx
// already dispatch/listen on (see feedback-box.tsx's comment): kept as an
// independent string here too, so this file never imports from feedback-box.tsx
// and creates a cycle (feedback-box.tsx already imports recordGetStartedFeedbackOpened
// from this file).
const FEEDBACK_OPEN_EVENT = "scout:feedback-open";

function openFeedbackDialog(): void {
  window.dispatchEvent(new Event(FEEDBACK_OPEN_EVENT));
}

export type GetStartedProgress = {
  filters: boolean;
  saved: boolean;
  feedback: boolean;
};

const EMPTY_PROGRESS: GetStartedProgress = {
  filters: false,
  saved: false,
  feedback: false,
};

const memoryFlags = new Set<string>();

// Every flag below is per-DEVICE state (localStorage), so on a SHARED browser
// one account's progress used to answer for the next one: A dismissing the
// checklist hid it from B, and A's "active" flag re-opened it for a B who was
// long past first run. The flags are therefore namespaced by the signed-in user
// id, which the server hands GetStarted as a prop (the app has no client-side
// Supabase session to read it from -- the cookie is httpOnly since SR-003).
//
// The id is threaded through every helper. The one exception is
// recordGetStartedFeedbackOpened, which components/feedback-box.tsx calls from
// the global feedback FAB with no user in hand; that reads the id GetStarted
// publishes here from an EFFECT (never during render), and the click that
// reaches it always happens long after mount.
let feedbackUserId = "";

function flagKey(key: string, userId: string): string {
  return userId ? `${key}:${userId}` : key;
}

function readFlag(key: string, userId: string): boolean {
  const scoped = flagKey(key, userId);
  if (memoryFlags.has(scoped)) return true;
  try {
    return localStorage.getItem(scoped) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, userId: string): void {
  const scoped = flagKey(key, userId);
  memoryFlags.add(scoped);
  try {
    localStorage.setItem(scoped, "1");
  } catch {
    // Persistence is best-effort; the current page still updates via the event.
  }
  window.dispatchEvent(new Event(GET_STARTED_PROGRESS_EVENT));
}

export function recordGetStartedFeedbackOpened(): void {
  writeFlag(GET_STARTED_FEEDBACK_KEY, feedbackUserId);
}

function subscribeProgress(onStoreChange: () => void) {
  // Prefix match: every key is namespaced by user id, and a write for ANOTHER
  // account in another tab is cheap to re-read (this user's snapshot is
  // unchanged, so React re-renders nothing).
  const watched = [GET_STARTED_DISMISSED_KEY, GET_STARTED_FEEDBACK_KEY, GET_STARTED_ACTIVE_KEY];
  const onStorage = (event: StorageEvent) => {
    const key = event.key;
    if (key && watched.some((base) => key === base || key.startsWith(`${base}:`))) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(GET_STARTED_PROGRESS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(GET_STARTED_PROGRESS_EVENT, onStoreChange);
  };
}

function ProgressItem({
  done,
  icon,
  onAction,
  children,
}: {
  done: boolean;
  icon: React.ReactNode;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <li className="flex min-h-8 items-center gap-2 text-[13px] text-text">
      <span className="text-text-dim [&_svg]:size-5 [&_svg]:[stroke-width:8]">{icon}</span>
      {done ? (
        <span className="min-w-0 flex-1 text-pretty text-text-dim line-through">{children}</span>
      ) : (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 min-w-0 flex-1 text-pretty py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
        >
          {children}
        </button>
      )}
      <span
        aria-label={done ? "Done" : "Not done"}
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
          done ? "border-text bg-text text-bg" : "border-hairline text-transparent"
        }`}
      >
        <AnimatePresence initial={false}>
          {done ? (
            <motion.span
              key="done"
              initial={reducedMotion ? false : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              exit={reducedMotion ? { opacity: 0 } : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
            >
              <CheckIcon />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </li>
  );
}

export function GetStarted({
  userId,
  eligible,
  filtersDone,
  savedDone,
  previewProgress,
  onFocusFilters,
  onPulseSaved,
}: {
  // The signed-in user id, purely as the localStorage namespace above. Empty
  // string in a preview/story render, which falls back to the unscoped keys.
  userId: string;
  eligible: boolean;
  filtersDone: boolean;
  savedDone: boolean;
  previewProgress?: GetStartedProgress;
  onFocusFilters?: () => void;
  onPulseSaved?: () => void;
}) {
  const dismissed = useSyncExternalStore(
    subscribeProgress,
    () => readFlag(GET_STARTED_DISMISSED_KEY, userId),
    () => false,
  );
  const activeOnThisDevice = useSyncExternalStore(
    subscribeProgress,
    () => readFlag(GET_STARTED_ACTIVE_KEY, userId),
    () => false,
  );
  const feedbackDone = useSyncExternalStore(
    subscribeProgress,
    () => readFlag(GET_STARTED_FEEDBACK_KEY, userId),
    () => false,
  );
  const titleId = useId();

  useEffect(() => {
    feedbackUserId = userId;
  }, [userId]);

  useEffect(() => {
    if (!eligible || readFlag(GET_STARTED_ACTIVE_KEY, userId)) return;
    queueMicrotask(() => writeFlag(GET_STARTED_ACTIVE_KEY, userId));
  }, [eligible, userId]);

  const reducedMotion = useReducedMotion();
  const visible = !!previewProgress || !(dismissed || (!eligible && !activeOnThisDevice));

  const progress = previewProgress ?? {
    ...EMPTY_PROGRESS,
    filters: filtersDone,
    saved: savedDone,
    feedback: feedbackDone,
  };
  const doneCount = Object.values(progress).filter(Boolean).length;
  const allDone = doneCount === 3;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        // `shrink-0` is load-bearing: the card is a flex item of the Roles
        // column, which on md+ is a definite-height scroller
        // (components/home-list.tsx). `overflow-hidden` -- required for the
        // height collapse -- removes a flex item's automatic minimum size, so
        // the column's long list crushed this card from its 294px content
        // height to a 32px sliver on FIRST PAINT (measured 2026-09-03,
        // 1440x900): the D27 checklist was sliced through its own title. Every
        // sibling in the column keeps overflow:visible, so none of them shrink.
        <motion.section
          key="get-started"
          aria-labelledby={titleId}
          initial={reducedMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="shrink-0 overflow-hidden rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-display text-lg text-text">
                Get started
              </h2>
              <p aria-live="polite" className="mt-0.5 font-sans text-[11px] uppercase tracking-[0.08em] tabular-nums text-text-dim">
                {doneCount} of 3 complete
              </p>
            </div>
            {!allDone ? (
              <button
                type="button"
                onClick={() => writeFlag(GET_STARTED_DISMISSED_KEY, userId)}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline px-3 font-label text-[11px] uppercase tracking-[0.08em] text-text-dim hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
              >
                Dismiss
              </button>
            ) : null}
          </div>

          <div
            role="progressbar"
            aria-label="Get started progress"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={doneCount}
            className="mt-3 h-1 overflow-hidden rounded-full bg-bg"
          >
            <div
              className="h-full rounded-full bg-sage transition-[width] duration-300"
              style={{ width: `${Math.round((doneCount * 100) / 3)}%` }}
            />
          </div>

          <ul className="mt-3 grid gap-1">
            <ProgressItem done={progress.filters} icon={<FunnelSimpleIcon />} onAction={onFocusFilters}>
              See only your term and role
            </ProgressItem>
            <ProgressItem done={progress.saved} icon={<BookmarkThinIcon />} onAction={onPulseSaved}>
              Save a posting worth applying to
            </ProgressItem>
            <ProgressItem done={progress.feedback} icon={<ChatIcon />} onAction={openFeedbackDialog}>
              Tell us one thing that is off
            </ProgressItem>
          </ul>

          {allDone ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="max-w-[44ch] text-pretty text-[13px] text-text">
                You&apos;re set. New postings land every 30 minutes; the saved ones are yours to track.
              </p>
              <button
                type="button"
                onClick={() => writeFlag(GET_STARTED_DISMISSED_KEY, userId)}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline px-3 font-label text-[11px] uppercase tracking-[0.08em] text-text-dim hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
