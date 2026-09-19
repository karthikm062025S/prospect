import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// v8 D1: exactly 4 font families (Satoshi, IBM Plex Mono, Instrument Serif,
// Departure Mono). Zilla Slab and Playwrite are removed entirely, and their
// former roles (font-serif, font-hand) are gone from every component.

const LAYOUT = "app/layout.tsx";

test("app/layout.tsx has no Zilla or Playwrite and exactly 4 localFont calls", () => {
  const source = fs.readFileSync(LAYOUT, "utf8");
  assert.doesNotMatch(source, /zilla/i, "Zilla Slab must be fully removed from app/layout.tsx");
  assert.doesNotMatch(source, /playwrite/i, "Playwrite must be fully removed from app/layout.tsx");
  const calls = source.match(/localFont\(/g) ?? [];
  assert.strictEqual(calls.length, 4, `expected exactly 4 localFont( calls, found ${calls.length}`);
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
