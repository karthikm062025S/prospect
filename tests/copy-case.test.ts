import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NAV } from "../lib/nav.ts";

// v8 copy lane (D2): sentence case everywhere, no em dashes in UI copy.
// v8 fixes audit item 10: widened from a fixed LANE_FILES list to walk every
// .tsx/.ts under app/ and components/ (mirrors tests/fonts.test.ts's walk),
// so a violation outside the original copy lane's file set is no longer blind.

const ROOTS = ["app", "components"];

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return /\.(tsx|ts)$/.test(entry.name) ? [entryPath] : [];
  });
}

function read(file: string): string {
  return fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
}

// Cheap comment strip so code-comment em dashes (allowed, prose about the
// implementation) don't false-positive against UI-copy em dashes. Skips "//"
// preceded by ":" so it doesn't eat "https://" inside string literals.
function stripLineComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

// Not UI copy: the MCP tool descriptions here are API documentation strings
// for the MCP client, never rendered to a person in the app.
const NON_UI_FILES = new Set(["app\\api\\[transport]\\route.ts", "app/api/[transport]/route.ts"]);

const ALL_FILES = ROOTS.flatMap(walk).filter((f) => !NON_UI_FILES.has(f));

test("lib/nav.ts tab labels are not ALL-CAPS literals", () => {
  for (const item of NAV) {
    assert.notEqual(item.label, item.label.toUpperCase(), `NAV label "${item.label}" is ALL-CAPS`);
  }
});

test("no app/ or components/ file has an em dash in JSX text/string literals", () => {
  for (const file of ALL_FILES) {
    const stripped = stripLineComments(read(file));
    assert.ok(!stripped.includes("—"), `em dash found outside a comment in ${file}`);
  }
});

test('no app/ or components/ file contains the removed literal strings "HOME"/"APPLICATIONS"/"OUTREACH"', () => {
  for (const file of ALL_FILES) {
    const source = read(file);
    for (const banned of ["\"HOME\"", "\"APPLICATIONS\"", "\"OUTREACH\""]) {
      assert.ok(!source.includes(banned), `${banned} found in ${file}`);
    }
  }
});

test('no app/ or components/ file contains "target 25"', () => {
  for (const file of ALL_FILES) {
    assert.ok(!read(file).includes("target 25"), `"target 25" found in ${file}`);
  }
});

test('no app/ or components/ file contains "(/)"', () => {
  for (const file of ALL_FILES) {
    assert.ok(!read(file).includes("(/)"), `"(/)" found in ${file}`);
  }
});

// The removed "Deadline" sort label (D8/D-CUT) is banned everywhere EXCEPT
// detail-pane.tsx and role-detail-pane.tsx, where "Deadline" legitimately
// names a posting-data field (the job's own deadline date), unrelated to the
// removed sort option.
const DEADLINE_ALLOWED = ["detail-pane.tsx", "role-detail-pane.tsx"];

test('no file (other than the posting-data field label in detail-pane.tsx / role-detail-pane.tsx) contains "Deadline"', () => {
  for (const file of ALL_FILES) {
    if (DEADLINE_ALLOWED.some((allowed) => file.endsWith(allowed))) continue;
    const stripped = stripLineComments(read(file));
    assert.ok(!stripped.includes("Deadline"), `"Deadline" found in ${file}`);
  }
});
