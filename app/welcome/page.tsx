import type { Metadata } from "next";
import Link from "next/link";
import { ArtBand } from "@/components/landing/art-band";
import { BoardsList, BoardsStrip } from "@/components/landing/boards-strip";
import { CELESTIAL, GEESE, RISING_WAVES } from "@/components/landing/art";
import { CoverageOdometer } from "@/components/landing/coverage-odometer";
import { FeedPreview } from "@/components/landing/feed-preview";
import { SignInCta, SIGN_IN_REASON } from "@/components/landing/sign-in-cta";
import { SignInDialog } from "@/components/landing/sign-in-dialog";
import { HandLine } from "@/components/landing/hand-line";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { OpenOnHero } from "@/components/landing/open-on-hero";
import { PinnedSteps } from "@/components/landing/pinned-steps";
import { Rise } from "@/components/landing/rise";
import { SheetTexture } from "@/components/landing/sheet-texture";
import { ProgressiveBlur } from "@/components/motion/progressive-blur";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { BackToTop, FeedbackButton, FeedbackLink } from "@/components/landing/feedback";
import {
  ArticleIcon,
  BookmarkSimpleIcon,
  FunnelIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  SignInIcon,
} from "@/components/landing/icons";
import { SettledProvider } from "@/components/motion/settled";
import { TextReveal } from "@/components/motion/text-reveal";
import { createClient } from "@/lib/supabase/server";
import { getPublicFeed } from "@/lib/public-feed";
import { getPublicStats } from "@/lib/public-stats";
import { formatStat } from "@/lib/public-stats-format";

// v7 D20: the public landing, design pass 2. Every D19 content decision is
// unchanged (outcome copy, live feed preview, 3-step how-to); what changed is
// the visual layer: the four-work public-domain art series, the token type
// scale, the scroll-tied reveals and the sheet-over-art layering.
//
// Server component. Every animated piece is an island under
// components/landing/ or components/motion/.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Scout: apply early, without refreshing career pages",
  description:
    "Scout watches about 1,000 employer job boards and shows you what is new, for your term and your kind of role. Browse without an account. Track what you applied to, privately.",
  openGraph: {
    title: "Scout: apply early, without refreshing career pages",
    description:
      "See what went live on about 1,000 employer job boards, filtered to your term and your kind of role. No account needed to look.",
    images: ["/og.png"],
  },
};

// Horizontal rhythm: --gutter (24px below 640, 48px above) around a 1280px
// container. Vertical: --section-y (72px below 1024, 128px above).
const BAND = "px-gutter py-section";
const INNER = "mx-auto w-full max-w-page";

// D19.3: every title is an outcome and every body opens with what the reader
// gets, not with what the product has.
const FEATURES = [
  {
    Icon: FunnelIcon,
    title: "You only see roles you would actually apply to",
    body: "You get Summer 2027 through Summer 2028 and co-op in one list, narrowed to software, AI/ML, data, quant, product, security, hardware or design.",
  },
  {
    Icon: LockKeyIcon,
    title: "Nobody sees what you applied to",
    body: "Your applications, your outreach and your notes stay yours. Everyone shares the same feed; nobody shares your tracking.",
  },
  {
    Icon: ArticleIcon,
    title: "You read the posting without opening a tab",
    body: "The job description opens inside Scout with the site chrome stripped out, and the employer's page is one click away when you are ready to apply.",
  },
] as const;

// D19.3/4: the literal how-to.
const STEPS = [
  {
    n: "01",
    Icon: MagnifyingGlassIcon,
    title: "Browse",
    body: "Filter the feed by term and role, then open the employer's page, with no account and nothing to set up.",
  },
  {
    n: "02",
    Icon: SignInIcon,
    title: "Sign in when you find one",
    body: "Google or email, about ten seconds, and Scout asks you for nothing else.",
  },
  {
    n: "03",
    Icon: BookmarkSimpleIcon,
    title: "Track it",
    body: "Mark it applied, keep your notes and a timeline.",
  },
] as const;

const EYEBROW = "font-label text-step-2xs uppercase tracking-label text-text-dim";
// The scale steps are fixed px, so the responsive move is choosing a lower
// step below 1024 rather than a clamp: 40px at 390, 56px at 1440.
const H2 =
  "font-display mt-4 max-w-[18ch] text-balance text-step-4 leading-display tracking-display text-text lg:text-step-5";

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

  // v9: /welcome?view=landing lets a signed-in visitor back onto the landing
  // (the logo in components/tab-bar.tsx), so the page has to recognise them.
  // Every sign-in CTA below becomes a link into the app instead. Reading the
  // session cookie makes the route dynamic; the proxy already made it so, and
  // the cached feed/stats above are untouched.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  // D20 item 9. Development only: forces every reveal to its settled state so
  // a screenshot is deterministic. Guarded by NODE_ENV, so a production build
  // ignores the parameter entirely.
  const settled = process.env.NODE_ENV !== "production" && params.motion === "final";

  // No em dash in a rendered string, so the null path is its own sentence
  // rather than formatStat's "—".
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

      {/* v9: opens the landing on the hero when it was entered without a
          fragment (sign-out, an expired session, the signed-out gate). */}
      <OpenOnHero />
      <LandingNav signedIn={signedIn} />
      {/* v8 onboarding: the one sign-in dialog every SignInCta opens. */}
      <SignInDialog />
      {/* D26: the 2px accent read-progress hairline; null when settled. */}
      <ScrollProgress />

      <main id="main" className="overflow-x-clip">
        {/* ---------------- 1. Hero, pinned over the whirlpool ---------------- */}
        <Hero liveLine={liveLine} signedIn={signedIn} />

        {/* ---------------- 2. The sheet rises over the art ----------------
            --bg surface, 28px top radius, hairline top edge, paper grain.
            -24vh pulls its top edge up into the last stretch of the hero pin,
            which is the whole "sheet over art" move. */}
        <div className="scout-sheet relative z-10 -mt-[24vh] bg-bg">
          {/* The sheet's own top edge, over the art it is rising past: a
              stacked backdrop-blur ramp so the art dissolves into the sheet
              instead of meeting it on a hard line. Sits ABOVE the sheet
              (-top-16), because inside it there is nothing to blur. */}
          <ProgressiveBlur
            direction="bottom"
            blurLayers={6}
            blurIntensity={0.6}
            className="pointer-events-none absolute inset-x-0 -top-16 h-16"
          />
          <SheetTexture />

          <section id="feed" aria-labelledby="feed-heading" className={`relative ${BAND}`}>
            <div className={INNER}>
              <Rise>
                <p className={EYEBROW}>Live feed</p>
              </Rise>
              <TextReveal
                as="h2"
                id="feed-heading"
                text="What went live recently."
                granularity="word"
                className={H2}
              />
              <FeedPreview rows={feed} total={stats.openRoles} signedIn={signedIn} />
            </div>
          </section>

          {/* ---------------- 3. Three pinned statements, word by word ------- */}
          {/* No top padding (fold 1 item 4): the feed band's own 128px bottom
              padding is the whole gap, and the pin length lives in the
              runway's height rather than in space above the statements. */}
          <section id="story" aria-labelledby="story-heading" className="relative px-gutter pb-section">
            <h2 id="story-heading" className="sr-only">
              What Scout changes
            </h2>
            <div className={INNER}>
              <PinnedSteps />
            </div>
          </section>
        </div>

        {/* ---------------- 4. Art band: the flock, sighted ---------------- */}
        <ArtBand work={GEESE} labelledBy="sighted-heading">
          <TextReveal
            as="h2"
            id="sighted-heading"
            text="Sighted before the crowd."
            granularity="word"
            tone="ink-text"
            className="font-display max-w-[12ch] text-balance text-step-5 leading-display tracking-display text-ink-text lg:text-step-6"
          />
        </ArtBand>

        {/* ---------------- 5. How to use Scout ---------------- */}
        <section id="how-to" aria-labelledby="how-to-heading" className={`bg-bg ${BAND}`}>
          <div className={INNER}>
            <Rise>
              <p className={EYEBROW}>Get started</p>
            </Rise>
            <TextReveal
              as="h2"
              id="how-to-heading"
              text="How to use Scout, in three steps."
              granularity="word"
              className={H2}
            />
            <ol className="mt-6 grid gap-6 lg:grid-cols-3">
              {STEPS.map(({ n, Icon, title, body }, i) => (
                <Rise as="li" key={n} delay={i * 0.06}>
                  <span className="flex size-11 items-center justify-center rounded-pill bg-sage/10 text-sage">
                    <Icon size={24} />
                  </span>
                  {/* The step number is sage, not the warm accent: #e69a6f is
                      2.11:1 on --bg and cannot carry text there at any size.
                      Sage is 7.4:1 on --bg and 5.9:1 on the night --raised. */}
                  <p className="font-sans mt-5 text-step-2xs tabular-nums tracking-label text-sage">
                    {n}
                  </p>
                  <h3 className="font-display mt-2 text-step-3 leading-title text-text">{title}</h3>
                  <p className="mt-3 max-w-[38ch] text-pretty text-step-0 leading-body text-text-dim">
                    {body}
                  </p>
                </Rise>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- 6. Coverage, on the star chart ---------------- */}
        <ArtBand work={CELESTIAL} labelledBy="coverage-heading" id="coverage" align="center">
          <Rise>
            <p className="font-label text-step-2xs uppercase tracking-label text-ink-text/75">
              Coverage
            </p>
          </Rise>
          <TextReveal
            as="h2"
            id="coverage-heading"
            text="What Scout is watching right now."
            granularity="word"
            tone="ink-text"
            className="font-display mt-4 max-w-[18ch] text-balance text-step-3 leading-display tracking-display text-ink-text lg:text-step-4"
          />
          <Rise className="mt-6">
            <CoverageOdometer
              items={[
                { label: "Boards watched", value: stats.boardsWatched, approx: true },
                { label: "Companies", value: stats.companies },
                { label: "Postings open now", value: stats.openRoles },
                { label: "Added in the last day", value: stats.addedLast24h },
              ]}
            />
          </Rise>
        </ArtBand>

        {/* ---------------- 7. What you get ---------------- */}
        <section id="features" aria-labelledby="features-heading" className={`bg-bg ${BAND}`}>
          <div className={INNER}>
            <Rise>
              <p className={EYEBROW}>What you get</p>
            </Rise>
            <TextReveal
              as="h2"
              id="features-heading"
              text="Fewer tabs. Earlier applications."
              granularity="word"
              className={H2}
            />
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {FEATURES.map(({ Icon, title, body }, i) => (
                <Rise
                  as="li"
                  key={title}
                  delay={i * 0.06}
                  className="scout-card rounded-card border border-hairline bg-raised p-6"
                >
                  <span className="flex size-11 items-center justify-center rounded-pill bg-sage/10 text-sage">
                    <Icon size={24} />
                  </span>
                  <h3 className="mt-5 text-balance text-step-1 font-medium leading-title text-text">{title}</h3>
                  <p className="mt-3 text-pretty text-step-0 leading-body text-text-dim">{body}</p>
                </Rise>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- 8. Boards we watch ---------------- */}
        <section aria-labelledby="boards-heading" className="bg-bg py-section">
          <div className="px-gutter">
            <div className={INNER}>
              <Rise>
                <p className={EYEBROW}>Boards we watch</p>
              </Rise>
              <h2 id="boards-heading" className="sr-only">
                Boards Scout watches
              </h2>
              <Rise delay={0.06}>
                <BoardsList />
              </Rise>
            </div>
          </div>
          <BoardsStrip />
        </section>

        {/* ---------------- 9. Why Scout ---------------- */}
        <section id="why" aria-labelledby="why-heading" className={`bg-raised ${BAND}`}>
          <div className={INNER}>
            {/* v7 S4 UI-EYES: the 68ch measure used to sit on the same element as
                max-w-page and lost the cascade to it, so these two paragraphs ran
                104ch and 93ch per line at >=1440. The cap belongs on an inner box,
                which also keeps the block flush with every other section's gutter
                instead of centring it. */}
            <div className="max-w-[68ch]">
              <Rise>
                <p className={EYEBROW}>Why this exists</p>
              </Rise>
              <h2 id="why-heading" className="sr-only">
                Why Scout exists
              </h2>
              {/* D14: the same word-by-word reveal every other section opens
                  with, so #why is no longer the one band that just fades. */}
              <div className="mt-6 space-y-4">
                <TextReveal
                  as="p"
                  text="I was refreshing the same career pages every morning, opening thirty tabs, and still finding out about a posting a day after it went up. The spreadsheet I kept to fix that lied to me within a week, because I only remembered to update it when something had already gone wrong."
                  granularity="word"
                  className="text-pretty text-step-1 leading-body"
                />
                <Rise delay={0.06}>
                  <p className="text-pretty text-step-1 leading-body text-text-dim">
                    Scout is the tool one student built for that grind, and it is open to everyone
                    now as an MVP. Some of it is rough and some of it is missing. It gets better
                    only through what you tell me.
                  </p>
                </Rise>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- The one handwritten line, on the wave ---------- */}
        <ArtBand work={RISING_WAVES} labelledBy="sign-off-heading">
          <h2 id="sign-off-heading" className="sr-only">
            Built by a student
          </h2>
          <Rise>
            {/* PERF: HandLine is this same <p>; it only defers WHEN the
                150 KB Playwrite face is requested. See hand-line.tsx. */}
            <HandLine className="max-w-[14ch] text-balance text-step-5 leading-display tracking-display text-ink-text lg:text-step-6">
              Built by a student who got tired of refreshing career pages.
            </HandLine>
          </Rise>
        </ArtBand>

        {/* ---------------- 10. Close ---------------- */}
        <section id="feedback" aria-labelledby="close-heading" className={`bg-bg ${BAND}`}>
          <div className={INNER}>
            <TextReveal
              as="h2"
              id="close-heading"
              text="Find it first. Track it privately."
              granularity="word"
              className={`${H2} !mt-0`}
            />
            <Rise>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
                <SignInCta signedIn={signedIn} />
                <FeedbackButton />
                <Link
                  href="#feed"
                  className="inline-flex min-h-11 items-center text-step-0 text-text-dim underline underline-offset-4 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  Or just look at the feed
                </Link>
              </div>
              {signedIn ? null : (
                <p className="mt-4 max-w-[46ch] text-pretty text-step-xs text-text-dim">
                  {SIGN_IN_REASON}
                </p>
              )}
            </Rise>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className={`bg-raised px-gutter pb-10 pt-section`}>
        <div className={INNER}>
          <div className="flex flex-col gap-12 border-t border-hairline pt-12 lg:flex-row lg:justify-between">
            <Rise className="flex items-center gap-3">
              <SignInCta signedIn={signedIn} />
              <BackToTop />
            </Rise>

            <nav aria-label="Footer" className="flex gap-16">
              <Rise>
                <h3 className={EYEBROW}>Product</h3>
                <ul className="mt-4 flex flex-col text-step-xs">
                  {[
                    { label: "Live feed", href: "#feed" },
                    { label: "How to use", href: "#how-to" },
                    { label: "Coverage", href: "#coverage" },
                    { label: "Features", href: "#features" },
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
                <h3 className={EYEBROW}>Legal</h3>
                <ul className="mt-4 flex flex-col text-step-xs">
                  {[
                    { label: "Privacy", href: "/privacy" },
                    { label: "Terms", href: "/terms" },
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

          <Rise className="mt-14">
            {/* Decorative outro wordmark. --text-unrevealed is 1.53:1 on --bg
                in light, which is why this is aria-hidden and duplicated by
                the real wordmark in the nav. */}
            <p
              aria-hidden="true"
              className="font-display select-none text-step-hero leading-hero tracking-display text-text-unrevealed"
            >
              Scout
            </p>
            <p className="mt-6 font-sans text-step-2xs tabular-nums text-text-dim">
              © 2026 Scout. An MVP. Verify every posting on the employer&rsquo;s site.
            </p>
          </Rise>
        </div>
      </footer>
    </SettledProvider>
  );
}
