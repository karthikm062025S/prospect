import { test } from "node:test";
import assert from "node:assert/strict";
import { isTargetTitle, looksUS, bucket, buildCandidate } from "../scripts/scan.mjs";

// The deterministic title role-gate. Completeness-first (Karthik 2026-07-18):
// EVERY CS-technical intern title must survive at EVERY company; only clearly
// non-technical functions and wrong terms drop. PARITY: this KEEP/DROP set is
// identical to tests/title-filter.test.ts so the scanner and the ingest gate
// (lib/upsert-role.ts) can never silently diverge. Encodes the fresh-review
// findings (plural "Internships", bare "Scientist", domain-word SWE roles) plus
// the broadened families and the STRONG_TECH-beats-department-word override.
const KEEP = [
  // --- core SWE / AI / Data / Quant (original coverage) ---
  "Software Engineering Internships",
  "Quantitative Research Internships",
  "Applied Scientist Intern",
  "Software Engineer Intern - Supply Chain",
  "Backend Engineer Intern, Treasury",
  "Software Engineer Intern, Accounting Platform", // EXCLUDE "accounting" overridden by STRONG_TECH
  "Data Scientist Intern",
  "Machine Learning Intern",
  "Software Engineer Intern (Summer 2027)",
  "Quantitative Trader Intern",
  "Privacy and Civil Liberties Software Engineer, Internship", // \bcivil\b false-drop (Palantir, live)
  "Applied Research Intern, Proactive Intelligence", // bare "research" (Block, live)
  "Campus Crypto Researcher (Intern)", // "researcher" (Jump, live)
  "DevOps Intern",
  "SRE Intern",
  "Site Reliability Engineering Internship",
  // --- families added in the 2026-07-18 completeness broadening ---
  "Product Management Intern (Summer 2027)", // Databricks — the exact miss this fixes
  "Product Manager Intern",
  "Technical Program Manager Intern",
  "Associate Product Manager Intern",
  "Data Analyst Intern",
  "Business Analyst Intern",
  "Business Systems Analyst Intern",
  "Business Intelligence & Data Analytics Intern",
  "Solutions Engineer Intern",
  "Sales Engineer Intern", // "sales" is no longer bare-excluded
  "Forward Deployed Software Engineer Intern",
  "Developer Advocate Intern",
  "Security Engineer Intern",
  "Cybersecurity SOC Analyst Intern",
  "QA Engineering Intern",
  "Quality Assurance Intern",
  "SDET Intern",
  "Firmware Engineer Intern",
  "Embedded Software Engineer Intern",
  "Compiler Engineer Intern",
  "Rendering Software Engineer Intern",
  "iOS Developer Intern",
  "Full-Stack Software Engineer Intern",
  "AI Engineer Intern",
  "Generative AI Research Engineer Intern",
  "UX Engineer Intern",
  "UX Designer Intern", // deliberate over-catch: any UX role stays (has "UX")
  "Marketing Software Engineer Intern", // STRONG_TECH overrides "marketing"
  "Technology Summer Analyst Intern", // bank SWE track titled "Technology Analyst"
  "Hardware Engineer Intern",
  "Solutions Architect Intern",
  // --- v7/feed lane, 2026-09-03 (PARITY with tests/title-filter.test.ts): the
  // term gate widened past the literal word "intern" (MISSION v7 D8).
  "Software Engineering Co-op 2027",
  "Software Engineer Co-Op (Spring 2028)",
  "Data Science Coop - Fall 2027",
  "2027 Summer Technology Analyst",
  "Summer Associate, Software Engineering 2027",
  "Cooperative Education Program - Software Development",
  "Software Engineering Intern (Fall 2027)",
  "Software Engineer Intern (Spring 2027)",
  "Winter 2027 Software Engineering Intern",
  "Machine Learning Intern - Summer 2028",
];
const DROP = [
  "Internal Audit Data Analytics Lead", // "Internal" is not "intern"
  "Senior Software Engineer", // not an intern → dropped by the INTERN gate
  "Marketing Intern",
  "Product Marketing Intern", // MUST fail (Karthik)
  "Product Marketing Manager Intern",
  "Sales Development Intern",
  "Sales Development Representative Intern", // MUST fail (Karthik)
  "Sales Strategy & Analytics Intern", // "analytics" must NOT rescue a sales-strategy role
  "Recruiting Coordinator Intern",
  "Recruiting Intern",
  "HR Intern", // MUST fail (Karthik)
  "HR Analytics Intern", // "analytics" must NOT rescue an HR role
  "Pharmacy Intern",
  "Mechanical Engineering Intern",
  "Civil Engineering Intern", // now via "civil engineer(ing)?", not bare "civil"
  "Business Development Intern",
  "Financial Analyst Intern",
  "Investment Banking Summer Analyst Intern",
  "Management Analyst Intern",
  "Legal Intern",
  "Customer Success Intern",
  "Graphic Designer Intern",
  "Product Designer Intern", // pure design, no ux/ui/eng token → drops
  "AI Product Operations Intern", // "product operations"; bare "AI" must NOT rescue it
  "Digital Marketing Intern - Technical AI", // "marketing"; bare AI/technical must NOT rescue it
  "Market Research Intern",
  "Operations Intern",
  "Product Manager Intern - Fall 2026", // right family, wrong term → still drops
  "Software Engineer Intern - Fall 2026", // wrong term
  "Data Engineer, Full-time", // not an intern
  // --- v7/feed lane, 2026-09-03 (PARITY): a widened term with no CS signal
  // still drops; INCLUDE is a separate, still-required test.
  "Co-op 2027",
  "2027 Summer Analyst",
  "Summer Associate - Wealth Management",
  "Co-op Student - Facilities",
  "Senior Engineer",
  "Summer 2026 Intern",
  "Software Engineering Co-op 2026",
];

for (const title of KEEP) {
  test(`keeps: ${title}`, () => assert.equal(isTargetTitle(title), true));
}
for (const title of DROP) {
  test(`drops: ${title}`, () => assert.equal(isTargetTitle(title), false));
}

test("bucket routes by title keyword", () => {
  assert.equal(bucket("Quantitative Trader Intern"), "Quant");
  assert.equal(bucket("Machine Learning Intern"), "AI");
  assert.equal(bucket("Data Scientist Intern"), "Data");
  assert.equal(bucket("Software Engineer Intern"), "SWE");
});

test("buildCandidate never emits demoting fields (B1: a re-post must not clobber LLM verification)", () => {
  const c = buildCandidate("Palantir", {
    title: " Software Engineer, Internship ",
    location: "New York",
    published: "2026-07-01T00:00:00Z",
    url: "https://x/y",
  });
  assert.equal(c.title, "Software Engineer, Internship"); // trimmed
  assert.equal(c.posted_at, "2026-07-01");
  // These fields, if sent, would overwrite an already-verified role on the
  // webhook UPDATE path — they MUST be absent.
  for (const forbidden of ["lifecycle", "eligible", "eligibility_note", "fit_note", "priority", "notes"]) {
    assert.ok(!(forbidden in c), `buildCandidate must not emit "${forbidden}"`);
  }
});

test("looksUS: country hint is authoritative, ambiguous is kept", () => {
  assert.equal(looksUS("Zurich", "Switzerland"), false);
  assert.equal(looksUS("New York", "United States"), true);
  assert.equal(looksUS("London", null), false);
  assert.equal(looksUS("Remote", null), true);
  assert.equal(looksUS("", null), true); // blank → keep, LLM confirms
});
