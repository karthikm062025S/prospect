import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Prospect 2026-09-19 (CONTEXT 20:30): exactly 3 font families — DM Sans
// (display), Satoshi (body/controls), IBM Plex Mono (labels + code-like data).
// Zilla Slab, Playwrite, Instrument Serif and Departure Mono are all removed
// entirely, and their former roles (font-serif, font-hand) are gone from every
// component.

const LAYOUT = "app/layout.tsx";

test("app/layout.tsx loads exactly 3 faces and no retired one", () => {
  const source = fs.readFileSync(LAYOUT, "utf8");
  for (const retired of [/zilla/i, /playwrite/i, /instrument/i, /departure/i]) {
    assert.doesNotMatch(source, retired, `${retired} must be fully removed from app/layout.tsx`);
  }
  const calls = source.match(/localFont\(/g) ?? [];
  assert.strictEqual(calls.length, 3, `expected exactly 3 localFont( calls, found ${calls.length}`);
  for (const variable of ["--font-dm-sans", "--font-satoshi", "--font-plex-mono"]) {
    assert.match(source, new RegExp(variable), `${variable} must be declared`);
  }
});

const RETIRED_FILES = [
  "public/fonts/InstrumentSerif-Regular.ttf",
  "public/fonts/DepartureMono-Regular.woff2",
];

test("the retired font files are gone from public/fonts", () => {
  for (const file of RETIRED_FILES) {
    assert.ok(!fs.existsSync(file), `${file} is an orphan of the face retirement and must be deleted`);
  }
  for (const file of ["public/fonts/DMSans-Variable.ttf", "public/fonts/DMSans-Italic-Variable.ttf"]) {
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
