"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { ListSearchIcon, PathIcon, RobotIcon } from "@/components/landing/icons";
import { Rise } from "@/components/landing/rise";
import { SignInCta } from "@/components/landing/sign-in-cta";
import { TextReveal } from "@/components/motion/text-reveal";
import { useSettled } from "@/components/motion/settled";
import { usePinProgress, useWideViewport } from "@/components/motion/pin-scene";
import { formatStat } from "@/lib/public-stats-format";

// Section 8: the reference's card grid, as three cards, because three product
// surfaces exist and a fourth would have to be invented.
// Spec: build/research/wishlabs/components/07-features.md.
//
// Redesign 2026-09-20 (item 2): a PINNED SCENE. The band holds the
// heading and the three cards in one viewport-tall frame, and scroll progress
// walks the deck one card at a time — the active card lifts and takes the
// accent edge, the other two settle a fraction behind it.
//
// Two D10 rules shape it. The cards are all THERE from the first frame of the
// pin rather than fading in one by one, because a card that has not arrived
// yet is a half-empty column, and they never dim, because dimmed body text
// loses its contrast ratio. They also fan side by side rather than stacking on
// top of each other: every card carries a CTA, and a card lying under another
// one is a control that is focusable but not clickable. Equal-width,
// equal-height siblings that fill the container, and the deck never covers its
// own buttons.
//
// Each card carries ONE real metric or a truthful status line, never a made-up
// figure: the feed has a real count, the roadmap and the agents do not have a
// public number, so they state what is true instead.
// Icons are Phosphor BOLD, inlined from design/icons/phosphor/SVGs/bold/.

// Three cards side by side need the three columns, so the scene pins only from
// the breakpoint where the grid is three-up. Below that the band renders its
// settled state, complete and un-pinned.
const PIN_FROM = "(min-width: 1024px)";

// Ascending, inside [0, 1]: card i holds the lift over [IN + i*STEP, + STEP],
// and EDGE is the cross-fade at each seam. Motion hands a scroll-derived value
// to the compositor through the Web Animations API, which rejects an
// out-of-range or non-monotonic offset outright.
const IN = 0.08;
const STEP = 0.28;
const EDGE = 0.06;
/** Lifted, and settled behind. */
const LIFT = [1.02, 0.97];
const RISE = [-12, 0];
/** Three product surfaces exist; a fourth card would have to be invented. */
const COUNT = 3;

const CARD =
  "scout-card flex h-full flex-col rounded-card border bg-raised p-6 transition-colors";

function Card({
  index,
  progress,
  animate,
  active,
  children,
}: {
  index: number;
  progress: MotionValue<number>;
  animate: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  const start = IN + index * STEP;
  const end = start + STEP;
  const first = index === 0;
  const last = index === COUNT - 1;

  // The first card opens the scene already lifted and the last one holds its
  // lift to the end, so no offset has to reach outside [0, 1].
  const offsets = first
    ? [0, EDGE, end - EDGE, end + EDGE]
    : last
      ? [start - EDGE, start + EDGE, 1]
      : [start - EDGE, start + EDGE, end - EDGE, end + EDGE];
  const scales = first
    ? [LIFT[0], LIFT[0], LIFT[0], LIFT[1]]
    : last
      ? [LIFT[1], LIFT[0], LIFT[0]]
      : [LIFT[1], LIFT[0], LIFT[0], LIFT[1]];
  const rises = first
    ? [RISE[0], RISE[0], RISE[0], RISE[1]]
    : last
      ? [RISE[1], RISE[0], RISE[0]]
      : [RISE[1], RISE[0], RISE[0], RISE[1]];

  const scale = useTransform(progress, offsets, scales);
  const y = useTransform(progress, offsets, rises);

  return (
    <motion.li
      style={animate ? { y, scale } : undefined}
      className={`${CARD} ${active && animate ? "border-accent" : "border-hairline"}`}
    >
      {children}
    </motion.li>
  );
}

export function FeatureCards({
  openRoles,
  signedIn,
}: {
  openRoles: number | null;
  signedIn: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useSettled();
  const wide = useWideViewport(PIN_FROM);
  const pinned = wide && !settled;
  const progress = usePinProgress(ref, !pinned);
  const [active, setActive] = useState(0);

  useMotionValueEvent(progress, "change", (value) => {
    // Which card is the one that just arrived. One state flip per card, never
    // a set per frame.
    setActive(Math.min(COUNT - 1, Math.max(0, Math.floor((value - IN) / STEP))));
  });

  const cards = [
    {
      Icon: ListSearchIcon,
      title: "Feed",
      body: "Every open posting we watch, ranked best to least for your goal, with the reasons in words.",
      status: `${formatStat(openRoles)} open postings right now`,
      cta: "See the live feed",
    },
    {
      Icon: PathIcon,
      title: "Journey roadmap",
      body: "A semester by semester plan of real courses, clubs, projects and certifications that closes the gaps.",
      status: "Built as soon as your profile is in",
      cta: "Build my roadmap",
    },
    {
      Icon: RobotIcon,
      title: "Agents",
      body: "Profile, Match, Roadmap and Orchestrator. Each one reads real data and hands back a checked result.",
      status: "Temperature zero, schema-checked output",
      cta: "Start the run",
    },
  ];

  const header = (
    <div className="mx-auto w-full max-w-page">
      <Rise>
        <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
          What you get
        </p>
      </Rise>
      <TextReveal
        as="h2"
        id="features-heading"
        text="Three surfaces. One journey."
        granularity="word"
        className="font-display mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
      />
    </div>
  );

  const deck = (
    <ul className="mx-auto mt-12 grid w-full max-w-page items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ Icon, title, body, status, cta }, index) => (
        <Card
          key={title}
          index={index}
          progress={progress}
          animate={pinned}
          active={active === index}
        >
          <span className="flex size-14 items-center justify-center rounded-pill bg-sage/10 text-sage">
            <Icon size={32} />
          </span>
          <h3 className="font-display mt-6 text-step-3 leading-title text-text">{title}</h3>
          <p className="mt-3 text-pretty text-step-0 leading-body text-text-dim">{body}</p>
          <p className="mt-4 font-sans text-step-xs tabular-nums text-sage">{status}</p>
          <SignInCta
            label={cta}
            signedIn={signedIn}
            className="mt-6 [&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center"
          />
        </Card>
      ))}
    </ul>
  );

  return (
    <section id="features" aria-labelledby="features-heading" className="bg-bg px-gutter">
      {pinned ? (
        // The runway IS the band: the heading and the deck ride one sticky,
        // viewport-tall frame while the cards arrive.
        <div ref={ref} className="relative h-[260dvh]">
          <div className="sticky top-0 flex h-dvh flex-col justify-center">
            {header}
            {deck}
          </div>
        </div>
      ) : (
        <div className="py-section">
          {header}
          {deck}
        </div>
      )}
    </section>
  );
}
