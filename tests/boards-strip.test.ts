import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCompanyName } from "../lib/brand-mark.ts";

// Redesign 2026-09-20 HARD RULE: the marquee is two DISJOINT rows of 25 distinct,
// cross-industry companies
// (ROW_A/ROW_B), every one with its exact name in scripts/endpoints.json AND a
// real vector mark (an inline Simple Icons path, or a file in public/brand/
// resolved through lib/brand-mark.ts). This test is the gate; it reads the
// component's exported arrays out of the source rather than importing the
// .tsx (the node --experimental-strip-types runner cannot parse JSX).

const SOURCE = readFileSync(new URL("../components/landing/brand-marks.tsx", import.meta.url), "utf8");
const ENDPOINTS: Array<{ company: string }> = JSON.parse(
  readFileSync(new URL("../scripts/endpoints.json", import.meta.url), "utf8"),
);
const BRAND_INDEX: Record<string, string> = JSON.parse(
  readFileSync(new URL("../public/brand/index.json", import.meta.url), "utf8"),
);

function inlineMarkNames(): string[] {
  const block = SOURCE.slice(SOURCE.indexOf("const PATHS"), SOURCE.indexOf("export const ROW_A"));
  return [...block.matchAll(/^ {2}"?([A-Za-z][A-Za-z0-9 ]*)"?:/gm)].map((m) => m[1].trim());
}

function row(name: string): string[] {
  const start = SOURCE.indexOf(`export const ${name} = [`);
  const block = SOURCE.slice(start, SOURCE.indexOf("];", start));
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const rowA = row("ROW_A");
const rowB = row("ROW_B");
const inline = new Set(inlineMarkNames());

function hasMark(name: string): boolean {
  if (inline.has(name)) return true;
  return Boolean(BRAND_INDEX[normalizeCompanyName(name)]);
}

test("ROW_A and ROW_B each have exactly 25 companies", () => {
  assert.equal(rowA.length, 25, `ROW_A has ${rowA.length}`);
  assert.equal(rowB.length, 25, `ROW_B has ${rowB.length}`);
});

test("no company appears in both rows or is duplicated", () => {
  const all = [...rowA, ...rowB];
  assert.equal(new Set(all).size, all.length, "duplicate company in the strip");
});

test("every company is in endpoints.json by exact name", () => {
  const names = new Set(ENDPOINTS.map((r) => r.company));
  for (const company of [...rowA, ...rowB]) {
    assert.ok(names.has(company), `"${company}" is in the strip but not in endpoints.json`);
  }
});

test("every company has a vector mark (inline path or vendored file)", () => {
  for (const company of [...rowA, ...rowB]) {
    assert.ok(hasMark(company), `"${company}" has no inline path and no public/brand/ mark`);
  }
});
