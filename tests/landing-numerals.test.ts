import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOTS = ["app/welcome", "components/landing"];
// v7 S4 UI-EYES: /welcome also renders one component from outside those
// roots, the shared filter chips (components/landing/feed-preview.tsx imports
// it), and its count badge shipped in font-mono, i.e. IBM Plex Mono's dotted
// zero on the landing, which is what D25 bans. Files listed here are scanned
// alongside the roots.
const FILES = ["components/filter-chips.tsx"];
// The word "count" catches a numeral that reaches the tag through a prop,
// where no digit is literal in the body.
const FORBIDDEN = /[0-9]|\bcount\b|formatStat\(|toLocaleString\(|padStart\(/;
const LABEL_OR_MONO_TAG =
  /<([A-Za-z][\w.]*)\b(?=[^>]*\bclassName\s*=\s*(?:"[^"]*\bfont-(?:mono|label)\b[^"]*"|'[^']*\bfont-(?:mono|label)\b[^']*'|\{\s*`[^`]*\bfont-(?:mono|label)\b[^`]*`\s*\}))[^>]*>([\s\S]*?)<\/\1\s*>/g;

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : entryPath.endsWith(".tsx") ? [entryPath] : [];
  });
}

test("landing label and mono faces never render numerals", () => {
  const violations: string[] = [];

  for (const file of [...ROOTS.flatMap(walk), ...FILES]) {
    const source = fs.readFileSync(file, "utf8");

    for (const match of source.matchAll(LABEL_OR_MONO_TAG)) {
      if (!FORBIDDEN.test(match[2])) continue;

      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line} <${match[1]}>`);
    }
  }

  assert.deepEqual(violations, []);
});

// Labels reach font-label elements through props ({item.label}), which the
// tag scan above cannot see, so every `label: "..."` literal under the
// landing roots must be digit-free as well.
const LABEL_LITERAL = /\blabel:\s*"([^"]*)"/g;

test("landing label literals carry no numerals", () => {
  const violations: string[] = [];
  for (const file of [...ROOTS.flatMap(walk), ...FILES]) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(LABEL_LITERAL)) {
      if (!/[0-9]/.test(match[1])) continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line} "${match[1]}"`);
    }
  }
  assert.deepEqual(violations, []);
});
