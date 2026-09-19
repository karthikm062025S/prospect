"use client";

import { ArtPoster, HERO_TALL, HERO_WIDE } from "@/components/landing/art";
import AuthNotice from "@/components/landing/auth-notice";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { ArrowDownIcon } from "@/components/landing/icons";
import { KenBurns } from "@/components/motion/ken-burns";
import { Rise } from "@/components/landing/rise";
import { TextReveal } from "@/components/motion/text-reveal";
import { useSettled } from "@/components/motion/settled";

// v7 D20 item 4.1. The hero is a 50vh pin over a fixed art layer.
//
// The runway is 100dvh (the pinned frame) + PIN_VH of travel; the frame is
// `sticky top-0`, so the art holds still while the page scrolls under it and
// the sheet below rides up over it. Progress is scrollY against the measured
// runway, for the ViewTimeline reason documented in text-reveal.tsx.
//
// v7 S4 LANDING-FLOW, from the persona click-through: the pin was 140vh, so the
// section measured 2,917px on a 1,215px viewport (2.4 screens) and the sub +
// CTA were gated behind `progress > 0.6` — ten wheel ticks (1,000px, progress
// 0.59) changed nothing and the visitor's ten-second read bought a headline and
// some art. Two changes, both required by that finding:
//   1. PIN_VH 140 -> 50, so the whole section is 1.5 viewports.
//   2. the sub, the CTA, the "why sign in" line and the live count are NOT
//      scroll-gated any more. They paint with the first frame, inside the first
//      viewport, which is the entire point of a hero.
// What stays: the Ken Burns drift and the accent scroll-progress hairline
// (D24-D26). v9: the H1 reveals per character automatically on first paint
// (components/motion/text-reveal.tsx), no longer against the pin.
const PIN_VH = 50;
// How far the sheet below rides up over the pinned frame. The hero's runway
// always reserves at least this much past the frame, so the copy is never
// covered, including in the settled state, where there is no pin at all.
const SHEET_OVERLAP_VH = 24;

const HEADLINE = "Find what fits. Build the plan to get there.";
const SUB =
  "Upload a resume and an unofficial transcript. Four agents rank the live opportunity feed for your goal and turn what is missing into a semester roadmap of real Virginia Tech courses, clubs and certifications.";

export function Hero({
  liveLine,
  signedIn = false,
}: {
  liveLine: string;
  signedIn?: boolean;
}) {
  const settled = useSettled();
  // The art layer is -z-10 and the copy sits above it, so the art never sees a
  // pointer. The sticky frame is the box the pointer actually crosses, so it is
  // the parallax listener; nothing about its layout changes.
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate"
      style={{
        height: `calc(100dvh + ${settled ? SHEET_OVERLAP_VH : PIN_VH}dvh)`,
      }}
    >
      <div className="sticky top-0 flex h-dvh flex-col justify-end overflow-hidden">
        {/* The art. 9:16 crop below 640, 16:9 at and above it. Both crops keep
            the print's title cartouche and artist seal out of frame. */}
        <div className="absolute inset-0 -z-10">
          {/* D26.2: the continuous drift lives on the poster layer only; the
              scrim below stays outside it so it never scales.
              The 9:16 / 16:9 swap is a <picture> media source inside ArtPoster
              rather than two `hidden`-toggled trees, so the browser downloads
              only the crop it actually paints. */}
          <KenBurns className="size-full">
            <ArtPoster work={HERO_TALL} wide={HERO_WIDE} priority />
          </KenBurns>
        </div>
        <div
          className="scout-hero-scrim absolute inset-0 -z-10"
          aria-hidden="true"
        />

        <div className="w-full px-gutter pb-12 pt-36">
          <div className="mx-auto w-full max-w-page">
            <Rise delay={0.05} immediate>
              <p className="scout-eyebrow max-w-full whitespace-nowrap text-ink-text">
                <span className="min-[480px]:hidden">Strike gold.</span>
                <span className="hidden min-[480px]:inline">
                  Strike gold. Every role, every major.
                </span>
              </p>
            </Rise>

            <TextReveal
              as="h1"
              id="hero-heading"
              text={HEADLINE}
              granularity="char"
              tone="ink-text"
              className="font-display mt-6 max-w-[16ch] text-balance text-step-hero tracking-display"
            />

            <div className="mt-6">
              <Rise delay={0.1} immediate>
                <p className="max-w-[min(560px,100%)] text-pretty text-step-2 leading-title text-ink-text/90 lg:text-step-3">
                  {SUB}
                </p>
              </Rise>
              <Rise delay={0.15} immediate>
                <div className="mt-6 flex items-center gap-3">
                  <SignInCta
                    tone="ink"
                    label="Get started"
                    signedIn={signedIn}
                  />
                  {/* Accent fill needs the ring: #e69a6f is 2.11:1 on cream and
                      under WCAG 1.4.11's 3:1 for a control's own boundary. The
                      ink-text ring measures 8.7:1 against the fill. */}
                  <a
                    href="#feed"
                    aria-label="See what went live recently"
                    className="flex size-12 items-center justify-center rounded-pill border-2 border-ink-text bg-accent text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                  >
                    <ArrowDownIcon />
                  </a>
                </div>
              </Rise>
              {/* The one line at the sign-in moment that answers "why?" (Karthik,
                  session 4). Browsing needs no account; signing in exists only
                  to keep a private list. Sits directly under the CTA so it is
                  read as part of the decision, not as a feature bullet. */}
              {signedIn ? null : (
                <Rise delay={0.2} immediate>
                  <p className="mt-3 max-w-[46ch] text-pretty text-step-xs text-ink-text/75 [@media(max-height:820px)]:hidden">
                    {SIGN_IN_REASON}
                  </p>
                </Rise>
              )}
              <Rise delay={0.25} immediate>
                <p className="mt-6 font-sans text-step-xs tabular-nums text-ink-text/75">
                  {liveLine}
                </p>
              </Rise>
            </div>
            {/* D27.5: only renders on /welcome?error=auth. Outside the scroll-
                driven tail on purpose: that tail is opacity 0 at scrollY 0, and
                a failed sign-in has to be readable at first paint. */}
            <AuthNotice />
          </div>
        </div>
      </div>
    </section>
  );
}
