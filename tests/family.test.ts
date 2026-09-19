import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFamily, familySignals, FAMILY_LABEL, FAMILY_ORDER, deriveLevel, LEVEL_LABEL, LEVEL_ORDER } from "../lib/family.ts";

// MISSION v7 D8 / contract V4: pure title -> Family classifier, mirroring the
// intent of scripts/scan-core.mjs bucket() (Quant/AI/Data, default SWE) and the
// broader family groupings in lib/upsert-role.ts's STRONG_TECH/INCLUDE regex
// comments (Product, Security, Hardware, Design), specific-family-first.
const CASES: Array<[string, ReturnType<typeof deriveFamily>]> = [
  ["Quantitative Trader Intern", "quant"],
  ["Quantitative Research Internships", "quant"],
  ["Machine Learning Intern", "ai_ml"],
  ["Applied Scientist Intern", "ai_ml"],
  ["Data Scientist Intern", "data"],
  ["Business Analyst Intern", "data"],
  ["Business Intelligence & Data Analytics Intern", "data"],
  ["Security Engineer Intern", "security"],
  ["Cybersecurity SOC Analyst Intern", "security"],
  ["Firmware Engineer Intern", "hardware"],
  ["Embedded Software Engineer Intern", "hardware"], // hardware wins over the SWE catch-all
  ["Hardware Engineer Intern", "hardware"],
  ["UX Designer Intern", "design"],
  ["UX Engineer Intern", "design"], // design wins over the SWE catch-all
  ["Product Manager Intern", "product"],
  ["Technical Program Manager Intern", "product"],
  ["Associate Product Manager Intern", "product"],
  ["Software Engineer Intern", "swe"],
  ["DevOps Intern", "swe"],
  ["SRE Intern", "swe"],
  ["Compiler Engineer Intern", "swe"],
  ["Solutions Engineer Intern", "swe"],
  ["Marketing Software Engineer Intern", "swe"],
  ["Campus Crypto Researcher (Intern)", "other"],
  ["Applied Research Intern, Proactive Intelligence", "other"],
  // --- v7/feed lane, 2026-09-03. Measured over ALL 1,276 live role titles:
  // 65 unique titles fell to "other", and ~50 of them were plain
  // "<x> Analytics/Analyst Intern". Bare `analytics`/`analyst` is now a DATA
  // signal, `infrastructure|platform|cloud` a SWE one, and SECURITY is checked
  // BEFORE data so a security analyst stays security. Residual "other" after
  // the fix: 11 unique titles, all bare "Research Intern" variants.
  ["Data Analytics Intern", "data"],
  ["Business Analytics Intern", "data"],
  ["Product Analyst Intern", "data"],
  ["Sales Data Analytics Intern", "data"],
  ["Trading Analytics Intern", "data"], // "trading" alone is not a quant signal
  ["Quantitative Analytics Intern", "quant"], // quant is checked before data
  ["Security Analyst Intern", "security"], // SECURITY before DATA
  ["Cloud Infrastructure Intern", "swe"],
  ["Infrastructure Intern", "swe"],
  ["Platform Intern", "swe"],
  ["NVIDIA 2027 Internships: Ph.D. Research Large Language Models", "ai_ml"],
  ["Research Intern (PhD students)", "other"], // residual, deliberately not guessed
];

for (const [title, expected] of CASES) {
  test(`deriveFamily(${JSON.stringify(title)}) -> ${expected}`, () => {
    assert.equal(deriveFamily(title), expected);
  });
}

test("empty/falsy title is other", () => {
  assert.equal(deriveFamily(""), "other");
});

test("FAMILY_ORDER contains exactly the FAMILY_LABEL keys, once each", () => {
  const labelKeys = Object.keys(FAMILY_LABEL).sort();
  const orderKeys = [...FAMILY_ORDER].sort();
  assert.deepEqual(orderKeys, labelKeys);
});

// Task 2 / D3 (lane L1): familySignals returns every matching family, ordered
// by FAMILY_ORDER's priority, first element always equal to deriveFamily.
test('familySignals("SDE Intern, Alexa AI") -> ["ai_ml","swe"]', () => {
  assert.deepEqual(familySignals("SDE Intern, Alexa AI"), ["ai_ml", "swe"]);
});

test('familySignals("Software Development Engineer Intern") -> ["swe"]', () => {
  assert.deepEqual(familySignals("Software Development Engineer Intern"), ["swe"]);
});

test('familySignals("Security Analyst Intern") -> ["security","data"]', () => {
  assert.deepEqual(familySignals("Security Analyst Intern"), ["security", "data"]);
});

test('familySignals("Intern") -> ["other"]', () => {
  assert.deepEqual(familySignals("Intern"), ["other"]);
});

test("familySignals()[0] equals deriveFamily() for every case title", () => {
  for (const [title] of CASES) {
    assert.equal(familySignals(title)[0], deriveFamily(title), `mismatch for ${JSON.stringify(title)}`);
  }
});

// ---------------------------------------------------------------------------
// L2 (VTHacks coverage lane, 2026-09-19): deriveLevel is a SEPARATE axis from
// Family (function vs seniority-stage). Baseline the classifier is measured
// against later.
// ---------------------------------------------------------------------------
const LEVEL_CASES: Array<[string, ReturnType<typeof deriveLevel>]> = [
  ["Software Engineer Intern", "internship"],
  ["Software Engineering Internships", "internship"],
  ["2027 Summer Technology Analyst", "internship"],
  ["Software Engineering Co-op 2027", "coop"],
  ["Cooperative Education Program - Software Development", "coop"],
  ["New Grad Software Engineer", "new_grad"],
  ["University Graduate - Data Analyst", "new_grad"],
  ["Class of 2027 - Financial Analyst Program", "new_grad"],
  ["Entry Level Marketing Associate", "new_grad"],
  ["Postdoctoral Research Fellow", "research"],
  ["Research Scientist", "research"],
  ["Financial Analyst", "full_time"],
  ["Senior Software Engineer", "full_time"],
  ["Marketing Manager", "full_time"],
  ["Research Intern (PhD students)", "internship"], // intern wins over research (term > function)
  ["", "full_time"],
];

for (const [title, expected] of LEVEL_CASES) {
  test(`deriveLevel(${JSON.stringify(title)}) -> ${expected}`, () => {
    assert.equal(deriveLevel(title), expected);
  });
}

test("LEVEL_ORDER contains exactly the LEVEL_LABEL keys, once each", () => {
  const labelKeys = Object.keys(LEVEL_LABEL).sort();
  const orderKeys = [...LEVEL_ORDER].sort();
  assert.deepEqual(orderKeys, labelKeys);
});
