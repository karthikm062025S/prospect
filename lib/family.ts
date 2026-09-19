// Role-family derivation (MISSION v7 D8, contract V4, 2026-09-02). Pure, no
// imports. Mirrors the INTENT of scripts/scan-core.mjs `bucket()` (which only
// distinguishes Quant/AI/Data, defaulting everything else to SWE) and the
// broader family groupings documented in lib/upsert-role.ts's STRONG_TECH/
// INCLUDE regex comments (Product/TPM, Security/Cyber, Hardware/Firmware/
// Embedded/Robotics, UX/UI/Design), extended to 9 buckets so Home's family
// filter is more useful than a flat SWE/AI/Data/Quant split. Checked
// specific-family-first, same "most specific signal wins" spirit as bucket().
// Deliberately NOT imported by scripts/scan-core.mjs (that file stays
// import-standalone, see lib/upsert-role.ts's parity comment) — this is a
// TypeScript-only sibling, not a replacement.

export type Family =
  | "swe"
  | "ai_ml"
  | "data"
  | "quant"
  | "product"
  | "security"
  | "hardware"
  | "design"
  | "other";

export const FAMILY_LABEL: Record<Family, string> = {
  swe: "Software Engineering",
  ai_ml: "AI/ML",
  data: "Data",
  quant: "Quant",
  product: "Product",
  security: "Security",
  hardware: "Hardware",
  design: "Design",
  other: "Other",
};

export const FAMILY_ORDER: Family[] = [
  "swe",
  "ai_ml",
  "data",
  "quant",
  "product",
  "security",
  "hardware",
  "design",
  "other",
];

const QUANT = /\bquant/i;

const AI_ML =
  /machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|large language model|generative ai|computer vision|reinforcement learning|research scien|applied scien/i;

// Widened 2026-09-03 (v7/feed lane) after classifying all 1,276 live role
// titles: 65 unique titles landed in `other` and ~50 of them were plain
// "<something> Analytics Intern" / "<something> Analyst Intern" (Data Analytics,
// Business Analytics, Product Analyst, Trading Analytics, ...). The ingest gate
// already admits bare `analytics` as CS-technical (lib/upsert-role.ts INCLUDE),
// so the family classifier was the only thing calling them "other".
const DATA =
  /data scien|data engineer|data analyst|analytics engineer|business intelligence|\bbi\b|business analyst|business systems analyst|\banalytics\b|\banalysts?\b/i;

const SECURITY = /security|cyber|appsec|infosec/i;

const HARDWARE = /firmware|embedded|fpga|hardware|ic design|robotics|perception|autonomy|autonomous/i;

const DESIGN = /\bux\b|\bui\b|user experience|product design|visual design|graphic design/i;

const PRODUCT =
  /product manager|product management|program manager|project manager|associate product manager|\bapm\b|\btpm\b|technical program manager/i;

// The broad catch-all — everything else INCLUDE recognizes as CS-technical
// that isn't already claimed by a more specific family above.
const SWE =
  /software|swe|sde|develop(er|ment)?|programmer|programming|full[\s-]?stack|back[\s-]?end|front[\s-]?end|engineer|engineering|devops|site reliability|\bsre\b|\bqa\b|\bsdet\b|quality assurance|quality engineer|test engineer|systems|compiler|distributed|network|rendering|graphics|game|gameplay|solutions engineer|sales engineer|forward deployed|field engineer|implementation engineer|developer advocate|developer relations|devrel|architect|technology|infrastructure|\bplatform\b|\bcloud\b/i;

export function deriveFamily(title: string): Family {
  if (!title) return "other";
  if (QUANT.test(title)) return "quant";
  if (AI_ML.test(title)) return "ai_ml";
  // SECURITY before DATA: bare "analyst" is now a DATA signal, and a
  // "Security Analyst Intern" is a security role, not a data one.
  if (SECURITY.test(title)) return "security";
  if (DATA.test(title)) return "data";
  if (HARDWARE.test(title)) return "hardware";
  if (DESIGN.test(title)) return "design";
  if (PRODUCT.test(title)) return "product";
  if (SWE.test(title)) return "swe";
  return "other";
}

const FAMILY_TEST: Record<Exclude<Family, "other">, RegExp> = {
  quant: QUANT,
  ai_ml: AI_ML,
  security: SECURITY,
  data: DATA,
  hardware: HARDWARE,
  design: DESIGN,
  product: PRODUCT,
  swe: SWE,
};

// Task 2 / D3 (lane L1, fold 2026-09-15): the check-priority order, kept
// separate from FAMILY_ORDER (the UI pill display order, unchanged/swe-first)
// per the L1 review. The exact order deriveFamily's if-chain checks in.
const SIGNAL_PRIORITY: Exclude<Family, "other">[] = [
  "quant",
  "ai_ml",
  "security",
  "data",
  "hardware",
  "design",
  "product",
  "swe",
];

// Task 2 / D3 (lane L1): every family whose regex matches the title, in
// SIGNAL_PRIORITY order, a role can be two families at once (e.g. an "SDE
// Intern, Alexa AI" posting is both ai_ml and swe). Deliberately reuses the
// SAME regex constants and the SAME order deriveFamily checks in, so
// familySignals(title)[0] === deriveFamily(title) by construction; deriveFamily
// itself is untouched (byte-identical).
export function familySignals(title: string): Family[] {
  if (!title) return ["other"];
  const matches = SIGNAL_PRIORITY.filter((family) => FAMILY_TEST[family].test(title));
  return matches.length > 0 ? matches : ["other"];
}
