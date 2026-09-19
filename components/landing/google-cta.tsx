"use client";

import Link from "next/link";

import { signInWithGoogleAction } from "@/app/auth/actions";

// The one conversion control on the landing. Every instance (nav, hero, feed
// preview, close, footer) is a trigger for the ONE sign-in dialog
// (components/landing/sign-in-dialog.tsx, mounted once in app/welcome/page.tsx):
// a click dispatches SIGN_IN_EVENT on window and the dialog opens.
//
// It stays a native <form action={signInWithGoogleAction}> underneath, so
// before hydration (or with JS off) the click still goes straight to Google.
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
  "You sign in only to save, hide and track postings. That list stays private to you.";

export const SIGN_IN_EVENT = "scout:signin";

const TONE = {
  cream: "bg-text text-bg focus-visible:ring-sage focus-visible:ring-offset-bg",
  ink: "bg-ink-text text-ink focus-visible:ring-accent focus-visible:ring-offset-ink",
} as const;

const PILL =
  "inline-flex h-12 items-center rounded-pill px-5 text-step-0 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function GoogleCta({
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
    <form
      action={signInWithGoogleAction}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(SIGN_IN_EVENT));
      }}
    >
      <button
        type="submit"
        aria-haspopup="dialog"
        className={`${PILL} ${TONE[tone]}`}
      >
        {label}
      </button>
    </form>
  );
}

// Google's own "G" — a brand glyph, deliberately the one thing on this page
// outside the eight-colour palette (sign-in marks may not be recoloured).
export function GoogleGlyph() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    </span>
  );
}
