import { ScrollVelocityMarquee } from "@/components/motion/scroll-velocity-marquee";
import { Rise } from "@/components/landing/rise";
import { TextReveal } from "@/components/motion/text-reveal";
import { listMockShots } from "@/components/landing/mocks";

// Section 2, redesign 2026-09-19: the "Welcome to" + wordmark moved INTO the
// hero (the reference opens on the wordmark), so this band is the reference's
// cream statement block: one word-revealed sentence, one sub line, on --bg.
// Then the horizontal strip of REAL app screenshots.
// Spec: build/research/wishlabs/components/02-wordmark.md (layout + rhythm).
//
// The marquee is the existing client primitive: it couples to scroll velocity,
// pauses on pointer and on focus, and renders ONE static wrapped row under
// Settled / prefers-reduced-motion. Nothing new was written for it.
//
// The strip reads public/mocks/*.png. Until real captures are dropped in,
// it renders a named empty state and no placeholder art.

// 320x176 per shot: the reference's image band reads as wide cards, and an app
// screenshot is still legible at that size on a 390 phone.
const SHOT = "mr-4 h-44 w-80 shrink-0 rounded-card border border-hairline object-cover";

const STATEMENT = "Find the roles worth your time. Build the skills AI can't replace.";
const STATEMENT_SUB =
  "Upload a resume and an unofficial transcript. Four agents rank the live opportunity feed for your goal and turn what is missing into a semester plan of real Virginia Tech courses, clubs and certifications.";

export function StatementBand() {
  return (
    <section id="welcome" aria-labelledby="welcome-heading" className="bg-bg px-gutter py-section">
      <div className="mx-auto w-full max-w-page text-center">
        <Rise>
          <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
            Every major. Every role.
          </p>
        </Rise>
        <TextReveal
          as="h2"
          id="welcome-heading"
          text={STATEMENT}
          granularity="word"
          className="font-display mx-auto mt-4 max-w-[18ch] text-balance text-step-5 leading-display text-text lg:text-step-6"
        />
        <Rise delay={0.06}>
          <p className="mx-auto mt-6 max-w-[60ch] text-pretty text-step-1 leading-body text-text-dim">
            {STATEMENT_SUB}
          </p>
        </Rise>
      </div>
    </section>
  );
}

export function ScreenshotStrip() {
  const shots = listMockShots();

  return (
    <section aria-labelledby="strip-heading" className="bg-bg py-section">
      <h2 id="strip-heading" className="sr-only">
        Inside the app
      </h2>
      {shots.length === 0 ? (
        <div className="px-gutter">
          <div className="mx-auto flex w-full max-w-page flex-col items-center rounded-card border border-dashed border-hairline bg-raised px-6 py-12 text-center">
            <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
              App screenshots pending
            </p>
            <p className="mt-3 max-w-[44ch] text-pretty text-step-0 text-text-dim">
              Real captures of the running app land in public/mocks and this strip fills itself. No
              placeholder art ships in their place.
            </p>
          </div>
        </div>
      ) : (
        <ScrollVelocityMarquee baseVelocity={34} className="scout-drift-edge-fade">
          {shots.map((shot) => (
            // The file list is read at request time, so next/image's
            // build-time optimisation has nothing to work with. Explicit
            // width/height keeps CLS at zero either way.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={shot.src}
              src={shot.src}
              alt={shot.alt}
              width={320}
              height={176}
              className={SHOT}
            />
          ))}
        </ScrollVelocityMarquee>
      )}
    </section>
  );
}
