import type { StaticImageData } from "next/image";

import heroWideLight from "../../public/art/twilight-wide-poster-light.png";
import heroWideDark from "../../public/art/twilight-wide-poster-dark.png";
import heroTallLight from "../../public/art/twilight-tall-poster-light.png";
import heroTallDark from "../../public/art/twilight-tall-poster-dark.png";
import celestialLight from "../../public/art/celestial-northern-poster-light.png";
import celestialDark from "../../public/art/celestial-northern-poster-dark.png";
import wavesLight from "../../public/art/rising-waves-poster-light.png";
import wavesDark from "../../public/art/rising-waves-poster-dark.png";

// v7 D20 item 3. The art series: public-domain works, one treatment, two
// themes. Redesign 2026-09-19: the hero carries a painted twilight sky (the
// Wishlabs composition, our museum art) in the same dither; the geese band is
// folded into the hero and its posters stay on disk, unreferenced.
//
// Fold 1 removes credit lines and identity metadata from the rendered page,
// including alt text. Alt text describes only what the image shows.
//
// Static imports let the bundler emit content-hashed media while proxy.ts also
// keeps direct art paths and the slashless image optimizer path public for
// signed-out visitors.
//
// Only the baked posters render. They preserve each image's calibrated tone
// curve, keep the contrast gate tied to the pixels visitors see, and avoid
// adding a second visual treatment over the same art. PaperTexture remains on
// the sheet surface.
//
// Posters are plain <img>, NOT next/image, for a second reason: the files are
// already exactly sized and encoded as PNG-8 with a 4-entry palette (see
// scripts/art-assets.mjs), and Next's optimizer would lossy-re-encode them to
// WebP/AVIF, which on a 4-colour ordered dither measures 555.8 KB against
// PNG-8's 68.7 KB for the same image and smears the flat palette. width and
// height come off the static import, so there is no layout shift either way.
//
// Theme swap is CSS, not JS: .art-light / .art-dark in app/globals.css follow
// the same [data-theme] + prefers-color-scheme rules as the colour tokens, so
// the correct poster is painted on the first frame with no flash.

export type ArtWork = {
  light: StaticImageData;
  dark: StaticImageData;
  /** Plain description of the picture. Never a title, artist or museum. */
  alt: string;
};

export const HERO_WIDE: ArtWork = {
  light: heroWideLight,
  dark: heroWideDark,
  alt: "Dithered painting of a crimson twilight sky over a dark wooded lake",
};

export const HERO_TALL: ArtWork = {
  light: heroTallLight,
  dark: heroTallDark,
  alt: HERO_WIDE.alt,
};

export const CELESTIAL: ArtWork = {
  light: celestialLight,
  dark: celestialDark,
  alt: "Dithered engraving of a star chart with constellation figures",
};

export const RISING_WAVES: ArtWork = {
  light: wavesLight,
  dark: wavesDark,
  alt: "Dithered woodblock design of a cresting wave",
};

// Tailwind's `sm` breakpoint, which is where the hero swapped its 9:16 crop
// for the 16:9 one with `hidden sm:block`. One constant, so the media query
// and the layout rule it replaced cannot drift apart.
const WIDE_CROP_FROM = "(min-width: 640px)";

/**
 * Both theme posters, stacked; CSS picks one. `priority` marks the LCP image.
 *
 * `wide` is an optional second crop. PERF (v7 perf lane): the hero used to
 * mount BOTH crops behind `hidden sm:block` / `sm:hidden`, and `display: none`
 * does not stop an <img> downloading, so every visitor paid for all four
 * posters (192 KB) in order to look at one. A <picture> `media` source is the
 * platform's own answer: the browser resolves the query BEFORE it fetches, so
 * a phone requests only the tall crop and a desktop only the wide one. Same
 * pixels, half the art bytes, no JS.
 *
 * The theme class stays on a plain <div>: it has to sit on an element whose
 * default display comes from the UA sheet (specificity 0), or the
 * `.art-dark { display: none }` rule in globals.css would be fighting a
 * utility class of equal weight. The <picture> is `display: contents`, so it
 * adds nothing to layout and the <img> still sizes against that div.
 */
export function ArtPoster({
  work,
  wide,
  priority = false,
}: {
  work: ArtWork;
  wide?: ArtWork;
  priority?: boolean;
}) {
  const common = {
    draggable: false,
    decoding: "async" as const,
    fetchPriority: priority ? ("high" as const) : ("auto" as const),
    loading: priority ? ("eager" as const) : ("lazy" as const),
  };
  const themes = [
    { theme: "art-light", base: work.light, wider: wide?.light },
    { theme: "art-dark", base: work.dark, wider: wide?.dark },
  ];
  return (
    <>
      {themes.map(({ theme, base, wider }) => (
        <div key={theme} className={`${theme} size-full`}>
          <picture className="contents">
            {wider ? (
              <source
                media={WIDE_CROP_FROM}
                srcSet={wider.src}
                width={wider.width}
                height={wider.height}
              />
            ) : null}
            <img
              {...common}
              alt={work.alt}
              src={base.src}
              width={base.width}
              height={base.height}
              className="size-full object-cover"
            />
          </picture>
        </div>
      ))}
    </>
  );
}
