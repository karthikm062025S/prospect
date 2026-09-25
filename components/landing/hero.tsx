"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

import { Wordmark } from "@/components/brand/wordmark";
import AuthNotice from "@/components/landing/auth-notice";
import { BrandMark, ROW_A } from "@/components/landing/brand-marks";
import { Rise } from "@/components/landing/rise";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { useSettled } from "@/components/motion/settled";

// Redesign 2026-09-20. Karthik's painting, cut by
// scripts/hero-layers.mjs into four depth planes (public/art/hero/*), each
// scrolling at its own rate: sky slowest, near trees fastest. His wordmark
// sits in the sky like a sun, BETWEEN the sky and the far ridges, so the
// ridges occlude its foot: on load each letter rises out from behind the ridge
// line (components/brand/wordmark.tsx), and on scroll the ridges climb faster
// than the letters, so the mark sinks back behind them.
//
// The tagline and the two CTAs form one centred block below the ridge line,
// over the mid hills; the eight board marks span the foot. The capsule nav is
// untouched (components/landing/landing-nav.tsx).
//
// Motion is `motion` v13 only: useScroll on this section, a useTransform per
// plane. Every plane moves DOWN inside the section as the page scrolls up, by
// (1 - rate) of the distance scrolled, which is what "moves at `rate` of the
// scroll" means on screen. The uncovered band is above the section's top edge,
// so it is never on screen and no plane needs to be taller than the hero.
//
// Reduced motion / ?motion=final: useSettled() renders every plane as a plain
// div at rest, the wordmark fully visible, and Rise renders its copy static.
//
// `id="hero"` is the one landing-top anchor (tests/top-anchor.test.ts). The
// five staggered Rise wrappers are counted by tests/hero-motion.test.ts, which
// greps this file, so that comment cannot spell the JSX it counts.
const TAGLINE = "The career journey for every Virginia Tech student.";

/** Apparent scroll rate per plane, back to front (fraction of scroll distance). */
const RATE = { sky: 0.1, wordmark: 0.2, ridges: 0.4, hills: 0.55, near: 0.8 } as const;

// Where the far-ridge crest sits in the painting, as a fraction of its height:
// rows 239-253 of 576 across the wordmark's span, measured off ridges.png's
// alpha (L1). The painting is object-cover and height-bound at both 9:16 and
// 16:9, so a fraction of the hero's height lands on the same brushstroke. The
// wordmark's INK BOTTOM -- not its baseline -- is placed just above the crest's
// highest row (239/576 = 0.415), so at rest every letter including the two "p"
// descenders is fully visible (D10, Karthik 2026-09-20). The sink behind the
// ridges is scroll-only (RATE.ridges > RATE.wordmark), unchanged.
const RIDGE_LINE = 0.405;
// The ink bottom is 1648/2236 of the box (the "p" descender tip); the baseline
// at 1370/2236 is where the x-height letters sit. Placing by the descender is
// what guarantees no letter is clipped.
const WORDMARK_INK_BOTTOM = 1648 / 2236;
// The copy block starts one even gap (6.5% of the hero) under the wordmark's
// foot, clear of the ridge band (0.415-0.439) and over the mid hills; on a
// 390x844 phone that still leaves the eight marks inside the fold (D10).
const COPY_TOP = 0.47;

// The sun behind the mark: the sky's own brightest orange (rgb 245 172 81 at
// the horizon), faded out radially. The maroon letters clear 4.5:1 on that
// band but not on the darker red above it, where the ascender and the sparkle
// reach, and D-rule 3 asks for a soft glow there, never a box.
const SUN_GLOW =
  "radial-gradient(ellipse at 50% 50%, rgb(245 172 81 / 0.9) 0%, rgb(245 172 81 / 0.55) 35%, rgb(245 172 81 / 0) 70%)";

// The reference's secondary control: a pill with a transparent fill and a
// hairline border. On the ink scrim that border is --ink-text at 40 percent
// alpha, which clears WCAG 1.4.11's 3:1 for a control's own boundary.
const GHOST_PILL =
  "inline-flex h-12 items-center rounded-pill border border-ink-text/40 px-5 text-step-0 font-medium text-ink-text hover:border-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

// Eight marks, the reference's logo-strip count. ROW_A now leads with a
// cross-industry set (consulting, semis, payments, healthcare, industrial,
// media, telecom, retail) so the foot does not read as "just big tech"
// (Karthik 2026-09-20); every name is verified against scripts/endpoints.json
// by tests/boards-strip.test.ts and carries a real vector mark.
const MARKS = ROW_A.slice(0, 8);

// Bottom-weighted, so the sky stays as bright as the painting for the maroon
// letters and only the valley under the copy darkens.
// note: inline; app/globals.css is orchestrator-only this mission.
// Upgrade path: a `.scout-hero-scrim` class next to `.scout-sky-scrim`.
const SCRIM =
  "linear-gradient(to bottom, rgb(31 14 20 / 0) 0%, rgb(31 14 20 / 0) 40%, rgb(31 14 20 / 0.45) 58%, rgb(31 14 20 / 0.72) 100%)";

/** One depth plane. Settled = a plain div at rest, no motion value consumed. */
function Plane({
  rate,
  progress,
  settled,
  children,
}: {
  rate: number;
  progress: MotionValue<number>;
  settled: boolean;
  children: React.ReactNode;
}) {
  const y = useTransform(progress, [0, 1], ["0%", `${((1 - rate) * 100).toFixed(1)}%`]);
  if (settled) return <div className="absolute inset-0 -z-10">{children}</div>;
  return (
    <motion.div style={{ y }} className="absolute inset-0 -z-10">
      {children}
    </motion.div>
  );
}

/**
 * One painted layer. WebP with a PNG fallback through a <picture> source, so
 * the browser fetches ONE encoding (tests/landing-loading-budget.test.ts). All
 * four paint above the fold, so all four load eagerly at high priority; the
 * plane is absolutely sized, so the intrinsic size is only an aspect hint.
 */
function Art({ name, alt }: { name: "sky" | "ridges" | "hills" | "near"; alt: string }) {
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={`/art/hero/${name}.webp`} />
      <img
        src={`/art/hero/${name}.png`}
        alt={alt}
        width={2048}
        height={1144}
        draggable={false}
        decoding="async"
        loading="eager"
        fetchPriority="high"
        className="size-full object-cover object-center"
      />
    </picture>
  );
}

export function Hero({
  liveLine,
  signedIn = false,
}: {
  liveLine: string;
  signedIn?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const settled = useSettled();
  // 0 with the hero's top at the viewport top, 1 once its bottom reaches it.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  return (
    <section
      ref={ref}
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink px-gutter"
    >
      {/* Depth planes, back to front. Same z level, so DOM order stacks them:
          sky, wordmark, ridges, hills, near, then the scrim. */}
      <Plane rate={RATE.sky} progress={scrollYProgress} settled={settled}>
        <Art
          name="sky"
          alt="Painting of a twilight sky over misty ridges, a river valley and a prospector's camp"
        />
      </Plane>

      <Plane rate={RATE.wordmark} progress={scrollYProgress} settled={settled}>
        {/* Centred like a sun; ~88vw on a phone, capped on desktop so the
            x-height stays inside the sky's orange band (D10: fully in view). */}
        <h1
          id="hero-heading"
          className="absolute left-1/2 w-[min(88vw,860px)] sm:w-[clamp(480px,56vw,860px)]"
          style={{
            top: `${RIDGE_LINE * 100}%`,
            transform: `translate(-50%, -${(WORDMARK_INK_BOTTOM * 100).toFixed(2)}%)`,
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-[30%] -inset-y-[45%]"
            style={{ background: SUN_GLOW }}
          />
          <Wordmark entrance className="relative block h-auto w-full" />
        </h1>
      </Plane>

      <Plane rate={RATE.ridges} progress={scrollYProgress} settled={settled}>
        <Art name="ridges" alt="" />
      </Plane>
      <Plane rate={RATE.hills} progress={scrollYProgress} settled={settled}>
        <Art name="hills" alt="" />
      </Plane>
      <Plane rate={RATE.near} progress={scrollYProgress} settled={settled}>
        <Art name="near" alt="" />
      </Plane>
      <div className="absolute inset-0 -z-10" style={{ background: SCRIM }} aria-hidden="true" />

      {/* The copy: one centred block under the ridge line, over the hills. */}
      <div
        className="mx-auto flex w-full max-w-page flex-1 flex-col items-center pb-6 text-center"
        style={{ paddingTop: `${COPY_TOP * 100}dvh` }}
      >
        <Rise delay={0.55} immediate>
          <p className="max-w-[24ch] text-balance text-step-2 leading-title text-ink-text">
            {TAGLINE}
          </p>
        </Rise>

        <Rise delay={0.65} immediate className="mt-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SignInCta tone="ink" label="Get started" signedIn={signedIn} />
            <a href="#feed" className={GHOST_PILL}>
              See the live feed
            </a>
          </div>
        </Rise>

        {signedIn ? null : (
          <Rise delay={0.75} immediate className="mt-5">
            <p className="max-w-[46ch] text-pretty text-step-xs text-ink-text/75 [@media(max-height:820px)]:hidden">
              {SIGN_IN_REASON}
            </p>
          </Rise>
        )}

        <Rise delay={0.85} immediate className="mt-5">
          <p className="font-sans text-step-xs tabular-nums text-ink-text/75">{liveLine}</p>
        </Rise>

        {/* The boards we watch, spanning the foot. One block, no per-mark
            stagger, so the counted Rise wrappers stay five. */}
        <Rise delay={0.95} immediate className="mt-auto w-full pt-8">
          <h2 className="sr-only">Boards Prospect watches</h2>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-ink-text/80 sm:justify-between">
            {MARKS.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <BrandMark name={name} size={26} />
                <span className="text-step-xs font-medium">{name}</span>
              </li>
            ))}
          </ul>
        </Rise>
      </div>

      {/* D27.5: only renders on /welcome?error=auth. */}
      <AuthNotice />
    </section>
  );
}
