#!/usr/bin/env node
// v7 D20 — builds the landing's art series from the four CC0 originals in
// C:\My_WorkSpace\design\art\scout\raw\ into public/art/.
//
// ponytail: sharp is not a declared dependency — it ships transitively with
// next (next/image uses it) and this script is a build-time asset step run by
// hand, never at request time. Upgrade path: if next ever drops sharp, add it
// as a devDependency; nothing in the app graph imports this file.
//
// One treatment for all four works, so the series reads as one thing:
//   luminance -> Bayer 8x8 ordered dither on a 2px grid -> 4-step quantise
//   -> re-tint into the theme ramp -> nearest-neighbour upscale to 1600px.
// The 2px grid is what makes the poster match the live ImageDithering shader
// (size: 2).
//
// Posters ship as PNG-8 with a 4-entry palette, NOT JPEG. Measured on the
// worst case (the Durer engraving, the densest linework of the four) at
// 1600px: JPEG q78 4:4:4 = 900.5 KB, q78 4:2:0 = 573.3 KB, q70 4:2:0 =
// 476.2 KB, WebP q80 = 555.8 KB, PNG-8 = 68.7 KB. A 4-colour ordered dither
// is maximal high-frequency detail with a 4-entry palette: JPEG cannot reach
// the 260 KB budget at any usable quality and rings around every dither cell,
// while PNG-8 is lossless and 4x under budget. next/image still re-encodes to
// WebP/AVIF on the wire.
//
// Run: node scripts/art-assets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAW = "C:/My_WorkSpace/design/art/scout/raw";
const OUT = path.join(process.cwd(), "public", "art");

const POSTER_WIDTH = 1600;
const PIXEL_GRID = 2; // device px per dither cell at the poster's own scale
const BUDGET_BYTES = 260 * 1024;

// 4-step tint ramps, darkest step first. Both are monotonic in WCAG relative
// luminance so the dither still reads as tone, not as colour noise:
//   light  0.026 / 0.401 / 0.615 / 0.900
//   dark   0.008 / 0.086 / 0.331 / 0.501
const RAMPS = {
  light: ["#222F30", "#E69A6F", "#CCCFCE", "#F7F7F5"],
  dark: ["#12161A", "#4C5253", "#D98B60", "#B9C2BD"],
};

// Tone curve, and the rule that goes with it.
//
// EVERY art surface on this landing is an ink surface: the hero and all three
// bands carry --ink-text copy over an --ink scrim in BOTH themes (--ink is
// theme-invariant, the same way app/globals.css already treats it). So both
// posters are tuned for an ink ground, not for their own theme's page ground,
// and the rule is one line: THE PRINT'S DOMINANT FIELD BECOMES THE DARK END OF
// THE RAMP, its subject becomes the ember and the highlight.
//
// Two of the four originals are ink on bright paper (the geese sheet, the
// Durer engraving), so for those the luminance is inverted first and the paper
// lands on the darkest step. The other two already read dark-field.
//
// Measured, not guessed: with the light poster at gamma 0.85 (its own page
// ground's curve) the hero composited under the measured scrim to a flat
// grey-green with no readable form. At 1.6 the same crop keeps the whirlpool's
// full structure as ember on ink and the over-scrim contrast RISES, because
// the poster's own lightest step drops.
const GAMMA = { light: 1.6, dark: 2.4, inverted: 0.85 };
// Bayer 8x8 ordered-dither matrix (values 0..63).
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// Crop rectangles measured against each original at full resolution. Every one
// excludes the print's own title cartouche, artist seal and paper margin, so no
// museum text is ever rendered as if it were Scout's.
const WORKS = [
  {
    slug: "naruto-whirlpools-wide",
    file: "aic-130577-hiroshige-naruto-whirlpools.jpg",
    crop: { left: 310, top: 2238, width: 1927, height: 1084 }, // 16:9
  },
  {
    slug: "naruto-whirlpools-tall",
    file: "aic-130577-hiroshige-naruto-whirlpools.jpg",
    crop: { left: 443, top: 1019, width: 1329, height: 2362 }, // 9:16
    posterWidth: 900,
  },
  {
    slug: "descending-geese",
    file: "aic-87083-hiroshige-descending-geese.jpg",
    crop: { left: 202, top: 0, width: 2596, height: 1180 }, // 2.2:1
    paperGround: true,
  },
  {
    slug: "celestial-northern",
    file: "met-358366-durer-celestial-northern.jpg",
    crop: { left: 0, top: 438, width: 1631, height: 917 }, // 16:9
    paperGround: true,
  },
  {
    slug: "rising-waves",
    file: "cma-154147-sekka-rising-waves.jpg",
    crop: { left: 1700, top: 430, width: 1696, height: 771 }, // 2.2:1, right of the book gutter
  },
];

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rec.709 luma, the same weighting the shader uses to pick a dither step. */
function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function ditherToRamp(input, ramp, gamma, invert, width) {
  const cellWidth = Math.round(width / PIXEL_GRID);
  const { data, info } = await sharp(input)
    .resize({ width: cellWidth, kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const palette = ramp.map(hexToRgb);
  const steps = palette.length;
  const out = Buffer.allocUnsafe(info.width * info.height * 3);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const raw = luma(data[i], data[i + 1], data[i + 2]);
      const value = (invert ? 1 - raw : raw) ** gamma;
      // Ordered dither: shift the threshold by the matrix cell, then quantise.
      const bias = (BAYER[y & 7][x & 7] / 64 - 0.5) / steps;
      const index = Math.min(steps - 1, Math.max(0, Math.floor((value + bias) * steps)));
      const [r, g, b] = palette[index];
      const o = (y * info.width + x) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize({ width, kernel: "nearest" })
    .png({ palette: true, colours: ramp.length, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

async function build() {
  await mkdir(OUT, { recursive: true });
  const report = [];

  for (const work of WORKS) {
    const cropped = await sharp(path.join(RAW, work.file)).extract(work.crop).toBuffer();
    const posterWidth = work.posterWidth ?? POSTER_WIDTH;

    for (const theme of ["light", "dark"]) {
      const invert = work.paperGround === true;
      const gamma = invert ? GAMMA.inverted : GAMMA[theme];
      const buffer = await ditherToRamp(cropped, RAMPS[theme], gamma, invert, posterWidth);
      const name = `${work.slug}-poster-${theme}.png`;
      // Written straight through: re-encoding the buffer with sharp again
      // would be a second lossy/deflate pass over an already-final image.
      await writeFile(path.join(OUT, name), buffer);
      report.push([name, posterWidth, buffer.length]);
    }

  }

  let over = false;
  for (const [name, width, size] of report) {
    const kb = (size / 1024).toFixed(1);
    const budgeted = name.includes("-poster-");
    const fail = budgeted && size > BUDGET_BYTES;
    over ||= fail;
    console.log(`${name.padEnd(40)} ${String(width).padStart(5)}px ${kb.padStart(8)} KB ${fail ? "OVER BUDGET" : ""}`);
  }
  if (over) {
    console.error(`\nAt least one poster is over the ${BUDGET_BYTES / 1024} KB budget.`);
    process.exitCode = 1;
  }
}

await build();
