// Role-family derivation (VTHacks speed pass, 2026-09-20). Pure, no imports.
// v8: Prospect widened from "tech internships only" to "the career journey for
// EVERY Virginia Tech student, all majors" — the old 9-key tech taxonomy
// (swe/ai_ml/data/quant/product/security/hardware/design/other) is REPLACED,
// not extended, with a 12-key all-majors taxonomy. Checked specific-first (a
// title can be ambiguous across majors; the priority order below decides).
//
// roles.families/roles.family in the DB were written by the OLD scanner and
// still hold old-taxonomy keys (swe, ai_ml, ...) for every row until a future
// scan rewrites them — app/(app)/page.tsx and app/(app)/journey/page.tsx
// therefore ALWAYS derive families from the title at read time now, never
// trusting the stored column (MISSION D7, VTHacks speed pass).

export type Family =
  | "engineering"
  | "software"
  | "data_ai"
  | "business_finance"
  | "consulting"
  | "sales_marketing"
  | "product_design"
  | "health_science"
  | "operations_supply"
  | "people_legal"
  | "education_research"
  | "other";

export const FAMILY_LABEL: Record<Family, string> = {
  engineering: "Engineering",
  software: "Software & IT",
  data_ai: "Data & AI",
  business_finance: "Business & Finance",
  consulting: "Consulting & Strategy",
  sales_marketing: "Sales & Marketing",
  product_design: "Product & Design",
  health_science: "Health & Life Sciences",
  operations_supply: "Operations & Supply Chain",
  people_legal: "People, Legal & Policy",
  education_research: "Education & Research",
  other: "Other",
};

// UI pill display order (distinct from the priority/check order below, same
// split the old taxonomy kept between FAMILY_ORDER and SIGNAL_PRIORITY).
export const FAMILY_ORDER: Family[] = [
  "engineering",
  "software",
  "data_ai",
  "business_finance",
  "consulting",
  "sales_marketing",
  "product_design",
  "health_science",
  "operations_supply",
  "people_legal",
  "education_research",
  "other",
];

// Explicit disciplines only (no generic "engineer"/"engineering" catch-all —
// that would double-tag every software/data engineering title, since those
// are checked as their OWN families above).
const ENGINEERING =
  /\b(mechanical|electrical|civil|chemical|aerospace|industrial|materials|biomedical|thermal|manufacturing)\b|test engineer/i;

// software & IT: SWE/SDE, developer, full-stack, devops, SRE, IT support,
// systems admin, cloud, network, QA, security/cyber. Deliberately no generic
// "engineer"/"engineering" (that's the ENGINEERING catch-all above) — checked
// BEFORE engineering so a real software title still wins on its own keyword.
const SOFTWARE =
  /\bsoftware\b|\bswe\b|\bsde\b|\bdeveloper\b|development engineer|full[\s-]?stack|back[\s-]?end|front[\s-]?end|\bdevops\b|site reliability|\bsre\b|it support|systems? admin|system administrator|\bcloud\b|\bnetwork\b|\bqa\b|quality assurance|quality engineer|\bsecurity\b|\bcyber\b|appsec|infosec/i;

// data scientist/engineer/analyst, analytics, BI, machine learning, AI,
// research scientist, quant — merges the old data/ai_ml/quant families.
const DATA_AI =
  /data scien|data engineer|data analyst|\banalytics\b|business intelligence|\bbi\b|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|large language model|generative ai|computer vision|reinforcement learning|research scien|applied scien|\bquant/i;

const BUSINESS_FINANCE =
  /\bfinance\b|financial analyst|\baccounting\b|\baudit(or|ing)?\b|\btax\b|\bbank|investment|treasury|actuarial|\beconomist\b/i;

const CONSULTING = /consult(ant|ing)?|advisory|\bstrategy\b|transformation|management analyst/i;

const SALES_MARKETING =
  /\bsales\b|account executive|account manager|business development|marketing|\bbrand\b|communications|\bpr\b|\bgrowth\b|customer success/i;

const PRODUCT_DESIGN =
  /product manager|product management|program manager|project manager|\bux\b|\bui\b|designer|\bgraphic\b|industrial design|\barchitect\b/i;

const HEALTH_SCIENCE =
  /\bnurse|nursing|clinical|pharmac|\bbiology\b|\bchemistry\b|\blab\b|laboratory|research associate|physician|therapist|veterinary|food science/i;

// "teamsters" (the labor union representing warehouse/manufacturing/trucking
// workers) is the only signal a title like "TEAMSTERS - Metal Finisher" carries.
const OPERATIONS_SUPPLY =
  /\boperations\b|supply chain|logistics|procurement|sourcing|\bplanner\b|warehouse|manufacturing associate|\bquality\b|\behs\b|teamsters/i;

const PEOPLE_LEGAL =
  /\bhr\b|human resources|recruit(ing|er|ment)?|\btalent\b|\blegal\b|compliance|paralegal|\bpolicy\b|government affairs/i;

const EDUCATION_RESEARCH = /\bteacher\b|instructor|\btutor\b|\beducation\b|\bresearch(er)?\b|postdoc(toral)?|fellowship/i;

// The exact order deriveFamily's if-chain checks in, most specific first.
const SIGNAL_PRIORITY: Exclude<Family, "other">[] = [
  "consulting",
  "data_ai",
  "software",
  "engineering",
  "health_science",
  "business_finance",
  "product_design",
  "sales_marketing",
  "operations_supply",
  "people_legal",
  "education_research",
];

const FAMILY_TEST: Record<Exclude<Family, "other">, RegExp> = {
  consulting: CONSULTING,
  data_ai: DATA_AI,
  software: SOFTWARE,
  engineering: ENGINEERING,
  health_science: HEALTH_SCIENCE,
  business_finance: BUSINESS_FINANCE,
  product_design: PRODUCT_DESIGN,
  sales_marketing: SALES_MARKETING,
  operations_supply: OPERATIONS_SUPPLY,
  people_legal: PEOPLE_LEGAL,
  education_research: EDUCATION_RESEARCH,
};

export function deriveFamily(title: string): Family {
  if (!title) return "other";
  for (const family of SIGNAL_PRIORITY) {
    if (FAMILY_TEST[family].test(title)) return family;
  }
  return "other";
}

// Every family whose regex matches the title, in SIGNAL_PRIORITY order — a
// role can be two families at once (see tests/family.test.ts for real
// multi-tag cases). familySignals(title)[0] === deriveFamily(title) by
// construction.
export function familySignals(title: string): Family[] {
  if (!title) return ["other"];
  const matches = SIGNAL_PRIORITY.filter((family) => FAMILY_TEST[family].test(title));
  return matches.length > 0 ? matches : ["other"];
}

// ---------------------------------------------------------------------------
// L2 (VTHacks coverage lane, 2026-09-19): the LEVEL baseline — a SEPARATE axis
// from Family above (function vs seniority-stage). Untouched by the v8
// all-majors taxonomy swap (byte-identical), so tests/family.test.ts's
// deriveLevel cases keep passing unmodified.
// Mirrored (standalone copy, same discipline as isTargetTitle/bucket in
// scripts/scan-core.mjs and lib/upsert-role.ts) into scripts/scan-core.mjs's
// deriveLevel so the scan and the app agree on what a level string means —
// keep the two in sync by hand on any rule change.
// ---------------------------------------------------------------------------
export type Level = "internship" | "coop" | "new_grad" | "full_time" | "research";

export const LEVEL_LABEL: Record<Level, string> = {
  internship: "Internship",
  coop: "Co-op",
  new_grad: "New Grad",
  full_time: "Full-time",
  research: "Research",
};

export const LEVEL_ORDER: Level[] = ["internship", "coop", "new_grad", "full_time", "research"];

const COOP_TERM = /\bco-?op\b|\bcooperative education\b/i;
// Reuses the same intern/summer-analyst wording as lib/upsert-role.ts's INTERN
// gate (minus the co-op alternation, checked separately above so co-op wins).
const INTERN_TERM =
  /\bintern(ships?|s)?\b|\bsummer\b(?:\s+[\w&/'-]+){0,3}\s+(analysts?|associates?|scholars?)\b/i;
const NEW_GRAD_TERM =
  /new[\s-]?grad(uate)?s?\b|university grad(uate)?s?\b|early career|entry[\s-]?level|class of 20(2[6-9]|3\d)\b/i;
const RESEARCH_TERM = /\bresearch(er)?\b|post-?doc(toral)?\b|\bphd\b|doctoral/i;

// Pure title -> Level. Deliberately NO function/department filtering (that's
// Family's job) — level is orthogonal. A title with no term-of-art at all is
// the common case for a genuine full-time req (most full-time postings never
// say "full-time" in the title), so that's the default, not "other" — every
// posting has SOME level for the demo's 5-way split.
export function deriveLevel(title: string): Level {
  if (!title) return "full_time";
  if (COOP_TERM.test(title)) return "coop";
  if (INTERN_TERM.test(title)) return "internship";
  if (NEW_GRAD_TERM.test(title)) return "new_grad";
  if (RESEARCH_TERM.test(title)) return "research";
  return "full_time";
}
