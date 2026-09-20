import { ArtBand } from "@/components/landing/art-band";
import { GEESE } from "@/components/landing/art";
import { ScrollVelocityMarquee } from "@/components/motion/scroll-velocity-marquee";
import { Rise } from "@/components/landing/rise";
import { listMockShots } from "@/components/landing/mocks";

// Section 2: "Welcome to" + the giant wordmark over a full-bleed art band, then
// a horizontal strip of REAL app screenshots.
// Spec: build/research/wishlabs/components/02-wordmark.md.
//
// The band reuses the existing `ArtBand` machinery (parallax layer, <picture>
// theme sources, measured ink scrim) rather than a new full-bleed component —
// the work it carries is the geese print, re-dithered into the VT ramp.
//
// The marquee is the existing client primitive: it couples to scroll velocity,
// pauses on pointer and on focus, and renders ONE static wrapped row under
// Settled / prefers-reduced-motion. Nothing new was written for it.
//
// MISSION D-UI6: the strip reads public/mocks/*.png. Until the orchestrator
// drops real captures in, it renders a named empty state and no placeholder art.

// 320x176 per shot: the reference's image band reads as wide cards, and an app
// screenshot is still legible at that size on a 390 phone.
const SHOT = "mr-4 h-44 w-80 shrink-0 rounded-card border border-hairline object-cover";

export function WordmarkBand() {
  return (
    <ArtBand work={GEESE} labelledBy="welcome-heading" id="welcome" align="center">
      <div className="text-center">
        <Rise>
          <p className="font-label text-step-2xs uppercase tracking-label text-ink-text/75">
            Welcome to
          </p>
        </Rise>
        <h2
          id="welcome-heading"
          className="font-display mt-3 text-step-hero leading-hero text-ink-text"
        >
          Prospect
        </h2>
        <Rise delay={0.06}>
          <p className="mx-auto mt-4 max-w-[46ch] text-pretty text-step-1 text-ink-text/90">
            The career journey for every Virginia Tech student, in one place.
          </p>
        </Rise>
      </div>
    </ArtBand>
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
