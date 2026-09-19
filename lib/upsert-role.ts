import type { SupabaseClient } from "@supabase/supabase-js";
import type { Season } from "./season";
import type { Family } from "./family";

// Deterministic title role-gate for INGEST (SPEC FR-012: hard-impossible
// auto-remove). Inlined here (co-located with the ingest path, no cross-module
// runtime import so node --experimental-strip-types resolves it) and exported so
// tests can lock it.
//
// ponytail: these five predicates are a deliberate copy of scripts/scan.mjs (the
// GitHub Actions scanner, deployed OUTSIDE this repo tree — it must stay
// import-standalone, so we do NOT cross-import it). Both copies are test-locked
// (tests/title-filter.test.ts mirrors tests/scan-filter.test.ts) so drift
// surfaces as a failing test. Keep the two in sync. Recall-first: a real US
// SWE/AI/Data/Quant intern title survives; only unambiguous non-targets drop;
// borderline passes through to the owner's manual delete. Location is NOT gated
// here (the webhook payload carries none — non-US strays are caught by the
// scanner's own looksUS filter + manual delete/tombstone).
// The INTERNSHIP-TERM gate. Widened 2026-09-03 (v7/feed lane): MISSION v7 D8 and
// Karthik's ingest decision admit co-op terms, but the gate still required the
// literal word "intern", so "Software Engineering Co-op 2027" and
// "2027 Summer Technology Analyst" were dropped at ingest (verified against the
// live feed: not one co-op-titled row without "intern" had ever been ingested).
// "summer analyst/associate/scholar" are the term-of-art internship titles used
// by finance/consulting technology programs. A CS signal is still REQUIRED
// separately (INCLUDE below), so a bare "Co-op 2027" or "2027 Summer Analyst"
// still drops.
const INTERN = /\bintern(ships?|s)?\b|\bco-?op\b|\bcooperative education\b|\bsummer\b(?:\s+[\w&/'-]+){0,3}\s+(analysts?|associates?|scholars?)\b/i;

// STRONG unambiguous CS-engineering signal. A title matching this is KEPT even
// when it also carries a non-technical DEPARTMENT word (e.g. "Marketing Software
// Engineer", "Software Engineer Intern, Accounting Platform") — these phrases
// never head a non-CS role, so they WIN over EXCLUDE. Deliberately NOT bare
// "engineer" (mechanical/civil/etc. use it).
const STRONG_TECH =
  /\b(software\s+(engineer|developer)|software development engineer|machine learning|deep learning|data scien|data engineer|analytics engineer|full[\s-]?stack|back[\s-]?end\s+engineer|front[\s-]?end\s+engineer|devops|site reliability|\bsre\b|security engineer|firmware|compiler|distributed systems|graphics engineer|rendering|\bsdet\b)/i;

// Broad CS-technical INCLUDE — EVERY CS-technical family (completeness-first,
// the owner, 2026-07-18: never miss a real role; he filters the noise himself).
// SWE/Frontend/Backend/Fullstack/Mobile, AI/ML/GenAI/LLM/NLP/CV, Data
// Science/Eng/Analytics/BI, Data/Business/Product Analyst, Quant, DevOps/SRE/
// Platform/Infra/Cloud, Security/Cyber, QA/SDET/Test, Product & (T)PM, Solutions/
// Sales/Forward-Deployed Eng, DevRel, UX/UI, Robotics/Embedded/Firmware,
// Research/Applied Scientist, Systems/Compiler/Distributed/Network, Games/Graphics.
// Bare ai/ml/bi kept on purpose; the non-tech "<dept> AI/analytics" compounds are
// cut by EXCLUDE below.
const INCLUDE =
  /\b(software|swe|sde|develop(er|ment)?|programmer|programming|full[\s-]?stack|back[\s-]?end|front[\s-]?end|engineer|engineering|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|generative ai|computer vision|reinforcement learning|data scien|data engineer|data analyst|business analyst|product analyst|business systems analyst|analytics|business intelligence|\bbi\b|infrastructure|\bplatform\b|\bcloud\b|security|cyber|appsec|infosec|robotics|perception|autonomy|autonomous|embedded|firmware|scientist|research|devops|site reliability|\bsre\b|\bqa\b|\bsdet\b|quality assurance|quality engineer|test engineer|fpga|quant|systems|compiler|distributed|network|rendering|graphics|game|gameplay|solutions engineer|sales engineer|forward deployed|field engineer|implementation engineer|developer advocate|developer relations|devrel|product manager|product management|program manager|project manager|associate product manager|\bapm\b|\btpm\b|\bux\b|\bui\b|user experience|ic design|hardware|architect|technology)/i;

// EXCLUDE — clearly NON-technical functions only, as PRECISE compounds so a
// technical role that merely CONTAINS one of these words survives (Sales
// *Engineer*, *Data* Analyst, *Business* Analyst, Backend Engineer/*Treasury*).
// EXCLUDE loses to STRONG_TECH. Bare department words (sales/design/product/
// analyst/business) are FORBIDDEN here — they misfire on real CS titles.
const EXCLUDE =
  /\b(marketing|human resources|\bhr\b|people ops|talent acquisition|recruit(ing|er|ment)?|sales development|sales representative|sales rep\b|account executive|account manager|business development|\bsdr\b|\bbdr\b|sales strategy|market research|financial analyst|finance analyst|finance intern|accounting|investment banking|financial reporting|legal|counsel|paralegal|public relations|social media|content marketing|customer success|customer support|customer experience|graphic design|visual design|product marketing|product operations|business operations|sales operations|marketing operations|people operations|management analyst|mechanical engineer(ing)?|civil engineer(ing)?|chemical engineer(ing)?|biomedical engineer(ing)?|industrial engineer(ing)?|environmental engineer(ing)?|aerospace engineer(ing)?|materials engineer(ing)?|manufacturing engineer(ing)?|structural engineer(ing)?|pharmac(y|ist|eutical|ists|ies)|nursing|clinical|phlebotom)\b/i;
// Widened 2026-09-02 (MISSION v7 D8): fall/spring/winter/autumn and co-op are no
// longer automatic rejections — lib/season.ts now classifies the term (and a
// title with no supported term still ingests as season:"unspecified", filtered
// by the Home season dropdown instead of dropped at the gate). Still reject any
// explicit year ≤2026 and a near-term "summer '20"–"summer '26".
const WRONG_TERM = /\b(2019|2020|2021|2022|2023|2024|2025|2026)\b|summer\s*'?2[0-6]\b/i;

export function isTargetTitle(title: string | null | undefined): boolean {
  if (!title || !INTERN.test(title)) return false;
  // EXCLUDE loses to STRONG_TECH: a genuine CS-eng title in a non-tech dept stays.
  if (EXCLUDE.test(title) && !STRONG_TECH.test(title)) return false;
  if (!INCLUDE.test(title)) return false;
  if (WRONG_TERM.test(title)) return false;
  return true;
}

// Season/family derivation at ingest (MISSION v7 D8). Duplicated (not
// imported) from lib/season.ts / lib/family.ts: those two stay dependency-free
// pure modules (season.ts especially — "no imports" is part of their spec, for
// direct reuse by the Home filter UI and as SQL-backfill reference), but this
// file is imported DIRECTLY by tests/upsert-role.test.ts under
// `node --experimental-strip-types`, which cannot resolve an extensionless
// runtime *value* import between two lib/*.ts files (see CLAUDE.md's
// intern-hq module-resolution mistake rule) — the same reason isTargetTitle
// above is a standalone copy rather than a cross-import of scan-core.mjs.
// tests/season.test.ts and tests/family.test.ts lock the canonical
// lib/season.ts + lib/family.ts behavior this copy must track — keep both in
// sync by hand on any rule change (same discipline as isTargetTitle above).
function classifySeason(s: string): Season {
  const WINTER = /\bwinter\b/i;
  const COOP = /\bco-?op\b|\bcooperative education\b/i;
  const INTERN_WORD = /\bintern(?:ships?|s)?\b/i;
  const BARE_YEAR_2027 = /\b2027\b/;
  const GAP = "['\\s-]{0,3}";
  const summerYear = (yy: string) => new RegExp(`\\b(?:summer|su)${GAP}(?:20)?${yy}\\b`, "i");
  const fallYear = (yy: string) => new RegExp(`\\b(?:fall|autumn)${GAP}(?:20)?${yy}\\b`, "i");
  const springYear = (yy: string) => new RegExp(`\\bspring${GAP}(?:20)?${yy}\\b`, "i");
  if (!s) return "unspecified";
  if (WINTER.test(s)) return "unspecified";
  if (summerYear("27").test(s)) return "summer_2027";
  if (fallYear("27").test(s)) return "fall_2027";
  if (springYear("28").test(s)) return "spring_2028";
  if (summerYear("28").test(s)) return "summer_2028";
  if (
    new RegExp(`\\b(?:summer|su)${GAP}(?:20)?\\d{2}\\b`, "i").test(s) ||
    new RegExp(`\\b(?:fall|autumn)${GAP}(?:20)?\\d{2}\\b`, "i").test(s) ||
    new RegExp(`\\bspring${GAP}(?:20)?\\d{2}\\b`, "i").test(s)
  ) {
    return "unspecified";
  }
  if (COOP.test(s)) return "coop";
  if (/\bsummer\b/i.test(s)) return "summer_2027";
  if (/\b(?:fall|autumn)\b/i.test(s)) return "fall_2027";
  if (/\bspring\b/i.test(s)) return "spring_2028";
  if (INTERN_WORD.test(s) && BARE_YEAR_2027.test(s)) return "summer_2027";
  return "unspecified";
}

export function ingestSeason(title: string, text?: string | null): Season {
  const fromTitle = classifySeason(title);
  if (fromTitle !== "unspecified") return fromTitle;
  return classifySeason(text ?? "");
}

export function ingestFamily(title: string): Family {
  if (!title) return "other";
  if (/\bquant/i.test(title)) return "quant";
  if (
    /machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|large language model|generative ai|computer vision|reinforcement learning|research scien|applied scien/i.test(
      title,
    )
  )
    return "ai_ml";
  // SECURITY before DATA (see lib/family.ts): bare "analyst" is a DATA signal.
  if (/security|cyber|appsec|infosec/i.test(title)) return "security";
  if (
    /data scien|data engineer|data analyst|analytics engineer|business intelligence|\bbi\b|business analyst|business systems analyst|\banalytics\b|\banalysts?\b/i.test(
      title,
    )
  )
    return "data";
  if (/firmware|embedded|fpga|hardware|ic design|robotics|perception|autonomy|autonomous/i.test(title))
    return "hardware";
  if (/\bux\b|\bui\b|user experience|product design|visual design|graphic design/i.test(title)) return "design";
  if (
    /product manager|product management|program manager|project manager|associate product manager|\bapm\b|\btpm\b|technical program manager/i.test(
      title,
    )
  )
    return "product";
  if (
    /software|swe|sde|develop(er|ment)?|programmer|programming|full[\s-]?stack|back[\s-]?end|front[\s-]?end|engineer|engineering|devops|site reliability|\bsre\b|\bqa\b|\bsdet\b|quality assurance|quality engineer|test engineer|systems|compiler|distributed|network|rendering|graphics|game|gameplay|solutions engineer|sales engineer|forward deployed|field engineer|implementation engineer|developer advocate|developer relations|devrel|architect|technology|infrastructure|\bplatform\b|\bcloud\b/i.test(
      title,
    )
  )
    return "swe";
  return "other";
}

// T3 (MISSION Task 3): identity across a repost. The ATS job id parsed from
// the link is the strongest signal (same posting survives a title/location
// drift); falls back to company + normalized title + normalized location.
// Inlined here (not imported from a shared lib/*.ts module) for the same
// module-resolution reason isTargetTitle above is a standalone copy, and
// exported so tests/canonical-key.test.ts can lock it directly.
function normalizeForKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// One ATS id pattern per host, each anchored so a tracking query string
// appended after the id (?utm_source=...) never changes the extracted id.
function extractAtsId(link: string | null | undefined): string | null {
  if (!link) return null;
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("myworkdayjobs.com")) {
    const m = link.match(/_((?:JR|R)[-_]?\d+)(?=\?|$)/);
    if (m) return `wd:${m[1]}`;
  }
  if (host.includes("greenhouse.io")) {
    const m = link.match(/\/jobs\/(\d+)/);
    if (m) return `gh:${m[1]}`;
  }
  if (host.includes("lever.co")) {
    const uuid = link.match(UUID_RE);
    if (uuid) return `lever:${uuid[0].toLowerCase()}`;
    const posting = link.match(/\/postings\/([^/?]+)/);
    if (posting) return `lever:${posting[1]}`;
  }
  if (host.includes("ashbyhq.com")) {
    const uuid = link.match(UUID_RE);
    if (uuid) return `ashby:${uuid[0].toLowerCase()}`;
    const posting = link.match(/\/postings\/([^/?]+)/);
    if (posting) return `ashby:${posting[1]}`;
  }
  if (host.includes("smartrecruiters.com")) {
    const m = link.match(/\/job\/(\d+)/);
    if (m) return `sr:${m[1]}`;
  }
  if (host.includes("successfactors.com")) {
    const m = link.match(/\/(\d+)\/?(?:\?|$)/);
    if (m) return `sf:${m[1]}`;
  }
  return null;
}

export function deriveCanonicalKey(input: {
  companyId: string;
  title: string;
  location?: string | null;
  link?: string | null;
}): string {
  const atsId = extractAtsId(input.link);
  if (atsId) return atsId;
  const normTitle = normalizeForKey(input.title);
  const normLocation = normalizeForKey(input.location) || "-";
  return `co:${input.companyId}|t:${normTitle}|l:${normLocation}`;
}

// Collapsed lifecycle (rebuild 2026-07-13): only open|applied. New ingests
// default to "open"; "applied" is set solely by a real apply (applyRoleAction).
export const ROLE_LIFECYCLES = ["open", "applied"] as const;

export type RoleUpsertDecision =
  | "insert"
  | "update"
  | "skip_applied"
  | "skip_tombstoned"
  | "skip_filtered";

// Pure guard: the applied-lock lives on roles.lifecycle. No existing row →
// insert; an existing `applied` role is untouchable by the watcher/MCP →
// skip_applied; otherwise refresh it. (skip_refresh is gone with the 8-state
// machine — delete-stickiness is now the tombstone's job, checked in upsertRole
// before we ever get here, so a scanner re-find of a deleted role never inserts.)
export function resolveRoleUpsert(
  existingLifecycle: string | undefined,
  hasExisting: boolean,
): RoleUpsertDecision {
  if (!hasExisting) return "insert";
  if (existingLifecycle === "applied") return "skip_applied";
  return "update";
}

export type UpsertRoleInput = {
  company: string;
  title: string;
  role_type?: string | null;
  lifecycle?: string | null;
  posted_at?: string | null;
  deadline?: string | null;
  link?: string | null;
  source?: string | null;
  visa_class?: string | null;
  eligible?: boolean | null;
  eligibility_note?: string | null;
  fit_note?: string | null;
  priority?: string | null;
  notes?: string | null;
  location?: string | null;
  // MISSION v7 D8: posting text, when the caller has it, sharpens season
  // derivation beyond the title alone (lib/season.ts's `text` param).
  jd_text?: string | null;
};

// Echo shape for the watcher webhook's `inserted_roles` (identity of a
// genuinely-new row, so callers can notify on real inserts instead of a date
// proxy). Pure & side-effect-free: built straight from the request input, not
// the DB row, so it's stable regardless of what upsertRole/insert returns.
export type InsertedRoleEcho = {
  company: string;
  title: string;
  role_type: string | null;
  link: string | null;
  source: string | null;
  posted_at: string | null;
};

export function toInsertedRoleEcho(input: UpsertRoleInput): InsertedRoleEcho {
  return {
    company: input.company,
    title: input.title,
    role_type: input.role_type ?? null,
    link: input.link ?? null,
    source: input.source ?? null,
    posted_at: input.posted_at ?? null,
  };
}

// Columns copied straight from input when defined (undefined = leave untouched).
// Excludes the identity/lookup columns (company_id, title) and the specially
// handled lifecycle + application_id (never set here).
const ROLE_FIELDS = [
  "role_type",
  "posted_at",
  "deadline",
  "link",
  "source",
  "visa_class",
  "eligible",
  "eligibility_note",
  "fit_note",
  "priority",
  "notes",
] as const;

// T2: on UPDATE only, posted_at is never copied through the generic
// whitelist loop — it is refreshed exclusively by the repost-staleness rule
// below, so a re-find inside 7 days leaves it untouched even when the
// payload carries a different value (which now happens: canonical_key can
// match a row the legacy exact triple never would have). Insert still uses
// the full ROLE_FIELDS (a brand-new row always takes the payload's posted_at).
const UPDATE_ROLE_FIELDS = ROLE_FIELDS.filter((key) => key !== "posted_at");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// T2: "returned after a gap" = the reference clock is more than 7 days
// behind now. A pre-migration row with no last_seen_at yet falls back to
// updated_at/created_at (DONE MEANS: null last_seen_at counts as stale only
// if THAT reference is itself >7 days old, not unconditionally).
function isStaleReFind(existingRole: Record<string, unknown>, nowMs: number): boolean {
  const reference =
    (existingRole.last_seen_at as string | null | undefined) ??
    (existingRole.updated_at as string | null | undefined) ??
    (existingRole.created_at as string | null | undefined);
  if (!reference) return false;
  return nowMs - new Date(reference).getTime() > SEVEN_DAYS_MS;
}

// 'applied' is deliberately NOT settable through upsert: only applyRoleAction
// (which pairs it with an application_id) may produce that state (security
// re-audit hardening, 2026-07-10). So the only settable value is "open".
export function isSettableLifecycle(
  value: string | null | undefined,
): value is (typeof ROLE_LIFECYCLES)[number] {
  return !!value && value !== "applied" && (ROLE_LIFECYCLES as readonly string[]).includes(value);
}

// Single source of truth for "add or flip a role": used by the watcher webhook
// and the upsert_role MCP tool. Looks the company up by name (created as a
// one-off, unwatched, if missing — SPEC §5); dedups on (company_id, title,
// posted_at); never touches an `applied` role and never sets application_id.
export async function upsertRole(
  supabase: SupabaseClient,
  input: UpsertRoleInput,
  nowIso: string = new Date().toISOString(),
): Promise<{ action: RoleUpsertDecision; role: unknown }> {
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("company is required");
  if (!title) throw new Error("title is required");

  // Escape LIKE metacharacters so "S&P_Global" style names match literally.
  const likeSafeName = company.replace(/[\\%_]/g, "\\$&");
  const { data: existingCompany, error: findError } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", likeSafeName)
    .maybeSingle();
  if (findError) throw new Error(`company lookup failed: ${findError.message}`);

  let companyId: string;
  if (existingCompany) {
    companyId = existingCompany.id;
  } else {
    const { data: created, error: createError } = await supabase
      .from("companies")
      .insert({ name: company, is_watched: false })
      .select("id")
      .single();
    if (createError) throw new Error(`company create failed: ${createError.message}`);
    companyId = created.id;
  }

  // T3: identity key computed once, used by both the tombstone check and the
  // role lookup below.
  const canonicalKey = deriveCanonicalKey({
    companyId,
    title,
    location: input.location,
    link: input.link,
  });

  // Tombstone gate (SPEC FR-052/053): a role the owner hard-deleted is remembered
  // by (company_id, title, posted_at) — the SAME triple the dedup below uses —
  // so any later watcher/MCP run posting the same posting is a no-op. Delete
  // stays sticky across scans. Checked before the role lookup: the row is gone,
  // so without this it would re-insert.
  // T3: ALSO matches on canonical_key, restricted to the ATS-id form (e.g. the
  // same Workday id resurfacing under a different title/posted_at). Tombstones
  // have no canonical_key column of their own (out of this lane's fence) and
  // no stored location, so the FALLBACK co:company|t:title|l:location form
  // cannot be derived reliably for one — and must not be attempted, since it
  // would collapse to company+title alone (ignoring posted_at) and swallow
  // the legacy dedup-triple semantics tests/tombstone-replay.test.ts locks
  // for a non-ATS-linked posting (a genuinely different posted_at must still
  // insert). The ATS-id form has no such ambiguity: it never depends on
  // posted_at or location in the first place.
  const incomingAtsId = extractAtsId(input.link);
  const { data: tombRows, error: tombError } = await supabase
    .from("tombstones")
    .select("id, title, posted_at, link")
    .eq("company_id", companyId);
  if (tombError) throw new Error(`tombstone lookup failed: ${tombError.message}`);
  const tombMatch = (tombRows ?? []).find((row) => {
    const t = row as Record<string, unknown>;
    const sameTriple =
      t.title === title && (input.posted_at == null ? t.posted_at == null : t.posted_at === input.posted_at);
    if (sameTriple) return true;
    if (!incomingAtsId) return false;
    return extractAtsId(t.link as string | null) === incomingAtsId;
  });
  if (tombMatch) {
    return { action: "skip_tombstoned", role: tombMatch };
  }

  // T3: identity lookup order — canonical_key first (oldest row by created_at
  // wins when more than one shares a key), then the legacy exact triple
  // (company_id, title, posted_at) for a row that predates the key.
  // Scoped by company_id (fold 2026-09-16, orchestrator review): the ATS-id
  // half of canonical_key is TENANT-scoped for Workday (wd:R.../wd:JR...) and
  // SuccessFactors (sf:...) — two different companies can both legitimately
  // carry "wd:R01171049" on their own Workday tenant, so an unscoped lookup
  // would silently merge two unrelated companies' rows into one. Greenhouse/
  // lever/ashby/smartrecruiters ids are already effectively global, so the
  // extra .eq costs nothing there. The fallback (co:<id>|...) form already
  // embeds company_id, so this is a no-op for it either way.
  const { data: byKey, error: keyFindError } = await supabase
    .from("roles")
    .select("*")
    .eq("company_id", companyId)
    .eq("canonical_key", canonicalKey)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (keyFindError) throw new Error(`role lookup failed: ${keyFindError.message}`);
  let existingRole = byKey ?? null;

  if (!existingRole) {
    // Dedup key is (company_id, title, posted_at); null posted_at needs .is().
    let roleQuery = supabase.from("roles").select("*").eq("company_id", companyId).eq("title", title);
    roleQuery =
      input.posted_at == null
        ? roleQuery.is("posted_at", null)
        : roleQuery.eq("posted_at", input.posted_at);
    const { data: byTriple, error: roleFindError } = await roleQuery.maybeSingle();
    if (roleFindError) throw new Error(`role lookup failed: ${roleFindError.message}`);
    existingRole = byTriple ?? null;
  }

  const action = resolveRoleUpsert(existingRole?.lifecycle as string | undefined, !!existingRole);

  // skip_applied (applied-lock) returns the existing row untouched — no write.
  if (action === "skip_applied") {
    return { action, role: existingRole };
  }

  if (action === "insert") {
    // Hard-impossible auto-remove (SPEC FR-012), INSERT ONLY: a brand-new posting
    // whose title the machine can be certain is off-target never enters the APPLY
    // inbox. Runs only on insert — a role the owner already kept (update path) is
    // his to delete, never auto-removed on a scanner re-find.
    if (!isTargetTitle(title)) {
      return { action: "skip_filtered", role: null };
    }
    const row: Record<string, unknown> = {
      company_id: companyId,
      title,
      lifecycle: isSettableLifecycle(input.lifecycle) ? input.lifecycle : "open",
      // D8: derived from the title (+ posting text when present), not caller-settable.
      season: ingestSeason(title, input.jd_text),
      family: ingestFamily(title),
      // T2/T3: computed server-side, never a payload field.
      last_seen_at: nowIso,
      canonical_key: canonicalKey,
    };
    for (const key of ROLE_FIELDS) {
      if (input[key] !== undefined) row[key] = input[key];
    }
    // D34 (MISSION v5): location from the ATS, set on insert like any other field.
    if (input.location !== undefined) row.location = input.location;
    const { data, error } = await supabase.from("roles").insert(row).select("*").single();
    if (error) throw new Error(`role insert failed: ${error.message}`);
    return { action, role: data };
  }

  // update: only fields explicitly provided; lifecycle only if valid; never
  // application_id.
  // T2/T3: last_seen_at and canonical_key are stamped on EVERY re-find,
  // regardless of source — computed server-side, never a payload field.
  // posted_at is deliberately excluded from the generic ROLE_FIELDS loop
  // below (see UPDATE_ROLE_FIELDS) and refreshed only by the repost rule.
  const patch: Record<string, unknown> = {
    updated_at: nowIso,
    last_seen_at: nowIso,
  };
  // T3 (done-gate P1-1): a stored ATS-id key is never downgraded to the
  // fallback form by a re-find whose link carries no id (a feed/alert copy of
  // a scanner row); write the key when the row has none or the payload has an id.
  if (existingRole.canonical_key == null || incomingAtsId) patch.canonical_key = canonicalKey;
  for (const key of UPDATE_ROLE_FIELDS) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  // D34: location backfills once, never churns — a scanner re-find must not
  // clobber a value the lazy JD capture (or a prior scan) already stored.
  if (input.location !== undefined && existingRole.location == null) patch.location = input.location;
  if (isSettableLifecycle(input.lifecycle)) patch.lifecycle = input.lifecycle;
  // D8: title is the dedup key for this row and never changes on an update, so
  // a re-derive here only matters for an older row that still has no value.
  // Task 2 D7 (2026-09-15): the /api/classify sweep sets season from the JD
  // text and stamps classified_at once; no producer supplies jd_text, so an
  // unconditional re-derive from the title alone would reset a sweep-fixed
  // season back to "unspecified" on the next scanner re-find, and the row
  // would never be swept again. A re-derive may only improve a missing or
  // "unspecified" season, and family is set only when none is stored.
  const storedSeason = existingRole.season as string | null | undefined;
  if (storedSeason == null || storedSeason === "unspecified") patch.season = ingestSeason(title, input.jd_text);
  if (existingRole.family == null) patch.family = ingestFamily(title);
  // T2: a repost (re-find after a >7-day gap) increments the counter and
  // refreshes posted_at from the payload; a re-find inside 7 days leaves
  // both alone (FR-002).
  if (isStaleReFind(existingRole, new Date(nowIso).getTime())) {
    patch.repost_count = ((existingRole.repost_count as number | null | undefined) ?? 0) + 1;
    if (input.posted_at !== undefined && input.posted_at !== (existingRole.posted_at as string | null | undefined)) {
      // T2 guard: the dedup triple index still holds; a historical duplicate owning that date keeps it
      let colliderQuery = supabase
        .from("roles")
        .select("id")
        .eq("company_id", companyId)
        .eq("title", title)
        .neq("id", existingRole.id as string);
      colliderQuery =
        input.posted_at == null ? colliderQuery.is("posted_at", null) : colliderQuery.eq("posted_at", input.posted_at);
      const { data: colliderRows, error: colliderError } = await colliderQuery.limit(1);
      if (colliderError) throw new Error(`dedup collision check failed: ${colliderError.message}`);
      if (!colliderRows || colliderRows.length === 0) {
        patch.posted_at = input.posted_at;
      }
    }
  }
  const { data, error } = await supabase
    .from("roles")
    .update(patch)
    .eq("id", existingRole.id)
    .select("*")
    .single();
  if (error) throw new Error(`role update failed: ${error.message}`);
  return { action, role: data };
}
