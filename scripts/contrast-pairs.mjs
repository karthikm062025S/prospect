#!/usr/bin/env node
// ponytail: sharp is read here for the over-scrim sampling only. It ships
// transitively with next (next/image), the same reason scripts/art-assets.mjs
// uses it; nothing in the app graph imports this file.
import { readFileSync } from "node:fs";
import sharp from "sharp";

// scripts/contrast-check.mjs does not export its helpers, so this keeps the
// same WCAG sRGB luminance and alpha-compositing formulas while reading the
// live theme values directly from app/globals.css.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// v7 D20 added a second `:root` block for the type/space ladder, which sits
// ABOVE the palette. So this walks every block with the selector and returns
// the one that actually declares --bg, not simply the first match.
function cssBlock(selector) {
  const needle = `${selector} {`;
  for (let start = css.indexOf(needle); start >= 0; start = css.indexOf(needle, start + 1)) {
    const open = css.indexOf("{", start);
    let depth = 1;
    for (let i = open + 1; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") depth -= 1;
      if (depth === 0) {
        const body = css.slice(open + 1, i);
        if (body.includes("--bg:")) return body;
        break;
      }
    }
  }
  throw new Error(`Missing CSS block with a palette: ${selector}`);
}

function tokens(selector) {
  const block = cssBlock(selector);
  return Object.fromEntries(
    [...block.matchAll(/--(bg|raised|text|text-dim|text-unrevealed-ink|text-unrevealed|sage|accent|danger|ink|ink-text|hairline):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function parseColor(value) {
  if (value.startsWith("#")) {
    const number = Number.parseInt(value.slice(1), 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255, a: 1 };
  }
  const match = value.match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\)/);
  if (!match) throw new Error(`Unsupported color: ${value}`);
  return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
}

function composite(foreground, background) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const channel = (raw) => {
    const value = raw / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foregroundValue, backgroundValue, alpha = 1) {
  const background = parseColor(backgroundValue);
  const raw = parseColor(foregroundValue);
  const foreground = composite({ ...raw, a: raw.a * alpha }, background);
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const themes = {
  light: tokens(":root"),
  dark: tokens('[data-theme="dark"]'),
};

const pairs = [
  // ---- v7 D20 landing tokens (item 1 + item 7) ----
  ["D20 body text / page", "text", "bg", 1, 4.5],
  ["D20 body text / raised", "text", "raised", 1, 4.5],
  ["D20 dim text / page", "text-dim", "bg", 1, 4.5],
  ["D20 dim text / raised", "text-dim", "raised", 1, 4.5],
  ["D20 sage step number / page", "sage", "bg", 1, 4.5],
  ["D20 sage step number / raised", "sage", "raised", 1, 4.5],
  // The accent is never a control's ground on the page: #e69a6f is 2.12:1 on
  // --bg and cannot carry a 1.4.11 boundary there. Its ONE use as a fill is
  // the hero's circular arrow, which sits on the ink scrim and wears a 2px
  // --ink-text ring; both of those are what is gated here.
  ["D20 accent fill / ink scrim", "accent", "ink", 1, 3],
  ["D20 arrow glyph / accent fill", "ink", "accent", 1, 3],
  // WCAG 1.4.11 asks that a control be distinguishable from ADJACENT colours.
  // The hero arrow's 2px ring is --ink-text against the ink scrim, which is
  // the pair below; the ring against its own fill is 1.80:1 and is not a
  // 1.4.11 requirement (the fill is inside the boundary, not adjacent to it).
  ["D20 arrow ring / ink scrim", "ink-text", "ink", 1, 3],
  // D22 feedback pill in the nav capsule: accent fill on --raised.
  ["D22 feedback label / accent fill", "ink", "accent", 1, 4.5],
  ["D22 feedback ring / capsule", "text", "raised", 1, 3],
  ["D20 ink-text / ink band", "ink-text", "ink", 1, 4.5],
  // v8 D13: --danger is body text (error copy, destructive labels), so it is
  // gated on both grounds in both themes, not merely reported.
  ["D13 danger text / page", "danger", "bg", 1, 4.5],
  ["D13 danger text / raised", "danger", "raised", 1, 4.5],
  // ---- pre-existing v6/v7 pairs ----
  ["inactive chip text / page", "text-dim", "bg", 1, 4.5],
  ["inactive chip outline / page", "text-dim", "bg", 1, 3],
  ["active chip text / fill", "bg", "text", 1, 4.5],
  ["active chip fill / page", "text", "bg", 1, 3],
  ["dropdown label / surface", "text-dim", "raised", 1, 4.5],
  ["dropdown value / surface", "text", "raised", 1, 4.5],
  ["dropdown outline / page", "text-dim", "bg", 1, 3],
  ["selected option text / fill", "bg", "text", 1, 4.5],
];

let failed = false;
for (const [theme, themeTokens] of Object.entries(themes)) {
  console.log(`${theme.toUpperCase()} THEME`);
  for (const [label, foreground, background, alpha, minimum] of pairs) {
    const ratio = contrast(themeTokens[foreground], themeTokens[background], alpha);
    const pass = ratio >= minimum;
    failed ||= !pass;
    console.log(`${label.padEnd(38)} ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`);
  }
  // Fold 1 item 5: the transient pre-reveal colours are now GATED at 3:1, not
  // merely reported. They never render under prefers-reduced-motion or
  // ?motion=final (the reveal is skipped and the text paints at its `to`
  // colour), but they are real body text while a visitor is scrolling.
  for (const [label, token, ground, minimum] of [
    ["unrevealed text / page", "text-unrevealed", "bg", 3],
    ["unrevealed text / raised", "text-unrevealed", "raised", 3],
    ["unrevealed ink text / ink", "text-unrevealed-ink", "ink", 3],
  ]) {
    const ratio = contrast(themeTokens[token], themeTokens[ground], 1);
    const pass = ratio >= minimum;
    failed ||= !pass;
    console.log(`${label.padEnd(38)} ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`);
  }
  const previousCount = contrast(themeTokens.bg, themeTokens.text, 0.7);
  const currentCount = contrast(themeTokens.bg, themeTokens.text);
  console.log(`active count before (70% bg)`.padEnd(34), `${previousCount.toFixed(2)}:1`);
  console.log(`active count after (solid bg)`.padEnd(34), `${currentCount.toFixed(2)}:1`);
  console.log("");
}

// ---------------------------------------------------------------------------
// v7 D20 item 4.1 / 4.4 / 7: text over the art scrims, measured on real pixels.
//
// Each poster is 4-colour PNG-8, so "the darkest and lightest 10% of the scrim
// area" is sampled directly rather than guessed: every pixel inside the copy's
// rectangle is composited under the scrim's own alpha at that point, the
// contrast against --ink-text is computed, and the 10th/90th percentiles plus
// the absolute worst pixel are reported.
//
// The gradient stops below MIRROR app/globals.css. Two approximations, both
// stated: the hero's horizontal veil is authored at 100deg and is modelled on
// the x axis (a 10 degree tilt over a 16:9 box moves the sampled alpha by
// under 0.02), and object-cover cropping is ignored, which samples MORE of the
// poster than any viewport actually shows.
// The scrim gradients in app/globals.css are hardcoded rgb(34 47 48) in BOTH
// themes (they sit over the art posters, not over the --ink token), so v8 D13's
// darker dark-theme --ink does not move them and this constant still mirrors
// the CSS.
const INK = "rgb(34 47 48)";
const INK_TEXT = "#e8e4df";

/** Interpolates a CSS gradient's alpha stops. `t` is 0 at the first stop. */
function alphaAt(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i][0]) {
      const [p0, a0] = stops[i - 1];
      const [p1, a1] = stops[i];
      return a0 + ((t - p0) / (p1 - p0)) * (a1 - a0);
    }
  }
  return stops.at(-1)[1];
}

// .scout-hero-scrim: horizontal veil over a bottom-up veil.
const HERO_H = [
  [0, 0.4],
  [0.6, 0.3],
  [1, 0],
];
const HERO_V = [
  [0, 0.76],
  [0.55, 0.68],
  [1, 0.06],
];
// Below 640px the copy runs the full width, so the horizontal veil (which
// fades to 0 on the right) cannot be relied on. The narrow media query in
// app/globals.css replaces both veils with one heavier bottom-up gradient.
const HERO_NARROW_V = [
  [0, 0.86],
  [0.55, 0.82],
  [1, 0.24],
];
// .scout-scrim
const BAND_V = [
  [0, 0.8],
  [0.46, 0.74],
  [0.8, 0.3],
  [1, 0.14],
];
// .scout-scrim-even (the coverage band)
const EVEN_V = [
  [0, 0.82],
  [0.35, 0.72],
  [0.75, 0.72],
  [1, 0.66],
];

const BANDS = [
  {
    label: "hero H1 over whirlpool",
    slug: "naruto-whirlpools-wide",
    // Copy column: left 72% of the frame, bottom 62% of it.
    rect: { x0: 0, x1: 0.72, y0: 0.38, y1: 1 },
    scrim: (x, yFromBottom) =>
      1 - (1 - alphaAt(HERO_H, x)) * (1 - alphaAt(HERO_V, yFromBottom)),
  },
  {
    label: "hero H1 over whirlpool (9:16)",
    slug: "naruto-whirlpools-tall",
    rect: { x0: 0, x1: 1, y0: 0.38, y1: 1 },
    scrim: (_x, yFromBottom) => alphaAt(HERO_NARROW_V, yFromBottom),
  },
  {
    label: "band line over geese",
    slug: "descending-geese",
    rect: { x0: 0, x1: 1, y0: 0.55, y1: 1 },
    scrim: (_x, yFromBottom) => alphaAt(BAND_V, yFromBottom),
  },
  {
    label: "coverage over star chart",
    slug: "celestial-northern",
    rect: { x0: 0, x1: 1, y0: 0.12, y1: 0.94 },
    scrim: (_x, yFromBottom) => alphaAt(EVEN_V, yFromBottom),
  },
  {
    label: "sign-off over rising waves",
    slug: "rising-waves",
    rect: { x0: 0, x1: 1, y0: 0.55, y1: 1 },
    scrim: (_x, yFromBottom) => alphaAt(BAND_V, yFromBottom),
  },
];

const ink = parseColor(INK);

async function measureBand(band, theme) {
  const file = `public/art/${band.slug}-poster-${theme}.png`;
  const { data, info } = await sharp(file)
    .resize({ width: 240 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ratios = [];
  for (let y = 0; y < info.height; y += 1) {
    const ny = y / (info.height - 1);
    if (ny < band.rect.y0 || ny > band.rect.y1) continue;
    for (let x = 0; x < info.width; x += 1) {
      const nx = x / (info.width - 1);
      if (nx < band.rect.x0 || nx > band.rect.x1) continue;
      const i = (y * info.width + x) * info.channels;
      const base = { r: data[i], g: data[i + 1], b: data[i + 2], a: 1 };
      const alpha = band.scrim(nx, 1 - ny);
      const ground = composite({ ...ink, a: alpha }, base);
      const fg = parseColor(INK_TEXT);
      const first = luminance(fg);
      const second = luminance(ground);
      ratios.push((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05));
    }
  }
  ratios.sort((a, b) => a - b);
  const at = (q) => ratios[Math.floor(q * (ratios.length - 1))];
  return { min: ratios[0], p10: at(0.1), p90: at(0.9), max: ratios.at(-1), n: ratios.length };
}

console.log("TEXT OVER ART SCRIMS (--ink-text on the real poster pixels)");
for (const theme of ["light", "dark"]) {
  for (const band of BANDS) {
    const r = await measureBand(band, theme);
    const pass = r.p10 >= 4.5 && r.p90 >= 4.5;
    const worst = r.min >= 4.5;
    failed ||= !pass;
    console.log(
      `${theme.padEnd(5)} ${band.label.padEnd(30)} p10 ${r.p10.toFixed(2)}  p90 ${r.p90.toFixed(2)}  worst px ${r.min.toFixed(2)}  ${pass ? "PASS" : "FAIL"}${worst ? "" : "  (worst pixel under 4.5)"}`,
    );
  }
}
console.log("");

if (failed) process.exitCode = 1;
