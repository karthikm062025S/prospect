"use client";

import Link from "next/link";

// The one conversion control on the landing. Every instance (nav, hero, feed
// preview, close, footer) is a trigger for the ONE sign-in dialog
// (components/landing/sign-in-dialog.tsx, mounted once in app/welcome/page.tsx):
// a click dispatches SIGN_IN_EVENT on window and the dialog opens.
//
// Google sign-in was removed (Karthik, 2026-09-19): email + password is the
// only way in, so there is no provider redirect to fall back to before
// hydration. The control is a plain button that opens the dialog.
//
// Two grounds, two fills.
// On the PAGE ground the fill is `bg-text` (the app's existing button pattern),
// which inverts with the theme: a near-black pill on cream, a light pill on the
// night ground. A fixed `bg-ink` would be right on cream and 1.05:1 against the
// dark theme's own surfaces — invisible.
// On a fixed INK band it likewise cannot be `bg-raised` (#1d2225 vs #18181b =
// 1.05:1), so it takes the ink-text fill: 14:1 label and boundary, both themes.
// The one line that answers "why sign in?" at the moment of the decision
// (Karthik, session 4). Browsing needs no account; signing in buys exactly one
// thing, a private list. Rendered under the hero CTA and the closing CTA.
export const SIGN_IN_REASON =
  "You sign in to build your profile. Your resume, transcript, goal and applications stay private to you.";

export const SIGN_IN_EVENT = "scout:signin";

const TONE = {
  cream: "bg-text text-bg focus-visible:ring-sage focus-visible:ring-offset-bg",
  ink: "bg-ink-text text-ink focus-visible:ring-accent focus-visible:ring-offset-ink",
} as const;

const PILL =
  "inline-flex h-12 items-center rounded-pill px-5 text-step-0 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function SignInCta({
  tone = "cream",
  className = "",
  label = "Sign in",
  signedIn = false,
}: {
  tone?: keyof typeof TONE;
  className?: string;
  label?: string;
  signedIn?: boolean;
}) {
  // A visitor who already has a session must never be asked to sign in again
  // (400-day cookies, lib/supabase/cookie-options.ts). Same pill, same tone,
  // but it is a link into the app instead of a trigger for the dialog.
  if (signedIn) {
    return (
      <div className={className}>
        <Link href="/" className={`${PILL} ${TONE[tone]}`}>
          My dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-haspopup="dialog"
        className={`${PILL} ${TONE[tone]}`}
        onClick={() => window.dispatchEvent(new CustomEvent(SIGN_IN_EVENT))}
      >
        {label}
      </button>
    </div>
  );
}
