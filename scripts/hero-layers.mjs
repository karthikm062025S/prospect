// Cuts Karthik's sunset-valley painting into the four parallax layers the
// landing hero composes (back to front: sky, far ridges, mid hills, near trees).
//
// Deterministic and repo-local: `node scripts/hero-layers.mjs` copies
// ../landing.jpg into public/art/hero/full.jpg (when the painting is present),
// then rebuilds every layer from that committed copy, so the script keeps
// working after the repo is cloned on its own.
//
// The source is one painted frame with no channel to key on, so the cut is two
// measured curves plus two traced zones. Every constant below is tuned to THIS
// painting at 1024x576; re-tune them if the artwork is ever repainted.
//
//   skyTop[x]   the skyline. Scanning down a column, the sky is a pure vertical
//               gradient that only ever gets brighter, so the first row that is
//               DROP darker than the row three above it is where the sky ends.
//               That finds the far ridge crest even where atmospheric haze makes
//               it nearly the same colour as the sky — a flat colour-distance
//               threshold cannot. This is also the silhouette that occludes the
//               wordmark, so L2 places type against this curve.
//   hillTop[x]  the crest of the first SOLID hill under the haze: the first row
//               HILL_RATIO darker than the ridge crest in that same column. A
//               bright river reflection fools it over a ~25px window near the
//               centre, so the curve is median-smoothed over 31 columns.
//   near        foreground. The near trees and the wooded slope behind the tent
//               are the same tone (both L 10-60), so no luminance threshold can
//               separate them. ZONE_LEFT/ZONE_RIGHT are traced by hand to say
//               which slope is foreground; DARK_L then finds the real leaf edges
//               inside them, and the zone edge is crossed with a wide feather
//               because that boundary is invented, not painted. ROCK is traced
//               too — the rock, gold pan and pickaxe are light grey and gold, so
//               no darkness rule would ever find them.
//
// Every layer is opaque from its own top edge all the way DOWN to the frame
// bottom, which is what makes the parallax hole-proof: a front layer moving up
// can only ever uncover the layer behind it, never a gap.
//   sky     opaque over the whole frame — the gradient above the skyline (edge
//           trees swapped out for the sky's own row colour), then the horizon
//           row held downward and faded into the painting's blurred ground tones
//   ridges  opaque below skyTop[x]; dissolves into haze below the hill crest so
//           the layer never reads as a second sharp copy of the scene
//   hills   opaque below hillTop[x], with the near masses smeared out behind
//   near    the tree/rock cut-out itself (the frontmost layer)
// Both fills fade back to real paint over the last BOTTOM_KEEP rows, since that
// strip is exactly what a front layer uncovers. Alphas are gaussian-feathered
// ~3px so no edge reads as a jaggy cut.
//
// Outputs (public/art/hero/): sky/ridges/hills/near .png + .webp, full.jpg
// (the untouched original) and preview.png (the four composited back-to-front
// with near up 40px, hills up 20px, ridges up 8px — the no-hole proof).
//
// NOTE for whoever composes these: translating a 576-tall layer up by N px
// leaves its last N rows empty by definition. The layer behind covers it, but a
// full-bleed hero should still overscan (draw each layer at height 100% + the
// largest shift) so the parallax range stays inside the bitmap.

import sharp from 'sharp';
import { mkdir, copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'public', 'art', 'hero');
const PAINTING = path.join(ROOT, '..', 'landing.jpg');
const FULL = path.join(OUT, 'full.jpg');

const W = 1024;
const H = 576;

// --- constants tuned to this painting --------------------------------------
const SKY_L = 330, SKY_R = 880; // columns that are pure sky above HORIZON
const HORIZON = 232;            // last row that is sky across all of SKY_L..SKY_R
const SCAN_TOP = 176;           // rows the skyline can live in
const SCAN_BOT = 340;
const DROP = 2;                 // luminance fall over 3 rows that means "not sky"
const SKY_DEV = 34;             // |px - skyRow| above this = not sky (edge trees)
const HILL_RATIO = 0.8;         // hill crest is 20% darker than the ridge crest
const DARK_L = 72;              // near trees sit under this luminance
const INPAINT_BLUR = 22;        // smear radius behind the near masses in hills
const ZONE_FEATHER = 9;         // soft crossing of the near/mid slope boundary
const HOLD_SMOOTH = 40;         // horizontal smoothing of the held horizon row
const HAZE_LEAD = 14;           // rows below the hill crest ridges stays sharp
const HAZE_SPAN = 30;           // rows over which ridges dissolves into haze
const BOTTOM_KEEP = 56;         // last rows kept sharp — this is the strip a
                                // front layer uncovers, so it must be real paint
const FEATHER = 1.4;            // gaussian sigma on the alpha -> ~3px soft edge
const SHIFTS = { ridges: 8, hills: 20, near: 40 }; // preview parallax offsets

// Rock + gold pan + pickaxe silhouette, traced off the painting. They are light
// grey/gold, so no luminance rule finds them; this is their outline, bottom-right.
const ROCK = [
  [1024, 576], [1024, 412], [986, 424], [948, 437], [912, 447], [876, 452],
  [854, 449], [836, 466], [812, 474], [784, 477], [752, 476], [722, 478],
  [704, 484], [694, 502], [690, 522], [672, 530], [650, 546], [626, 562],
  [606, 576],
];

// Where foreground is even allowed to be. The near trees and the wooded slope
// behind the tent are the same tone, so no threshold separates them — these two
// traced zones say which slope is foreground, and DARK_L then finds the actual
// leaf edges inside them. The tent and its clearing stay out of both, so they
// travel with the mid hills.
const ZONE_LEFT = [
  [0, 222], [70, 252], [140, 280], [210, 310], [280, 340], [350, 378],
  [410, 420], [440, 470], [470, 520], [485, 576], [0, 576],
];
const ZONE_RIGHT = [
  [1024, 190], [990, 198], [955, 208], [925, 235], [898, 268], [878, 305],
  [864, 350], [856, 400], [852, 440], ...ROCK.slice(6), [1024, 576],
];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** median of a window of a curve, then a box average — kills single-column noise. */
function smooth(curve, med = 7, box = 9) {
  const n = curve.length;
  const a = new Float32Array(n);
  const half = med >> 1;
  for (let i = 0; i < n; i++) {
    const w = [];
    for (let k = -half; k <= half; k++) w.push(curve[clamp(i + k, 0, n - 1)]);
    w.sort((p, q) => p - q);
    a[i] = w[half];
  }
  const b = new Float32Array(n);
  const hb = box >> 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -hb; k <= hb; k++) s += a[clamp(i + k, 0, n - 1)];
    b[i] = s / box;
  }
  return b;
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rasterize a polygon into a 0/1 mask (even-odd fill). */
function rasterize(poly, mask) {
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, Math.ceil(x1)); x++) {
      if (pointInPoly(poly, x + 0.5, y + 0.5)) mask[y * W + x] = 1;
    }
  }
  return mask;
}

/** Close the pinholes a per-pixel threshold leaves in a leaf canopy. */
async function closeHoles(mask, sigma, cut) {
  const a = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) a[i] = mask[i] ? 255 : 0;
  const { data, info } = await sharp(a, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = data[i * info.channels] >= cut ? 1 : 0;
  return out;
}

/**
 * What hills shows where the near trees were cut out of it. A heavy blur of the
 * painting itself: the colour under a tree stays that tree's own dark tone
 * instead of a pale wash, and only a ~40px sliver of it is ever uncovered by the
 * parallax, so a soft local smear is the right amount of inpainting.
 */
const inpaint = (rgb) =>
  sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).blur(INPAINT_BLUR).raw().toBuffer();

/** mask (0/1 per pixel) -> feathered 8-bit alpha plane */
async function feather(mask, sigma = FEATHER) {
  const a = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) a[i] = mask[i] ? 255 : 0;
  // sharp widens a 1-channel raw input to sRGB on output, so stride the result.
  const { data, info } = await sharp(a, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) out[i] = data[i * info.channels];
  return out;
}

/** RGB buffer + alpha plane -> RGBA buffer */
function rgba(rgb, alpha) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = rgb[i * 3];
    out[i * 4 + 1] = rgb[i * 3 + 1];
    out[i * 4 + 2] = rgb[i * 3 + 2];
    out[i * 4 + 3] = alpha[i];
  }
  return out;
}

async function writeLayer(name, buf) {
  const img = () => sharp(buf, { raw: { width: W, height: H, channels: 4 } });
  await img().png({ compressionLevel: 9 }).toFile(path.join(OUT, `${name}.png`));
  await img().webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(OUT, `${name}.webp`));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  if (await stat(PAINTING).catch(() => null)) await copyFile(PAINTING, FULL);
  if (!(await stat(FULL).catch(() => null))) {
    throw new Error(`No painting: neither ${PAINTING} nor ${FULL} exists`);
  }

  const src = await sharp(FULL).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = lum(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
  // horizontal 3px average kills jpeg noise before the column scans
  const Ls = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      Ls[p] = (L[y * W + clamp(x - 1, 0, W - 1)] + L[p] + L[y * W + clamp(x + 1, 0, W - 1)]) / 3;
    }
  }

  // --- 1. the sky's own row colours (median of the columns that are pure sky)
  const skyRow = new Float32Array(H * 3);
  for (let y = 0; y <= HORIZON; y++) {
    const ch = [[], [], []];
    for (let x = SKY_L; x < SKY_R; x++) for (let c = 0; c < 3; c++) ch[c].push(src[(y * W + x) * 3 + c]);
    for (let c = 0; c < 3; c++) {
      ch[c].sort((a, b) => a - b);
      skyRow[y * 3 + c] = ch[c][ch[c].length >> 1];
    }
  }

  // --- 2. skyline: first row where the column stops getting brighter
  const rawSkyTop = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let hit = SCAN_BOT;
    for (let y = SCAN_TOP; y < SCAN_BOT; y++) {
      const p = y * W + x;
      const dev =
        y <= HORIZON
          ? Math.abs(src[p * 3] - skyRow[y * 3]) +
            Math.abs(src[p * 3 + 1] - skyRow[y * 3 + 1]) +
            Math.abs(src[p * 3 + 2] - skyRow[y * 3 + 2])
          : 0;
      if (Ls[p] < Ls[(y - 3) * W + x] - DROP || dev > SKY_DEV) { hit = y; break; }
    }
    rawSkyTop[x] = hit;
  }
  const skyTop = smooth(rawSkyTop, 9, 7);

  // --- 3. hill crest: first row HILL_RATIO darker than the ridge crest above it
  const rawHillTop = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const top = Math.round(skyTop[x]);
    const crest = Ls[clamp(top + 1, 0, H - 1) * W + x];
    let hit = H - 1;
    for (let y = top; y < H; y++) {
      if (Ls[y * W + x] < crest * HILL_RATIO) { hit = y; break; }
    }
    rawHillTop[x] = Math.max(hit, top);
  }
  const hillTop = smooth(rawHillTop, 31, 11);

  // --- 4. near mask: edge-touching dark blobs + the traced rock silhouette
  // The top of the sky is a deep maroon and is darker than DARK_L, so the test
  // only runs below the skyline — nothing above it can be foreground.
  const dark = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      dark[p] = y >= skyTop[x] && L[p] < DARK_L ? 1 : 0;
    }
  }
  // The zone edge is crossed with a wide feather, not a cut: the two slopes are
  // one continuous canopy in the painting, so a hard boundary would tear it.
  const zone = new Uint8Array(W * H);
  rasterize(ZONE_LEFT, zone);
  rasterize(ZONE_RIGHT, zone);
  const canopy = await feather(await closeHoles(dark, 3, 96));
  const zoneSoft = await feather(zone, ZONE_FEATHER);
  const rock = await feather(rasterize(ROCK, new Uint8Array(W * H)));
  const nearAlpha = Buffer.alloc(W * H);
  const near = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    nearAlpha[i] = Math.max(Math.round((canopy[i] * zoneSoft[i]) / 255), rock[i]);
    near[i] = nearAlpha[i] > 110 ? 1 : 0;
  }

  const fill = await inpaint(src);

  // --- 5. sky: original above the skyline (edge trees swapped for the sky row),
  //        then the horizon row held downward and faded into the painting's own
  //        blurred foreground tones, so the strip it backstops is never a flat
  //        colour sitting under grey rock
  const skyRgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y <= HORIZON; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const dev =
        Math.abs(src[p * 3] - skyRow[y * 3]) +
        Math.abs(src[p * 3 + 1] - skyRow[y * 3 + 1]) +
        Math.abs(src[p * 3 + 2] - skyRow[y * 3 + 2]);
      const useSky = dev > SKY_DEV || y >= skyTop[x] - 2;
      for (let c = 0; c < 3; c++) skyRgb[p * 3 + c] = useSky ? skyRow[y * 3 + c] : src[p * 3 + c];
    }
  }
  // Held downward from a horizontally smoothed horizon row — smoothing it first
  // is what stops each column streaking its own slightly different sky colour.
  const hold = new Float32Array(W * 3);
  for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0];
    for (let k = -HOLD_SMOOTH; k <= HOLD_SMOOTH; k++) {
      const q = (HORIZON * W + clamp(x + k, 0, W - 1)) * 3;
      for (let c = 0; c < 3; c++) acc[c] += skyRgb[q + c];
    }
    for (let c = 0; c < 3; c++) hold[x * 3 + c] = acc[c] / (2 * HOLD_SMOOTH + 1);
  }
  for (let y = HORIZON + 1; y < H; y++) {
    const t = (y - HORIZON) / (H - 1 - HORIZON);
    const k = t * t * (3 - 2 * t); // smoothstep into the foreground dark
    for (let x = 0; x < W; x++) {
      const p = y * W + x, f = ((H - 1) * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        skyRgb[p * 3 + c] = clamp(Math.round(hold[x * 3 + c] * (1 - k) + fill[f + c] * k), 0, 255);
      }
    }
  }
  const skyFlat = await sharp(skyRgb, { raw: { width: W, height: H, channels: 3 } })
    .blur(1.2)
    .raw()
    .toBuffer();
  const skyAlpha = Buffer.alloc(W * H, 255);

  // --- 6. ridges + hills alphas from the two curves
  const ridgeMask = new Uint8Array(W * H);
  const hillMask = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (y >= skyTop[x]) ridgeMask[y * W + x] = 1;
      if (y >= hillTop[x]) hillMask[y * W + x] = 1;
    }
  }

  // Both fills fade back to the original paint over the last rows: that strip is
  // exactly what a front layer uncovers as it parallaxes up, so it has to be the
  // real ground, not a smear. A 20px offset of dark tree texture reads as nothing.
  const sharpen = (y) => clamp((y - (H - BOTTOM_KEEP - 24)) / 24, 0, 1);

  const ridgeRgb = Buffer.from(src);
  for (let x = 0; x < W; x++) {
    const start = hillTop[x] + HAZE_LEAD;
    for (let y = Math.max(0, Math.round(start)); y < H; y++) {
      const t = clamp((y - start) / HAZE_SPAN, 0, 1) * (1 - sharpen(y));
      const p = y * W + x;
      for (let c = 0; c < 3; c++) {
        ridgeRgb[p * 3 + c] = Math.round(src[p * 3 + c] * (1 - t) + fill[p * 3 + c] * t);
      }
    }
  }

  const hillRgb = Buffer.from(src);
  for (let i = 0; i < W * H; i++) {
    if (!near[i]) continue;
    const t = 1 - sharpen((i / W) | 0);
    for (let c = 0; c < 3; c++) {
      hillRgb[i * 3 + c] = Math.round(src[i * 3 + c] * (1 - t) + fill[i * 3 + c] * t);
    }
  }

  const layers = {
    sky: rgba(skyFlat, skyAlpha),
    ridges: rgba(ridgeRgb, await feather(ridgeMask)),
    hills: rgba(hillRgb, await feather(hillMask)),
    near: rgba(src, nearAlpha),
  };
  for (const [name, buf] of Object.entries(layers)) await writeLayer(name, buf);

  // --- 7. preview: back to front, each front layer parallaxed upward
  const canvas = Buffer.alloc(W * H * 3);
  const over = (buf, shift) => {
    for (let y = 0; y < H; y++) {
      const sy = y + shift;
      if (sy < 0 || sy >= H) continue;
      for (let x = 0; x < W; x++) {
        const s = (sy * W + x) * 4, d = (y * W + x) * 3;
        const a = buf[s + 3] / 255;
        if (a === 0) continue;
        for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + buf[s + c] * a);
      }
    }
  };
  over(layers.sky, 0);
  over(layers.ridges, SHIFTS.ridges);
  over(layers.hills, SHIFTS.hills);
  over(layers.near, SHIFTS.near);
  await sharp(canvas, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(path.join(OUT, 'preview.png'));

  const at = (curve, x) => Math.round(curve[x]);
  console.log(`hero layers -> ${path.relative(ROOT, OUT)} (${W}x${H})`);
  console.log(
    'skyline y  ' +
      [0, 128, 256, 384, 512, 640, 768, 896, 1023].map((x) => `${x}:${at(skyTop, x)}`).join('  '),
  );
  console.log(
    'hill crest ' +
      [0, 128, 256, 384, 512, 640, 768, 896, 1023].map((x) => `${x}:${at(hillTop, x)}`).join('  '),
  );
  let nearPx = 0;
  for (let i = 0; i < W * H; i++) nearPx += near[i];
  console.log(`near mask  ${((100 * nearPx) / (W * H)).toFixed(1)}% of frame`);
}

await main();
