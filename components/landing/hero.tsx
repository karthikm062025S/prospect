"use client";

import { ArtPoster, HERO_TALL, HERO_WIDE } from "@/components/landing/art";
import AuthNotice from "@/components/landing/auth-notice";
import { BrandMark, ROW_A } from "@/components/landing/brand-marks";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { KenBurns } from "@/components/motion/ken-burns";
import { Rise } from "@/components/landing/rise";
import { TextReveal } from "@/components/motion/text-reveal";

// Redesign 2026-09-19 (Karthik: the Wishlabs hero composition, our museum art,
// VT colours). One full-bleed band over a painted twilight sky, re-dithered
// into the VT ramp by scripts/art-assets.mjs. The composition is the
// reference's: "Welcome to" above the first letter, the wordmark as the hero,
// the tagline and the CTAs hanging off its right end, and a strip of the boards
// we watch across the foot of the sky. The old sentence H1 moved to the cream
// statement band right below (components/landing/wordmark-strip.tsx).
//
// The wordmark is revealed per CHARACTER (SYSTEM.md: character granularity is
// reserved for the hero) and sized off the ladder on purpose:
// ponytail: `--step-hero` caps at 128px for a sentence; one eight-letter word
// as the whole hero reads small at that cap against the reference, so it
// takes 16vw between 72 and 232px. Upgrade path: a `--step-wordmark` token in
// app/globals.css if a second surface ever needs it.
//
// `id="hero"` is the one landing-top anchor (tests/top-anchor.test.ts) and the
// five staggered Rise wrappers below are counted by tests/hero-motion.test.ts,
// which greps this file, so that comment cannot spell the JSX it counts.
const WORDMARK = "Prospect";
const TAGLINE = "The career journey for every Virginia Tech student.";

// The reference's secondary control: a pill with a transparent fill and a
// hairline border. On the ink scrim that border is --ink-text at 40 percent
// alpha, which clears WCAG 1.4.11's 3:1 for a control's own boundary.
const GHOST_PILL =
  "inline-flex h-12 items-center rounded-pill border border-ink-text/40 px-5 text-step-0 font-medium text-ink-text hover:border-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

// Eight marks, the reference's logo-strip count. ROW_A is the boards-strip's
// own list, so every name here is verified against scripts/endpoints.json by
// tests/boards-strip.test.ts and carries a real vector mark.
const MARKS = ROW_A.slice(0, 8);

export function Hero({
  liveLine,
  signedIn = false,
}: {
  liveLine: string;
  signedIn?: boolean;
}) {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink px-gutter pb-10 pt-36"
    >
      {/* The art. 9:16 crop below 640, 16:9 at and above it, chosen by a
          <picture> media source so the browser downloads only the crop it
          paints (tests/landing-loading-budget.test.ts locks that). The drift
          lives on the poster layer only; the scrim below never scales. */}
      <div className="absolute inset-0 -z-10">
        <KenBurns className="size-full">
          <ArtPoster work={HERO_TALL} wide={HERO_WIDE} priority />
        </KenBurns>
      </div>
      <div className="scout-sky-scrim absolute inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto flex w-full max-w-page flex-1 flex-col justify-center">
        {/* w-fit + mx-auto: the eyebrow hangs off the wordmark's first letter
            and the tagline off its last, whatever the viewport. */}
        <div className="mx-auto flex w-fit max-w-full flex-col">
          <Rise delay={0.05} immediate>
            <p className="font-label text-step-2xs uppercase tracking-label text-ink-text/80">
              Welcome to
            </p>
          </Rise>

          <TextReveal
            as="h1"
            id="hero-heading"
            text={WORDMARK}
            granularity="char"
            tone="ink-text"
            className="font-display mt-2 text-[clamp(72px,16vw,232px)] leading-none tracking-display text-ink-text"
          />

          <div className="mt-4 flex flex-col items-start gap-5 sm:items-end sm:text-right">
            <Rise delay={0.1} immediate>
              <p className="max-w-[24ch] text-pretty text-step-2 leading-title text-ink-text/90">
                {TAGLINE}
              </p>
            </Rise>

            <Rise delay={0.15} immediate>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <SignInCta tone="ink" label="Get started" signedIn={signedIn} />
                <a href="#feed" className={GHOST_PILL}>
                  See the live feed
                </a>
              </div>
            </Rise>

            {signedIn ? null : (
              <Rise delay={0.2} immediate>
                <p className="max-w-[46ch] text-pretty text-step-xs text-ink-text/75 [@media(max-height:820px)]:hidden">
                  {SIGN_IN_REASON}
                </p>
              </Rise>
            )}

            <Rise delay={0.25} immediate>
              <p className="font-sans text-step-xs tabular-nums text-ink-text/75">{liveLine}</p>
            </Rise>
          </div>
        </div>
      </div>

      {/* The boards we watch, across the foot of the sky: the reference's logo
          strip. One block, no per-mark stagger, so the five counted Rise
          wrappers above stay five. */}
      <Rise immediate className="mx-auto mt-16 w-full max-w-page">
        <h2 className="sr-only">Boards Prospect watches</h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 text-ink-text/80">
          {MARKS.map((name) => (
            <li key={name} className="flex items-center gap-2">
              <BrandMark name={name} size={26} />
              <span className="text-step-xs font-medium">{name}</span>
            </li>
          ))}
        </ul>
      </Rise>

      {/* D27.5: only renders on /welcome?error=auth. */}
      <AuthNotice />
    </section>
  );
}
