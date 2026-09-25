import { CheckIcon } from "@/components/landing/icons";
import { MockShot } from "@/components/landing/mock-shot";
import { Rise } from "@/components/landing/rise";
import { SignInCta } from "@/components/landing/sign-in-cta";
import { ParallaxMedia } from "@/components/motion/parallax-media";
import { TextReveal } from "@/components/motion/text-reveal";

// Sections 4 and 5: the two product bands, the reference's eyebrow + big
// heading + copy + image pattern, mirrored on the second one.
// Specs: build/research/wishlabs/components/04-feed.md and 05-roadmap.md.
//
// Extracted as ONE component because there are exactly two real uses (the
// component ladder's rung 4: a shared shape is earned by the second call site, not by the
// first). It takes no variant it does not have a caller for.

export type ShowcaseProps = {
  id: string;
  eyebrow: string;
  heading: string;
  body: string;
  points: readonly string[];
  /** The stem MockShot looks for in public/mocks. */
  shot: string;
  shotCaption: string;
  /** "right" is the default column order; "left" mirrors the band. */
  media?: "left" | "right";
  ground?: "bg" | "raised";
  signedIn: boolean;
  ctaLabel: string;
  children?: React.ReactNode;
};

export function Showcase({
  id,
  eyebrow,
  heading,
  body,
  points,
  shot,
  shotCaption,
  media = "right",
  ground = "bg",
  signedIn,
  ctaLabel,
  children,
}: ShowcaseProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`${ground === "raised" ? "bg-raised" : "bg-bg"} px-gutter py-section`}
    >
      <div className="mx-auto grid w-full max-w-page items-center gap-12 lg:grid-cols-2">
        <div className={media === "left" ? "lg:order-2" : undefined}>
          <Rise>
            <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
              {eyebrow}
            </p>
          </Rise>
          <TextReveal
            as="h2"
            id={headingId}
            text={heading}
            granularity="word"
            className="font-display mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
          />
          <Rise delay={0.06}>
            <p className="mt-6 max-w-[46ch] text-pretty text-step-1 leading-body text-text-dim">
              {body}
            </p>
          </Rise>
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((point, index) => (
              <Rise as="li" key={point} delay={0.12 + index * 0.05} className="flex gap-3">
                <span className="mt-1 shrink-0 text-sage">
                  <CheckIcon size={18} />
                </span>
                <span className="text-pretty text-step-0 leading-body text-text">{point}</span>
              </Rise>
            ))}
          </ul>
          {children}
          <Rise delay={0.3}>
            <SignInCta label={ctaLabel} signedIn={signedIn} className="mt-6" />
          </Rise>
        </div>

        {/* Depth: the shot travels at ~0.86x the copy column beside it and
            settles out of a small tilt as it enters (item 3). The
            island is the wrapper only — the shot itself still renders on the
            server and is passed in as children. */}
        <ParallaxMedia className={media === "left" ? "lg:order-1" : undefined}>
          <Rise delay={0.06}>
            <MockShot name={shot} caption={shotCaption} />
          </Rise>
        </ParallaxMedia>
      </div>
    </section>
  );
}
