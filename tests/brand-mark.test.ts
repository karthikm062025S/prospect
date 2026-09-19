import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { brandMarkSrc, normalizeCompanyName } from "../lib/brand-mark.ts";
// @ts-expect-error - plain-JS build script, no types
import { normalizeName } from "../scripts/brand-icons.mjs";

// v7 S4 (OD2) gate: a mark only ever appears on a company we matched with high
// confidence, because a wrong logo is worse than initials. This asserts the
// shipped index (written by scripts/brand-icons.mjs) on both sides — the marks
// that must be there, and the look-alikes that must NOT be.

const INDEX: Record<string, string> = JSON.parse(
  readFileSync(new URL("../public/brand/index.json", import.meta.url), "utf8"),
);

test("known companies resolve to their own mark", () => {
  const cases: Array<[string, string]> = [
    ["Stripe", "/brand/stripe.svg"],
    ["Databricks", "/brand/databricks.svg"],
    ["NVIDIA", "/brand/nvidia.svg"],
    ["Google", "/brand/google.svg"],
    ["Anthropic", "/brand/anthropic.svg"],
    ["Palo Alto Networks", "/brand/palo-alto-networks.svg"],
    ["AT&T", "/brand/atandt.svg"], // "&" normalizes to "and"
    ["Cursor (Anysphere)", "/brand/cursor.svg"], // parenthetical qualifier dropped
  ];
  for (const [name, src] of cases) assert.equal(brandMarkSrc(name), src, name);
});

test("look-alikes and unknown companies get no mark", () => {
  // Every one of these has a same-name entry in the thesvg pack that is a
  // different thing: a language (CSS, Apex), an OSS project (Stryker Mutator,
  // Tekton), or nothing at all. They must stay on the favicon -> initials chain.
  for (const name of [
    "CSS",
    "Apex",
    "Stryker",
    "Tekton",
    "Snap",
    "ServiceNow",
    "Heliux",
    "Varick Agents",
    "",
  ]) {
    assert.equal(brandMarkSrc(name), null, name);
  }
});

test("a careers domain resolves the mark when the name does not", () => {
  assert.equal(brandMarkSrc("Nope Inc", "stripe.com"), "/brand/stripe.svg");
  assert.equal(brandMarkSrc("Nope Inc", "not-a-brand.example"), null);
});

test("the app and the generator normalize identically", () => {
  for (const name of ["Susquehanna (SIG)", "AT&T", "McDonald's", "Naïve", "D. E. Shaw", "1Password"]) {
    assert.equal(normalizeCompanyName(name), normalizeName(name), name);
  }
});

test("every indexed slug has a committed svg", () => {
  for (const slug of new Set(Object.values(INDEX))) {
    const file = new URL(`../public/brand/${slug}.svg`, import.meta.url);
    assert.ok(existsSync(file), `missing public/brand/${slug}.svg`);
  }
});
