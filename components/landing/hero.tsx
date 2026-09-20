"use client";

import { ArtPoster, HERO_TALL, HERO_WIDE } from "@/components/landing/art";
import AuthNotice from "@/components/landing/auth-notice";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { KenBurns } from "@/components/motion/ken-burns";
import { Rise } from "@/components/landing/rise";
import { TextReveal } from "@/components/motion/text-reveal";

// Lane C, 2026-09-19. The Wishlabs-order hero: a full-bleed band, an eyebrow, an
// H1 revealed word by word on load, one sub line, two CTAs and the live count.
// Spec: build/research/wishlabs/components/01-hero.md.
//
// The imagery is OURS (Karthik, 2026-09-19): the same public-domain print the
// hero has always carried, re-dithered into the VT ramp by scripts/art-assets.mjs
// (maroon / orange / ink / warm white). Wishlabs is the reference for LAYOUT and
// MOTION only. What changed against the previous hero:
//   - the 50vh pin and its scroll runway are gone. The band is `min-h-dvh` and
//     grows with its own copy (dvh never vh: SYSTEM.md Breakpoints), because the
//     reference opens on one full-bleed image and the copy is readable at once.
//   - the H1 reveals per WORD, not per character, and carries the new headline.
//   - the scrim is the maroon ink, redefined at the end of app/globals.css and
//     mirrored by the INK constant in scripts/contrast-pairs.mjs.
//
// `id="hero"` is the one landing-top anchor (tests/top-anchor.test.ts) and the
// five staggered Rise wrappers below are counted by tests/hero-motion.test.ts,
// which greps this file, so that comment cannot spell the JSX it counts.
const HEADLINE = "Find the roles worth your time. Build the skills AI can't replace.";
const SUB =
  "Upload a resume and an unofficial transcript. Four agents rank the live opportunity feed for your goal and turn what is missing into a semester plan of real Virginia Tech courses, clubs and certifications.";

// The reference's secondary control: a pill with a transparent fill and a
// hairline border. On the ink scrim that border is --ink-text at 40 percent
// alpha, which clears WCAG 1.4.11's 3:1 for a control's own boundary.
const GHOST_PILL =
  "inline-flex h-12 items-center rounded-pill border border-ink-text/40 px-5 text-step-0 font-medium text-ink-text hover:border-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

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
      className="relative isolate flex min-h-dvh flex-col justify-end overflow-hidden bg-ink px-gutter pb-16 pt-36"
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
      <div className="scout-hero-scrim absolute inset-0 -z-10" aria-hidden="true" />

      <div className="mx-auto w-full max-w-page">
        <Rise delay={0.05} immediate>
          <p className="scout-eyebrow text-ink-text">
            {/* The one orange mark above the fold: a fill, never text. On the
                ink scrim it needs no boundary ring (6.10:1 on --ink). */}
            <span aria-hidden="true" className="mr-2 size-2 rounded-pill bg-accent" />
            Every major. Every role.
          </p>
        </Rise>

        <TextReveal
          as="h1"
          id="hero-heading"
          text={HEADLINE}
          granularity="word"
          tone="ink-text"
          className="font-display mt-6 max-w-[16ch] text-balance text-step-hero leading-hero"
        />

        <Rise delay={0.1} immediate>
          <p className="mt-6 w-full max-w-[560px] text-pretty text-step-2 leading-title text-ink-text/90">
            {SUB}
          </p>
        </Rise>

        <Rise delay={0.15} immediate>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SignInCta tone="ink" label="Get started" signedIn={signedIn} />
            <a href="#feed" className={GHOST_PILL}>
              See the live feed
            </a>
          </div>
        </Rise>

        {signedIn ? null : (
          <Rise delay={0.2} immediate>
            <p className="mt-4 max-w-[46ch] text-pretty text-step-xs text-ink-text/75 [@media(max-height:820px)]:hidden">
              {SIGN_IN_REASON}
            </p>
          </Rise>
        )}

        <Rise delay={0.25} immediate>
          <p className="mt-6 font-sans text-step-xs tabular-nums text-ink-text/75">{liveLine}</p>
        </Rise>

        {/* D27.5: only renders on /welcome?error=auth. */}
        <AuthNotice />
      </div>
    </section>
  );
}
