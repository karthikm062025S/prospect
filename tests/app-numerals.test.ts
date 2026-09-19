import assert from "node:assert";
import fs from "node:fs";
import test from "node:test";

// D25 inside the signed-in APP, the sibling of tests/landing-numerals.test.ts.
// That test only scans app/welcome + components/landing, so the app's header
// stat line shipped with every digit in IBM Plex Mono -- four dotted zeros in
// the first line a signed-in user reads ("81 added today, 0 applied today, ...").
//
// The rule pinned here is narrower than "no mono digits anywhere": D25 binds
// HERO / STAT / COUNT surfaces, while IBM Plex Mono stays correct for the data
// VALUES in role rows and tables. So the stat surfaces are named, and their
// numerals are found the way they actually reach the markup there: through a
// prop the component itself declares as `number` (there is no literal digit).
const STAT_SURFACES = [
  "components/velocity-strip.tsx", // the Home header stat line
  "components/get-started.tsx", // the D27 onboarding card's "N of 4 complete"
];

const NUMBER_PROP = /^\s*(\w+)\??:\s*number;/gm;
const MONO_OR_LABEL_TAG =
  /<([A-Za-z][\w.]*)\b(?=[^>]*\bclassName\s*=\s*(?:"[^"]*\bfont-(?:mono|label)\b[^"]*"|'[^']*\bfont-(?:mono|label)\b[^']*'|\{\s*`[^`]*\bfont-(?:mono|label)\b[^`]*`\s*\}))[^>]*>([\s\S]*?)<\/\1\s*>/g;

function rendersNumeral(body: string, numberProps: string[]): boolean {
  if (/[0-9]/.test(body)) return true;
  return numberProps.some((prop) => new RegExp(String.raw`\{\s*` + prop + String.raw`\b`).test(body));
}

test("app stat surfaces never render a numeral in a mono or label face", () => {
  const violations: string[] = [];
  let numberPropsSeen = 0;

  for (const file of STAT_SURFACES) {
    const source = fs.readFileSync(file, "utf8");
    const numberProps = [...source.matchAll(NUMBER_PROP)].map((match) => match[1]);
    numberPropsSeen += numberProps.length;

    for (const match of source.matchAll(MONO_OR_LABEL_TAG)) {
      if (!rendersNumeral(match[2], numberProps)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line} <${match[1]}>`);
    }
  }

  // Without a parsed number prop the scan is blind on these files (no literal
  // digit sits in the tag body), so a broken parser would make this test pass
  // on exactly the markup it exists to fail.
  assert.ok(numberPropsSeen > 0, "no `x: number` prop found on any stat surface — the numeral scan is blind");
  assert.deepEqual(violations, []);
});
