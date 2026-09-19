#!/usr/bin/env node
// WCAG contrast calculator for the slice-3 token pairs (04-uiux-brief.md §1).
// No deps — same approach as spike 3's swatch check. Run: node scripts/contrast-check.mjs
function parseColor(c) {
  c = c.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = c.match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  throw new Error("bad color: " + c);
}
function composite(fg, bgOpaque) {
  const a = fg.a;
  return {
    r: fg.r * a + bgOpaque.r * (1 - a),
    g: fg.g * a + bgOpaque.g * (1 - a),
    b: fg.b * a + bgOpaque.b * (1 - a),
  };
}
function relLum({ r, g, b }) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fgSpec, bgSpec) {
  const bg = parseColor(bgSpec); // bg assumed opaque
  const fgRaw = parseColor(fgSpec);
  const fg = fgRaw.a < 1 ? composite(fgRaw, bg) : fgRaw;
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// Tokens as defined in app/globals.css.
const LIGHT = {
  bg: "#f9f6ee",
  raised: "#ffffff",
  text: "#18181b",
  textDim: "#6b6b74",
  sage: "#2d5a43",
  danger: "#a8391f",
  // named in 04-uiux-brief §1 but not yet wired as app tokens (deferred to the
  // slice that introduces them) — computed anyway per the doc's binding check.
  coral: "#e07a5f",
  lavender: "#e8d5ff",
  tan: "#e6d5c3",
};
const DARK = {
  bg: "#12161a",
  raised: "#1d2225",
  text: "#b9c2bd",
  textDim: "rgb(185 194 189 / 0.7)",
  sage: "#6f9c8c",
  danger: "#e07a5f",
  blue: "#7595ae",
};

const AA_TEXT = 4.5;
const AA_UI = 3.0;

function row(label, fg, bg, min) {
  const r = contrast(fg, bg);
  const pass = r >= min ? "PASS" : "FAIL";
  console.log(`${label.padEnd(38)} ${r.toFixed(2)}:1  (need ${min}:1)  ${pass}`);
}

console.log("--- LIGHT (warm-cream) ---");
row("text on bg", LIGHT.text, LIGHT.bg, AA_TEXT);
row("text on raised", LIGHT.text, LIGHT.raised, AA_TEXT);
row("text-dim on bg", LIGHT.textDim, LIGHT.bg, AA_TEXT);
row("text-dim on raised", LIGHT.textDim, LIGHT.raised, AA_TEXT);
row("sage (accent) on bg", LIGHT.sage, LIGHT.bg, AA_TEXT);
row("sage (accent) on raised", LIGHT.sage, LIGHT.raised, AA_UI);
row("danger on bg", LIGHT.danger, LIGHT.bg, AA_TEXT);
row("danger on raised", LIGHT.danger, LIGHT.raised, AA_TEXT);
row("coral (doc4 alert, not a text token) on bg", LIGHT.coral, LIGHT.bg, AA_TEXT);
row("ink on lavender (doc4 CTA, not yet wired)", LIGHT.text, LIGHT.lavender, AA_TEXT);
row("ink on tan (doc4 badge, not yet wired)", LIGHT.text, LIGHT.tan, AA_TEXT);

console.log("\n--- DARK (Balanced Grove) ---");
row("text on bg", DARK.text, DARK.bg, AA_TEXT);
row("text on raised", DARK.text, DARK.raised, AA_TEXT);
row("text-dim on bg", DARK.textDim, DARK.bg, AA_TEXT);
row("text-dim on raised", DARK.textDim, DARK.raised, AA_TEXT);
row("sage (accent) on bg", DARK.sage, DARK.bg, AA_TEXT);
row("sage (accent) on raised", DARK.sage, DARK.raised, AA_UI);
row("danger on bg", DARK.danger, DARK.bg, AA_TEXT);
row("danger on raised", DARK.danger, DARK.raised, AA_TEXT);
row("blue (doc4, not yet wired) on bg", DARK.blue, DARK.bg, AA_TEXT);

console.log("\nhairline is decorative (border only) — no contrast requirement.");
