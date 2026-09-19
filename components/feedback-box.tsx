"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import { submitFeedbackAction, type FeedbackState } from "@/app/feedback-actions";
import { ChatIcon } from "@/components/icons";
import { recordGetStartedFeedbackOpened } from "@/components/get-started";

const INITIAL_STATE: FeedbackState = { ok: null };

// Same string components/landing/feedback.tsx dispatches (kept as an
// independent literal, not an import, so the core dialog never reaches into
// components/landing/** — the dependency runs the other way). Any trigger,
// anywhere in the tree, can open the one mounted <FeedbackDialog> this way.
const FEEDBACK_EVENT = "scout:feedback-open";

function dispatchOpenFeedback(): void {
  window.dispatchEvent(new Event(FEEDBACK_EVENT));
}

// Reusable open control (D22): every in-app entry point (the app-bar pill,
// the floating fab) renders this and never talks to the dialog directly.
export function FeedbackTrigger({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" onClick={dispatchOpenFeedback} className={className} {...rest}>
      {children}
    </button>
  );
}

const primaryButton =
  "inline-flex min-h-11 items-center gap-1.5 bg-text px-4 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60";
const plainButton =
  "inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
// L8 audit item 1 (D19.2, feel.md): extends the opacity-only fade this dialog
// already had (open:starting:opacity-0) into the full house recipe — opacity
// + 4px rise, asymmetric open/close duration+easing, a backdrop fade — the
// same string as components/detail-pane.tsx's dialogMotion (see its comment
// for the full reasoning).
const dialogMotion =
  "translate-y-1 opacity-0 open:translate-y-0 open:opacity-100 transition-discrete transition-[opacity,transform,overlay,display] duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)] open:duration-[180ms] open:ease-[cubic-bezier(0.23,1,0.32,1)] open:starting:translate-y-1 open:starting:opacity-0 backdrop:opacity-0 open:backdrop:opacity-100 backdrop:transition-discrete backdrop:transition-[opacity,overlay,display] backdrop:duration-[120ms] open:backdrop:duration-[180ms] open:backdrop:starting:opacity-0 motion-reduce:transition-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={primaryButton}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

// Owns the useActionState run for one open of the dialog. Remounted via
// FeedbackDialog's `formKey` on every open, so a previous run's success/error
// state never leaks into the next one.
function FeedbackForm({
  page,
  titleId,
  helpId,
  onClose,
}: {
  page: string;
  titleId: string;
  helpId: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(submitFeedbackAction, INITIAL_STATE);
  const [message, setMessage] = useState("");

  // D27.4: the Get-started item is "tell us one thing", so it ticks on a
  // sent feedback, not on merely opening the dialog.
  useEffect(() => {
    if (state.ok) recordGetStartedFeedbackOpened();
  }, [state.ok]);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-[15px]">
          Got it. Thank you.
        </h2>
        <button type="button" onClick={onClose} autoFocus className={`${plainButton} self-end`}>
          Close
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-[15px]">
        Tell us what&apos;s off (or what&apos;s good)
      </h2>
      <p id={helpId} className="text-[13px] text-text-dim">
        This is an MVP. Every message goes straight to the maker.
      </p>
      <input type="hidden" name="page" value={page} />
      <div>
        <label htmlFor="feedback-message" className="sr-only">
          Your feedback
        </label>
        <textarea
          id="feedback-message"
          name="message"
          required
          maxLength={2000}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="auto-grow min-h-24 w-full border border-hairline bg-bg px-3 py-2 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        />
        <div className="mt-1 text-right font-sans text-[11px] tabular-nums text-text-dim">{message.length}/2000</div>
      </div>
      <div>
        <label htmlFor="feedback-email" className="sr-only">
          Email if you want a reply (optional)
        </label>
        <input
          id="feedback-email"
          name="email"
          type="email"
          placeholder="Email if you want a reply (optional)"
          className="min-h-11 w-full border border-hairline bg-bg px-3 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        />
      </div>
      {state.ok === false ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {/* V10: the legal pages are reachable from the feedback box itself. */}
        <p className="text-[11px] text-text-dim">
          <a href="/privacy" className="underline underline-offset-2 hover:text-text">Privacy</a>
          {" · "}
          <a href="/terms" className="underline underline-offset-2 hover:text-text">Terms</a>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={plainButton}>
            Cancel
          </button>
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}

// The dialog itself (D10), mounted once in app/layout.tsx so it shows on
// every route regardless of which trigger opened it. Native <dialog> is the
// house pattern (see components/home-list.tsx's delete confirm) -- focus
// trap, Escape-to-close, and returning focus to the invoking control all
// come from the platform for free, which is what lets FeedbackTrigger have
// multiple simultaneous instances (fab, app-bar pill, landing nav pill).
export function FeedbackDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [page, setPage] = useState("/");
  const [formKey, setFormKey] = useState(0);
  const titleId = useId();
  const helpId = useId();

  const openDialog = useCallback(() => {
    setPage(window.location.pathname);
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  }, []);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Any FeedbackTrigger (this file) or the landing's own controls
  // (components/landing/feedback.tsx) dispatch this instead of holding a
  // ref to the dialog -- it lives outside their route tree. #feedback lets
  // any link deep-link straight to the form.
  useEffect(() => {
    window.addEventListener(FEEDBACK_EVENT, openDialog);
    // Deferred to a microtask: react-hooks/set-state-in-effect flags a
    // setState call reachable synchronously from the effect body itself;
    // an event-listener-style callback (this one, or the addEventListener
    // handler above) is the sanctioned shape for reacting to an external
    // signal, so #feedback is treated the same way.
    if (window.location.hash === "#feedback") queueMicrotask(openDialog);
    return () => window.removeEventListener(FEEDBACK_EVENT, openDialog);
  }, [openDialog]);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={helpId}
      className={`m-auto w-full max-w-sm border border-hairline bg-raised p-5 text-text ${dialogMotion}`}
    >
      <FeedbackForm key={formKey} page={page} titleId={titleId} helpId={helpId} onClose={closeDialog} />
    </dialog>
  );
}

// Floating entry point, mounted once in app/layout.tsx alongside
// FeedbackDialog. md:hidden (D22 global rule): at >=768px the app-bar /
// landing-nav pill is the only trigger, so the fab only renders on narrow
// viewports where the bar can scroll it out of reach.
export function FeedbackFab() {
  return (
    <FeedbackTrigger
      aria-label="Feedback"
      className="fixed bottom-6 right-6 z-40 flex min-h-12 items-center gap-2 rounded-full border border-hairline bg-raised px-4 text-text shadow-lg hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg md:hidden"
    >
      <ChatIcon />
      <span className="hidden font-sans text-sm sm:inline">Feedback</span>
    </FeedbackTrigger>
  );
}
