import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFamily, familySignals, FAMILY_LABEL, FAMILY_ORDER, deriveLevel, LEVEL_LABEL, LEVEL_ORDER } from "../lib/family.ts";

// VTHacks speed pass (2026-09-20): Prospect widened from "tech internships
// only" to "the career journey for EVERY Virginia Tech student, all majors" —
// the old 9-key tech taxonomy is REPLACED with a 12-key all-majors one.
// Priority order (most specific first): consulting > data_ai > software >
// engineering > health_science > business_finance > product_design >
// sales_marketing > operations_supply > people_legal > education_research >
// other. At least 3 titles per family below, plus the 8 real live-feed titles
// the mission named explicitly.
const CASES: Array<[string, ReturnType<typeof deriveFamily>]> = [
  // engineering
  ["Mechanical Engineer", "engineering"],
  ["Electrical Engineering Intern", "engineering"],
  ["Civil Engineer I", "engineering"],
  ["Aerospace Test Engineer", "engineering"],
  // software
  ["Software Engineer Intern", "software"],
  ["DevOps Engineer", "software"],
  ["Site Reliability Engineer", "software"],
  ["IT Support Specialist", "software"],
  ["Network Engineer", "software"], // "network" is a software/IT signal, checked before the engineering catch-all
  // data_ai
  ["Data Scientist Intern", "data_ai"],
  ["Machine Learning Engineer", "data_ai"], // data_ai wins over the engineering catch-all (checked first)
  ["Business Intelligence Analyst", "data_ai"],
  ["Data Engineer 4", "data_ai"],
  ["Quantitative Researcher", "data_ai"],
  // business_finance
  ["Financial Analyst", "business_finance"],
  ["Investment Banking Analyst", "business_finance"],
  ["Tax Accountant", "business_finance"],
  ["Relationship Banker", "business_finance"],
  // consulting
  ["Management Consultant", "consulting"],
  ["Strategy Consulting Intern", "consulting"],
  ["Technology Consulting Intern", "consulting"], // consulting outranks "technology" (no software signal here anyway)
  ["Business Transformation Advisor", "consulting"],
  // sales_marketing
  ["Account Executive", "sales_marketing"],
  ["Marketing Coordinator", "sales_marketing"],
  ["NA Sales Representative, Data Platform", "sales_marketing"], // "Data Platform" is not a data_ai signal
  ["Business Development Representative", "sales_marketing"],
  // product_design
  ["Product Manager Intern", "product_design"],
  ["UX Designer", "product_design"],
  ["Program Manager", "product_design"],
  ["Graphic Designer", "product_design"],
  // health_science
  ["Registered Nurse", "health_science"],
  ["Clinical Research Associate", "health_science"],
  ["Certified Pharmacy Technician", "health_science"],
  ["Biology Lab Technician", "health_science"],
  // operations_supply
  ["Supply Chain Analyst", "operations_supply"],
  ["Logistics Coordinator", "operations_supply"],
  ["Warehouse Associate", "operations_supply"],
  ["TEAMSTERS - Metal Finisher", "operations_supply"], // "teamsters" is the only signal in this real title
  // people_legal
  ["HR Generalist", "people_legal"],
  ["Legal Counsel", "people_legal"],
  ["Recruiting Coordinator", "people_legal"],
  ["Senior Talent Advisor - Corporate", "people_legal"],
  ["Compliance Analyst", "people_legal"],
  // education_research
  ["High School Teacher", "education_research"],
  ["Postdoctoral Fellow", "education_research"],
  ["Research Assistant", "education_research"], // plain "research", not "research scien..." (that's data_ai) or "research associate" (that's health_science)
  // other
  ["Administrative Assistant", "other"],
  ["Campus Ambassador", "other"],
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

// familySignals returns every matching family, ordered by priority, first
// element always equal to deriveFamily.
test('familySignals("Compliance Consultant") -> ["consulting","people_legal"]', () => {
  assert.deepEqual(familySignals("Compliance Consultant"), ["consulting", "people_legal"]);
});

test('familySignals("Data Scientist") -> ["data_ai"]', () => {
  assert.deepEqual(familySignals("Data Scientist"), ["data_ai"]);
});

test('familySignals("Software QA Analyst") -> ["software"]', () => {
  assert.deepEqual(familySignals("Software QA Analyst"), ["software"]);
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
// Family (function vs seniority-stage), untouched by the v8 taxonomy swap.
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
