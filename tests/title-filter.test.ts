import { test } from "node:test";
import assert from "node:assert/strict";
import { isTargetTitle } from "../lib/upsert-role.ts";

// Parity lock for the INGEST gate in lib/upsert-role.ts. 2026-09-19 addendum 2
// (VTHacks, "every major, every level"): the gate is WIDE. A title is kept
// unless it carries a stale-year / wrong-term marker; every function and level
// is eligible (mirrors scripts/scan-core.mjs isEligiblePosting on the L2 lane).
// The pre-widening CS-intern-only cases stay below as KEEP so the old
// coverage can never regress, and every title the old gate DROPPED for being
// non-CS or non-intern is now asserted KEPT (flipped, not deleted).
const KEEP = [
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
  "Privacy and Civil Liberties Software Engineer, Internship",
  "Applied Research Intern, Proactive Intelligence",
  "Campus Crypto Researcher (Intern)",
  "DevOps Intern",
  "SRE Intern",
  "Site Reliability Engineering Internship",
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
  // --- addendum 2, 2026-09-19: DROPPED by the old CS-intern gate, KEPT by the wide one ---
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
  "Civil Engineering Intern",
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
  "Data Engineer, Full-time", // not an intern
  "Co-op 2027",
  "2027 Summer Analyst",
  "Summer Associate - Wealth Management",
  "Co-op Student - Facilities",
  "Senior Engineer", // no term at all
];
// Only a stale-year / wrong-term marker drops a posting now.
const DROP = [
  "Software Engineer Intern - Fall 2026", // wrong term
  "Summer 2026 Intern", // supported term word, year we do not cover
  "Software Engineering Co-op 2026", // co-op admitted, but WRONG_TERM year
  "Software Engineer Intern 2025",
  "Summer '26 SWE Intern",
];

for (const title of KEEP) {
  test(`keeps: ${title}`, () => assert.equal(isTargetTitle(title), true));
}
for (const title of DROP) {
  test(`drops: ${title}`, () => assert.equal(isTargetTitle(title), false));
}

test("null/empty title is dropped", () => {
  assert.equal(isTargetTitle(null), false);
  assert.equal(isTargetTitle(""), false);
});
