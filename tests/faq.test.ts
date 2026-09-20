import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Content tests read the page source directly (node:fs), the same pattern
// tests/get-started-copy.test.ts uses -- a Next page imports "next/link",
// which the plain node:test runner (no bundler) cannot resolve, so the
// component itself is never imported here.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const faqSource = read("app/(public)/faq/page.tsx");
const privacySource = read("app/(public)/privacy/page.tsx");
const termsSource = read("app/(public)/terms/page.tsx");
const accountMenuSource = read("components/account-menu.tsx");

test("faq page has at least 10 question/answer pairs", () => {
  const questionCount = (faqSource.match(/q:\s*"/g) ?? []).length;
  assert.ok(questionCount >= 10, `expected at least 10 FAQ questions, found ${questionCount}`);
});

test("faq, privacy and terms pages have no em dash", () => {
  for (const [name, source] of [
    ["faq", faqSource],
    ["privacy", privacySource],
    ["terms", termsSource],
  ] as const) {
    assert.ok(!source.includes("\u2014"), `em dash found in ${name}/page.tsx`);
  }
});

test("privacy page names the real data backend and processors", () => {
  for (const term of ["Lakebase", "Databricks", "Gemini", "Supabase Auth", "2026-09-19"]) {
    assert.ok(privacySource.includes(term), `privacy page is missing "${term}"`);
  }
});

test("privacy page states what is never stored and how to delete data", () => {
  assert.ok(privacySource.includes("never store"), "privacy page is missing a 'what we never store' section");
  assert.ok(privacySource.includes("Deleting your data"), "privacy page is missing a deletion section");
});

test("terms page states this is a student project with no warranty", () => {
  assert.ok(termsSource.includes("VTHacks"), "terms page is missing the VTHacks student-project statement");
  assert.ok(termsSource.includes("no warranty"), "terms page is missing the no-warranty statement");
});

test("account menu links Help & FAQ to /faq", () => {
  assert.match(accountMenuSource, /href="\/faq"[^]*?Help &amp; FAQ/);
});
