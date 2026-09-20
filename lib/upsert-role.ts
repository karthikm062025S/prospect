import type { QueryFn } from "./db";
import type { Season } from "./season";

// Ingest-time title gate. Until 2026-09-19 this was the CS-intern-only rule
// (INTERN + INCLUDE/EXCLUDE/STRONG_TECH, a copy of scripts/scan.mjs); addendum 2
// of the VTHacks build widened it to "every major, every level", so only the
// stale-year / wrong-term marker below still drops a posting.
// Widened 2026-09-02 (MISSION v7 D8): fall/spring/winter/autumn and co-op are no
// longer automatic rejections — lib/season.ts now classifies the term (and a
// title with no supported term still ingests as season:"unspecified", filtered
// by the Home season dropdown instead of dropped at the gate). Still reject any
// explicit year ≤2026 and a near-term "summer '20"–"summer '26".
const WRONG_TERM = /\b(2019|2020|2021|2022|2023|2024|2025|2026)\b|summer\s*'?2[0-6]\b/i;

// 2026-09-19 addendum 2 (VTHacks "every major, every level"): the insert gate
// is WIDE. A posting is kept unless its title carries a stale-year / wrong-term
// marker (WRONG_TERM); every function and every level is eligible. Mirrors
// scripts/scan-core.mjs isEligiblePosting (the L2 lane's widened scanner rule);
// tests/title-filter.test.ts locks it.
export function isTargetTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim()) return false;
  return !WRONG_TERM.test(title);
}

// Addendum 2: the posting level a source can state. Null when it did not.
export const ROLE_LEVELS = ["internship", "coop", "new_grad", "full_time", "research"] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

// Season/family derivation at ingest (MISSION v7 D8). Duplicated (not
// imported) from lib/season.ts / lib/family.ts: those two stay dependency-free
// pure modules (season.ts especially — "no imports" is part of their spec, for
// direct reuse by the Home filter UI and as SQL-backfill reference), but this
// file is imported DIRECTLY by tests/upsert-role.test.ts under
// `node --experimental-strip-types`, which cannot resolve an extensionless
// runtime *value* import between two lib/*.ts files (see CLAUDE.md's
// the module-resolution rule) — the same reason isTargetTitle
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

// VTHacks speed pass (2026-09-20): lib/family.ts's Family union moved to the
// all-majors taxonomy; this ingest-time duplicate still writes the OLD
// 9-bucket taxonomy strings (untouched below) because the read side
// (app/(app)/page.tsx, app/(app)/journey/page.tsx) now ALWAYS derives family
// from the title and never trusts this stored column (MISSION D7) — so the
// return type is a plain string, not the app's Family union, rather than
// rewriting the scanner's classifier in this same lane.
export function ingestFamily(title: string): string {
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
  // 2026-09-19 addendum (drop latency): the board's own publish timestamp
  // (Greenhouse first_published, Lever createdAt), ISO-8601. Stored on insert;
  // on update only when the stored value is null. Validated in
  // lib/watcher-payload.ts before it reaches here.
  source_posted_at?: string | null;
  // 2026-09-19 addendum 2: the source's own level label (ROLE_LEVELS); stored on
  // insert, on update only when the stored value is null. Validated in
  // lib/watcher-payload.ts; never derived here (lib/family.ts deriveLevel lands
  // with the L2 merge and is not imported yet).
  level?: RoleLevel | null;
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

// Column names in both helpers come from the fixed lists above plus the fixed
// keys upsertRole assigns, never from the payload.
async function insertRoleRow(q: QueryFn, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const keys = Object.keys(row);
  const inserted = await q<Record<string, unknown>>(
    `insert into roles (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    keys.map((key) => row[key]),
    "roles",
  );
  if (inserted.length !== 1) throw new Error(`DB_EXPECTED_ONE (roles): got ${inserted.length}`);
  return inserted[0];
}

async function updateRoleRow(q: QueryFn, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const keys = Object.keys(patch);
  const rows = await q<Record<string, unknown>>(
    `update roles set ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} where id = $1 returning *`,
    [id, ...keys.map((key) => patch[key])],
    "roles",
  );
  if (rows.length !== 1) throw new Error(`DB_EXPECTED_ONE (roles): got ${rows.length} for role ${id}`);
  return rows[0];
}

// Single source of truth for "add or flip a role": used by the watcher webhook
// and the upsert_role MCP tool. Looks the company up by name (created as a
// one-off, unwatched, if missing — SPEC §5); dedups on (company_id, title,
// posted_at); never touches an `applied` role and never sets application_id.
export async function upsertRole(
  q: QueryFn,
  input: UpsertRoleInput,
  nowIso: string = new Date().toISOString(),
): Promise<{ action: RoleUpsertDecision; role: unknown }> {
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("company is required");
  if (!title) throw new Error("title is required");

  // Escape LIKE metacharacters so "S&P_Global" style names match literally.
  const likeSafeName = company.replace(/[\\%_]/g, "\\$&");
  // limit 2: a second match means the name is ambiguous (the old .maybeSingle()
  // threw on duplicates; companies_name_ci_uidx makes this unreachable in practice).
  const companyMatches = await q<{ id: string }>(
    "select id from companies where name ilike $1 limit 2",
    [likeSafeName],
    "companies",
  );
  if (companyMatches.length > 1) throw new Error(`DB_AMBIGUOUS (companies): ${companyMatches.length} companies match name ${company}`);
  const [existingCompany] = companyMatches;

  let companyId: string;
  if (existingCompany) {
    companyId = existingCompany.id;
  } else {
    const [created] = await q<{ id: string }>(
      "insert into companies (name, is_watched) values ($1, false) returning id",
      [company],
      "companies",
    );
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
  const tombRows = await q<{ id: string; title: string; posted_at: string | null; link: string | null }>(
    "select id, title, posted_at, link from tombstones where company_id = $1",
    [companyId],
    "tombstones",
  );
  const tombMatch = tombRows.find((row) => {
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
  const [byKey] = await q<Record<string, unknown>>(
    "select * from roles where company_id = $1 and canonical_key = $2 order by created_at asc limit 1",
    [companyId, canonicalKey],
    "roles",
  );
  let existingRole: Record<string, unknown> | null = byKey ?? null;

  if (!existingRole) {
    // Dedup key is (company_id, title, posted_at); IS NOT DISTINCT FROM treats a
    // null posted_at as a value, matching the NULLS NOT DISTINCT unique index.
    const [byTriple] = await q<Record<string, unknown>>(
      "select * from roles where company_id = $1 and title = $2 and posted_at is not distinct from $3::date limit 1",
      [companyId, title, input.posted_at ?? null],
      "roles",
    );
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
    // Drop-latency addendum: the board's own publish time rides in on insert.
    if (input.source_posted_at != null) row.source_posted_at = input.source_posted_at;
    // Addendum 2: the source's level, when it stated one.
    if (input.level != null) row.level = input.level;
    return { action, role: await insertRoleRow(q, row) };
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
  // Drop-latency addendum: backfills once, never churns (same rule as location).
  if (input.source_posted_at != null && existingRole.source_posted_at == null) patch.source_posted_at = input.source_posted_at;
  // Addendum 2: level backfills once, never churns.
  if (input.level != null && existingRole.level == null) patch.level = input.level;
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
      const colliderRows = await q<{ id: string }>(
        "select id from roles where company_id = $1 and title = $2 and id <> $3 and posted_at is not distinct from $4::date limit 1",
        [companyId, title, existingRole.id as string, input.posted_at ?? null],
        "roles",
      );
      if (colliderRows.length === 0) {
        patch.posted_at = input.posted_at;
      }
    }
  }
  return { action, role: await updateRoleRow(q, existingRole.id as string, patch) };
}
