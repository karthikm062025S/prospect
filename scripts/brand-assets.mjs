import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

// ponytail: sharp is supplied transitively by Next; do not add it to package.json.

// Single source of truth: Karthik's real logo (public/brand/prospect-logo.svg,
// a vendored copy of ../prospect-logo.svg). 8 maroon (#711731) paths spell
// "prospect" left to right; 1 orange (#D6681D) path is the sparkle above the
// o, 2 orange paths (#D6681D + #EE8A32) are the gold nugget inside the o.
// build/MISSION.md D2/D5: letters recolor to VT maroon, orange paths to VT
// orange (a lighter tint on one nugget facet is fine). This script derives
// app/icon.svg, app/apple-icon.png and public/og.png from that one file each
// run, so all three (and components/logo.tsx's React copy of the same path
// data) stay pinned to the same art and the same palette.
const root = fileURLToPath(new URL("..", import.meta.url));
const logoPath = path.join(root, "public", "brand", "prospect-logo.svg");
const iconPath = path.join(root, "app", "icon.svg");
const applePath = path.join(root, "app", "apple-icon.png");
const ogPath = path.join(root, "public", "og.png");
const fontPath = path.join(root, "public", "fonts", "InstrumentSerif-Regular.ttf");

const MAROON = "#861F41"; // --sage light (app/globals.css)
const MAROON_DARK = "#e79aae"; // --sage dark
const ACCENT = "#E5751F"; // --accent, same in both themes
const ACCENT_LIGHT = "#EC9857"; // lighter tint of ACCENT, the inner nugget facet -- matches
// components/brand/wordmark.tsx's WORDMARK_COLORS.orangeTint (L2a), so the
// generated favicon/apple-icon/OG and the React wordmark never drift apart.
const CREAM = "#faf7f2"; // --raised, the warm cream panel
const INK_TEXT = "#241419"; // --text, 16.53:1 on --raised

// The "o" letter + nugget's padded ink box (5% padding), and the full
// wordmark's padded ink box (2% padding) -- measured once off the real
// artwork (sharp .trim(), see the L4 handoff) and kept in sync with the same
// constants in components/logo.tsx.
// Same crop components/brand/wordmark.tsx's MARK_VIEWBOX uses (L2a), so the
// favicon/apple-icon frame the "o" identically to the React <Mark/>.
const MARK_VIEWBOX = "1163 862 520 520";
// The OG image wants a TIGHT crop of the full lockup (unlike wordmark.tsx's
// full 4096x2236 canvas, which stays wide open for the hero's rise-in
// animation) -- measured off the real art via sharp .trim(), 2% padding.
const WORDMARK_VIEWBOX = "144 636 3856 1056";
const WORDMARK_ASPECT = 3856 / 1056;

function parsePath(tag) {
  const d = tag.match(/\sd="([^"]+)"/)?.[1];
  const fill = tag.match(/\sfill="([^"]+)"/)?.[1];
  const transform = tag.match(/\stransform="([^"]+)"/)?.[1];
  if (!d || !fill || !transform) throw new Error("malformed path in prospect-logo.svg: " + tag.slice(0, 80));
  return { d, fill, transform };
}

async function loadLogoParts() {
  const svg = await readFile(logoPath, "utf8");
  const tags = svg.match(/<path[^>]*\/>/g) ?? [];
  if (tags.length !== 11) throw new Error(`expected 11 paths in prospect-logo.svg, found ${tags.length}`);
  const parsed = tags.map(parsePath);
  const letters = parsed
    .filter((p) => p.fill === "#711731")
    .sort((a, b) => Number(a.transform.match(/[-\d.]+/)[0]) - Number(b.transform.match(/[-\d.]+/)[0]));
  const oLetter = letters.find((p) => p.transform.includes("1441.5625,875.3125"));
  const sparkle = parsed.find((p) => p.fill === "#D6681D" && p.transform.includes("1664,675"));
  const nuggetBase = parsed.find((p) => p.fill === "#D6681D" && p.transform.includes("1410.8125,1032.3125"));
  const nuggetFacet = parsed.find((p) => p.fill === "#EE8A32");
  if (letters.length !== 8 || !oLetter || !sparkle || !nuggetBase || !nuggetFacet) {
    throw new Error("prospect-logo.svg classification mismatch (letters/sparkle/nugget)");
  }
  return { letters, oLetter, sparkle, nuggetBase, nuggetFacet };
}

const p = (part, fill) => `<path d="${part.d}" transform="${part.transform}" fill="${fill}"/>`;

const { letters, oLetter, sparkle, nuggetBase, nuggetFacet } = await loadLogoParts();

// --- app/icon.svg: the "o" + nugget mark, light/dark aware (same trick the
// previous hand-authored file used: a .letter class plus a
// prefers-color-scheme override, so the browser tab favicon adapts). ---
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" width="64" height="64" role="img" aria-label="Prospect">
  <title>Prospect</title>
  <style>.letter{fill:${MAROON}}</style>
  <style>@media (prefers-color-scheme: dark){ .letter{fill:${MAROON_DARK}} }</style>
  <path class="letter" d="${oLetter.d}" transform="${oLetter.transform}"/>
  ${p(nuggetBase, ACCENT)}
  ${p(nuggetFacet, ACCENT_LIGHT)}
</svg>
`;
await writeFile(iconPath, iconSvg);

// --- app/apple-icon.png: the same mark, light colors (cream ground), 132px
// centered on a 180x180 cream square (unchanged geometry from the prior file). ---
const appleMark = await sharp(Buffer.from(iconSvg))
  .resize(132, 132, { fit: "contain" })
  .png()
  .toBuffer();

await sharp({
  create: { width: 180, height: 180, channels: 4, background: CREAM },
})
  .composite([{ input: appleMark, left: 24, top: 24 }])
  .png()
  .toFile(applePath);

// --- public/og.png: the FULL wordmark (it already spells "Prospect", so no
// separate name text), centered on cream, tagline below in Instrument Serif.
// D10 (Karthik): the page's own spacing rhythm, not a floating mark in empty
// space -- one centered lockup + tagline block, not a small icon parked in a
// corner with the name typed out separately. ---
const fontBase64 = (await readFile(fontPath)).toString("base64");

const wordmarkHeight = 140;
const wordmarkWidth = Math.round(wordmarkHeight * WORDMARK_ASPECT);
const wordmarkX = Math.round((1200 - wordmarkWidth) / 2);
const gap = 40; // rhythm gap between the lockup and the tagline
const taglineSize = 30;
const blockHeight = wordmarkHeight + gap + Math.round(taglineSize * 1.3);
const wordmarkY = Math.round((630 - blockHeight) / 2);
const taglineY = wordmarkY + wordmarkHeight + gap + Math.round(taglineSize * 0.8);

const wordmarkMarkup = [
  ...letters.map((l) => p(l, MAROON)),
  p(sparkle, ACCENT),
  p(nuggetBase, ACCENT),
  p(nuggetFacet, ACCENT_LIGHT),
].join("\n    ");

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      @font-face {
        font-family: "Instrument Serif";
        src: url("data:font/truetype;base64,${fontBase64}") format("truetype");
        font-weight: 400;
        font-style: normal;
      }
      .brand { font-family: "Instrument Serif"; font-weight: 400; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="${CREAM}"/>
  <svg x="${wordmarkX}" y="${wordmarkY}" width="${wordmarkWidth}" height="${wordmarkHeight}" viewBox="${WORDMARK_VIEWBOX}">
    ${wordmarkMarkup}
  </svg>
  <text class="brand" x="600" y="${taglineY}" text-anchor="middle" font-size="${taglineSize}" fill="${INK_TEXT}">The career journey for every Virginia Tech student.</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(ogPath);

async function verify(relativePath, expectedWidth, expectedHeight) {
  const absolutePath = path.join(root, relativePath);
  const { width, height } = await sharp(absolutePath).metadata();
  console.log(`${relativePath}: ${width}x${height}`);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${relativePath} must be ${expectedWidth}x${expectedHeight}`);
  }
}

await verify(path.join("app", "apple-icon.png"), 180, 180);
await verify(path.join("public", "og.png"), 1200, 630);
console.log("app/icon.svg regenerated from public/brand/prospect-logo.svg");
