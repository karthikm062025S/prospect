import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// v8 D1, reverted onto Prospect by mission D-UI12 (T0's sans-weight display
// face was rejected on sight, "use my design system"): exactly 4 font
// families (Satoshi, IBM Plex Mono, Instrument Serif, Departure Mono). Zilla
// Slab, Playwrite and T0's retired display face are all removed entirely,
// and their former roles (font-serif, font-hand) are gone from every
// component.

const LAYOUT = "app/layout.tsx";
const GLOBALS = "app/globals.css";
const RETIRED_DISPLAY_FACE = ["d", "m", "s", "a", "n", "s"].join(""); // avoid the literal in this file's own source

test("app/layout.tsx loads exactly 3 local faces plus Fontshare Satoshi, and no retired one", () => {
  const source = fs.readFileSync(LAYOUT, "utf8");
  for (const retired of [/zilla/i, /playwrite/i, new RegExp(RETIRED_DISPLAY_FACE, "i")]) {
    assert.doesNotMatch(source, retired, `${retired} must be fully removed from app/layout.tsx`);
  }
  // Satoshi is loaded from Fontshare's CDN (Fontshare Free Font EULA forbids
  // redistributing the .woff2 files from a public repo/host), not next/font/local.
  const calls = source.match(/localFont\(/g) ?? [];
  assert.strictEqual(calls.length, 3, `expected exactly 3 localFont( calls, found ${calls.length}`);
  assert.match(source, /api\.fontshare\.com\/v2\/css\?f\[\]=satoshi@/, "Satoshi must load from the Fontshare CSS API");
  for (const variable of ["--font-instrument-serif", "--font-departure", "--font-plex-mono"]) {
    assert.match(source, new RegExp(variable), `${variable} must be declared`);
  }
  assert.match(fs.readFileSync(GLOBALS, "utf8"), /--font-satoshi:\s*"Satoshi"/, "--font-satoshi must be declared in globals.css");
});

test("the retired display face's font files and self-hosted Satoshi are gone from public/fonts", () => {
  for (const file of fs.readdirSync("public/fonts")) {
    assert.doesNotMatch(
      file.toLowerCase(),
      new RegExp(RETIRED_DISPLAY_FACE),
      `${file} is an orphan of the display-face revert and must be deleted`,
    );
    assert.doesNotMatch(file.toLowerCase(), /^satoshi-.*\.woff2$/, `${file} must be loaded from Fontshare, not self-hosted`);
  }
  for (const file of ["public/fonts/InstrumentSerif-Regular.ttf", "public/fonts/DepartureMono-Regular.woff2"]) {
    assert.ok(fs.existsSync(file), `${file} is required by app/layout.tsx`);
  }
});

const ROOTS = ["app", "components"];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : entryPath.endsWith(".tsx") ? [entryPath] : [];
  });
}

test("no file under app/ or components/ uses font-serif or font-hand", () => {
  const violations: string[] = [];
  for (const file of ROOTS.flatMap(walk)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [i, line] of source.split("\n").entries()) {
      if (/font-serif|font-hand/.test(line)) violations.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(violations, []);
});
