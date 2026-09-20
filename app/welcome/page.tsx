import type { Metadata } from "next";
import Link from "next/link";
import { ArtBand } from "@/components/landing/art-band";
import { CELESTIAL, RISING_WAVES } from "@/components/landing/art";
import { BeforeAfter } from "@/components/landing/before-after";
import { BoardsList, BoardsStrip } from "@/components/landing/boards-strip";
import { FeatureCards } from "@/components/landing/feature-cards";
import { LabelLegend, LABEL_SOURCE } from "@/components/landing/label-legend";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { SignInDialog } from "@/components/landing/sign-in-dialog";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { OpenOnHero } from "@/components/landing/open-on-hero";
import { Rise } from "@/components/landing/rise";
import { Showcase } from "@/components/landing/showcase";
import { StatsRow } from "@/components/landing/stats-row";
import { UnderTheHood } from "@/components/landing/under-the-hood";
import { ScreenshotStrip, StatementBand } from "@/components/landing/wordmark-strip";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { BackToTop, FeedbackLink } from "@/components/landing/feedback";
import { SettledProvider } from "@/components/motion/settled";
import { TextReveal } from "@/components/motion/text-reveal";
import { createClient } from "@/lib/supabase/server";
import { getPublicFeed } from "@/lib/public-feed";
import { getPublicStats } from "@/lib/public-stats";
import { formatStat } from "@/lib/public-stats-format";

// Lane C, 2026-09-19: the landing rebuilt in the reference's section order.
// Layout, rhythm, type scale and motion are cloned from wishlabs.ai; the words,
// the imagery and the palette are ours (extraction + per-section specs live in
// build/research/wishlabs/). The order, top to bottom:
//   1 hero            full-bleed art, eyebrow, word-revealed H1, two CTAs, live count
//   2 welcome         "Welcome to" + the giant wordmark over an art band
//   3 screenshots     the marquee of real app captures
//   4 stats           three real numbers
//   5 feed            ranked feed, eyebrow + big heading + screenshot
//   6 roadmap         the labels, mirrored band
//   7 labels          the before / after slider on a real posting
//   8 features        three cards
//   9 under the hood  Databricks + the four agents
//  10 privacy         the honest band where the reference put testimonials
//  11 get started     closing CTA, then the footer
//
// Server component. Every animated piece is an island under components/landing/
// or components/motion/.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Prospect: the career journey for every Virginia Tech student",
  description:
    "Upload a resume and transcript. Four agents rank the live opportunity feed for you and build a semester roadmap of real VT courses, clubs and certifications.",
  openGraph: {
    title: "Prospect: the career journey for every Virginia Tech student",
    description:
      "The live opportunity feed, ranked for you, and the semester roadmap that closes the gaps. Built on the Databricks Data Intelligence Platform.",
    images: ["/og.png"],
  },
};

const INNER = "mx-auto w-full max-w-page";

const FEED_POINTS = [
  "Every watched board is re-read every 30 minutes, so a posting reaches you while it is still open.",
  "Each row says in words why it fits your goal, instead of handing you a bare score.",
  "Requirements are split into met and unknown, so you can see what a posting does not tell you.",
] as const;

const ROADMAP_POINTS = [
  "Every task on a role is labelled Human-led, AI-assisted or Automatable.",
  "What is missing becomes a semester plan of real courses, clubs, projects and certifications.",
  "Each step says why it is there and which roles it moves you toward.",
] as const;

const PRIVACY_POINTS = [
  "Your resume and transcript are read in memory and never stored as files.",
  "The structured profile that comes out of them is yours. Everyone sees the same public feed; nobody sees your profile.",
  "Ask us to delete it and it is deleted.",
] as const;

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ motion?: string }>;
}) {
  const [stats, feed, params, supabase] = await Promise.all([
    getPublicStats(),
    getPublicFeed(),
    searchParams,
    createClient(),
  ]);

  // v9: /welcome?view=landing lets a signed-in visitor back onto the landing, so
  // the page has to recognise them and every sign-in CTA becomes a link into the
  // app instead.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  // Development only: forces every reveal to its settled state so a screenshot
  // is deterministic. Guarded by NODE_ENV.
  const settled = process.env.NODE_ENV !== "production" && params.motion === "final";

  const newest = feed[0]?.added ?? null;
  const liveLine =
    stats.openRoles === null
      ? "The feed refreshes every 30 minutes."
      : `${formatStat(stats.openRoles)} open postings, newest ${newest ?? "in the last few hours"}`;

  return (
    <SettledProvider settled={settled}>
      <a
        href="#main"
        className="sr-only rounded-pill bg-text text-bg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:flex focus:min-h-11 focus:items-center focus:px-5"
      >
        Skip to content
      </a>

      {/* Opens the landing on the hero when it was entered without a fragment. */}
      <OpenOnHero />
      <LandingNav signedIn={signedIn} />
      <SignInDialog />
      <ScrollProgress />

      <main id="main" className="overflow-x-clip">
        {/* 1 ------------------------------------------------------------- */}
        <Hero liveLine={liveLine} signedIn={signedIn} />

        {/* 2 + 3 ---------------------------------------------------------- */}
        <StatementBand />
        <ScreenshotStrip />

        {/* 4 --------------------------------------------------------------- */}
        <StatsRow stats={stats} />

        {/* 4b: the boards Prospect watches, 50 marks across industries in two
            counter-scrolling rows (Karthik 2026-09-20: never "just big tech"). */}
        <section aria-labelledby="boards-heading" className="px-gutter pb-section">
          <div className={INNER}>
            <p id="boards-heading" className="font-label text-step-2xs uppercase tracking-label text-text-dim">
              Sourced from the boards we watch
            </p>
            <BoardsStrip />
            <BoardsList />
          </div>
        </section>

        {/* 5 --------------------------------------------------------------- */}
        <Showcase
          id="feed"
          eyebrow="Ranked feed"
          heading="Real postings, found early."
          body="The live feed covers internships, co-ops, new-grad, full-time and research roles in every major, ranked best to least for your goal."
          points={FEED_POINTS}
          shot="feed"
          shotCaption="The ranked feed"
          signedIn={signedIn}
          ctaLabel="See my ranked feed"
        />

        {/* 6 --------------------------------------------------------------- */}
        <Showcase
          id="roadmap"
          eyebrow="Semester roadmap"
          heading="Know which of your skills hold their value."
          body="Every role breaks down into tasks, and every task carries a label with its meaning. The plan that follows is built from real Virginia Tech courses, clubs and certifications."
          points={ROADMAP_POINTS}
          shot="roadmap"
          shotCaption="The semester roadmap"
          media="left"
          ground="raised"
          signedIn={signedIn}
          ctaLabel="Build my roadmap"
        >
          <div className="mt-6">
            <LabelLegend />
            <p className="mt-3 max-w-[54ch] text-pretty text-step-xs leading-body text-text-dim">
              {LABEL_SOURCE}
            </p>
          </div>
        </Showcase>

        {/* 7 --------------------------------------------------------------- */}
        <section id="labels" aria-labelledby="labels-heading" className="bg-bg px-gutter py-section">
          <div className={INNER}>
            <Rise>
              <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
                Before and after
              </p>
            </Rise>
            <TextReveal
              as="h2"
              id="labels-heading"
              text="The same posting, read twice."
              granularity="word"
              className="font-display mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
            />
            <Rise delay={0.06}>
              <p className="mt-6 max-w-[54ch] text-pretty text-step-1 leading-body text-text-dim">
                On the left, a posting that is open right now, exactly as its board publishes it. On
                the right, the record Prospect reads out of it.
              </p>
            </Rise>
          </div>
          <div className="mt-12">
            <BeforeAfter row={feed[0] ?? null} />
          </div>
        </section>

        {/* 8 --------------------------------------------------------------- */}
        <FeatureCards openRoles={stats.openRoles} signedIn={signedIn} />

        {/* 9 --------------------------------------------------------------- */}
        <UnderTheHood />

        {/* 10 -------------------------------------------------------------- */}
        <ArtBand work={RISING_WAVES} labelledBy="privacy-heading" id="privacy">
          <TextReveal
            as="h2"
            id="privacy-heading"
            text="Privacy by design."
            granularity="word"
            tone="ink-text"
            className="font-display max-w-[14ch] text-balance text-step-5 leading-display text-ink-text lg:text-step-6"
          />
          <ul className="mt-6 flex max-w-[54ch] flex-col gap-3">
            {PRIVACY_POINTS.map((point, index) => (
              <Rise as="li" key={point} delay={index * 0.05}>
                <span className="text-pretty text-step-0 leading-body text-ink-text/90">
                  {point}
                </span>
              </Rise>
            ))}
          </ul>
          <Rise delay={0.2}>
            <Link
              href="/privacy"
              className="mt-6 inline-flex min-h-11 items-center text-step-0 text-ink-text underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text"
            >
              Read the privacy page
            </Link>
          </Rise>
        </ArtBand>

        {/* 11 -------------------------------------------------------------- */}
        <ArtBand work={CELESTIAL} labelledBy="get-started-heading" id="get-started" align="center">
          <div className="text-center">
            <TextReveal
              as="h2"
              id="get-started-heading"
              text="Find your fit. Build your plan."
              granularity="word"
              tone="ink-text"
              className="font-display mx-auto max-w-[16ch] text-balance text-step-5 leading-display text-ink-text lg:text-step-6"
            />
            <Rise delay={0.06}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <SignInCta tone="ink" label="Get started" signedIn={signedIn} />
                <a
                  href="#feed"
                  className="inline-flex h-12 items-center rounded-pill border border-ink-text/40 px-5 text-step-0 font-medium text-ink-text hover:border-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  See the live feed
                </a>
              </div>
            </Rise>
            {signedIn ? null : (
              <Rise delay={0.12}>
                <p className="mx-auto mt-6 max-w-[46ch] text-pretty text-step-xs text-ink-text/75">
                  {SIGN_IN_REASON}
                </p>
              </Rise>
            )}
          </div>
        </ArtBand>
      </main>

      {/* Footer ----------------------------------------------------------- */}
      <footer className="bg-raised px-gutter pb-10 pt-section">
        <div className={INNER}>
          <div className="flex flex-col gap-12 border-t border-hairline pt-12 lg:flex-row lg:justify-between">
            <Rise className="flex items-center gap-3">
              <SignInCta signedIn={signedIn} />
              <BackToTop />
            </Rise>

            <nav aria-label="Footer" className="flex gap-16">
              <Rise>
                <h3 className="font-label text-step-2xs uppercase tracking-label text-text-dim">
                  Product
                </h3>
                <ul className="mt-4 flex flex-col text-step-xs">
                  {[
                    { label: "Live feed", href: "#feed" },
                    { label: "Roadmap", href: "#roadmap" },
                    { label: "Features", href: "#features" },
                    { label: "Under the hood", href: "#under-the-hood" },
                  ].map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className="inline-flex min-h-11 items-center text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Rise>
              <Rise delay={0.06}>
                <h3 className="font-label text-step-2xs uppercase tracking-label text-text-dim">
                  Legal
                </h3>
                <ul className="mt-4 flex flex-col text-step-xs">
                  {[
                    { label: "Privacy", href: "/privacy" },
                    { label: "Terms", href: "/terms" },
                    { label: "Help and FAQ", href: "/faq" },
                  ].map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="inline-flex min-h-11 items-center text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <FeedbackLink className="text-text-dim hover:text-text" />
                  </li>
                </ul>
              </Rise>
            </nav>
          </div>

          <Rise className="mt-12">
            {/* Decorative outro wordmark. --text-unrevealed is 1.53:1 on --bg,
                which is why this is aria-hidden and duplicated by the nav logo. */}
            <p
              aria-hidden="true"
              className="font-display select-none text-step-hero leading-hero text-text-unrevealed"
            >
              Prospect
            </p>
            <p className="mt-6 font-sans text-step-2xs tabular-nums text-text-dim">
              © 2026 Prospect. Built at VTHacks 14. Verify every posting on the employer&rsquo;s
              site.
            </p>
          </Rise>
        </div>
      </footer>
    </SettledProvider>
  );
}
