"use client";

import { ArrowUpIcon } from "@/components/landing/icons";

// L4 owns the feedback dialog. Everything here only ASKS for it: one custom
// event on window. If nothing is listening yet, the control's href="#feedback"
// still moves the visitor to the section that explains how to reach us, so the
// no-JS / not-yet-mounted path is not a dead end.
export const FEEDBACK_EVENT = "scout:feedback-open";

export function openFeedback() {
  window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT));
}

const TONE = {
  cream: "bg-text text-bg focus-visible:ring-sage focus-visible:ring-offset-bg",
  ink: "bg-ink-text text-ink focus-visible:ring-accent focus-visible:ring-offset-ink",
} as const;

export function FeedbackButton({
  tone = "cream",
  children = "Send feedback",
  className = "",
}: {
  tone?: keyof typeof TONE;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href="#feedback"
      onClick={(event) => {
        event.preventDefault();
        openFeedback();
      }}
      className={`inline-flex h-12 items-center rounded-pill px-6 text-step-0 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${TONE[tone]} ${className}`}
    >
      {children}
    </a>
  );
}

export function FeedbackLink({ className = "" }: { className?: string }) {
  return (
    <a
      href="#feedback"
      onClick={(event) => {
        event.preventDefault();
        openFeedback();
      }}
      className={`inline-flex min-h-11 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${className}`}
    >
      Send feedback
    </a>
  );
}

// Anchor, not a scripted scroll: the smooth easing is the CSS `scroll-behavior`
// on <html>, which the reduced-motion block already turns off.
export function BackToTop() {
  return (
    <a
      href="#hero"
      aria-label="Back to top"
      // The accent cannot carry this: #e69a6f is 2.12:1 on --raised, under
      // both AA text and WCAG 1.4.11's 3:1 for a control's own boundary.
      // --text-dim is 5.16:1 on --raised for the glyph and the ring alike.
      className="flex size-11 items-center justify-center rounded-pill border border-text-dim text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
    >
      <ArrowUpIcon />
    </a>
  );
}
