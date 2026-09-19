import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRoleUpsert,
  isSettableLifecycle,
  toInsertedRoleEcho,
  ingestSeason,
  ingestFamily,
  upsertRole,
} from "../lib/upsert-role.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

type Row = Record<string, unknown>;
const CO_1 = uuid(10);
const CO_A = uuid(11);
const R_1 = uuid(21);
const R_COLLIDER = uuid(22);
const R_NEW = uuid(23);
const R_OLD = uuid(24);
const R_A = uuid(25);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(() => truncateAll(db.q));

const rolesCount = async () => (await db.q<{ n: number }>("select count(*)::int as n from roles"))[0].n;
const roleById = async (id: string) => (await db.q<Row>("select * from roles where id = $1", [id]))[0];
async function seedCompany(id = CO_1, name = "Acme") {
  await insertRow(db.q, "companies", { id, name });
}
async function seedRole(row: Row) {
  await insertRow(db.q, "roles", { company_id: CO_1, lifecycle: "open", location: null, ...row });
}

// Task 2 D7 (L2 fold 2, 2026-09-15): a scanner re-find must never undo what
// the /api/classify sweep wrote. The update path re-derives season from the
// title only (no producer supplies jd_text), so an unguarded re-derive would
// reset a sweep-fixed "summer_2027" back to "unspecified" while classified_at
// stays set and the row is never swept again. Same entry point the watcher
// and scan routes call (tests/watcher-location.test.ts's fixture shape).
const REFIND = { company: "Acme", link: "https://acme.example/jobs/1", posted_at: "2026-08-01" };
async function seeded(title: string, season: string, family: string | null) {
  await seedCompany();
  await seedRole({ id: R_1, title, posted_at: REFIND.posted_at, season, family });
}

test("update leaves a stored season alone when the title alone says unspecified", async () => {
  await seeded("Engineering Intern", "summer_2027", "ai_ml");
  const result = await upsertRole(db.q, { ...REFIND, title: "Engineering Intern" });
  assert.equal(result.action, "update");
  const role = result.role as { season: string; family: string };
  assert.equal(role.season, "summer_2027");
  assert.equal(role.family, "ai_ml"); // a stored family is never re-derived either
});

test("update still self-heals an unspecified season and a null family from the title", async () => {
  await seeded("Software Engineer Intern Summer 2027", "unspecified", null);
  const result = await upsertRole(db.q, { ...REFIND, title: "Software Engineer Intern Summer 2027" });
  assert.equal(result.action, "update");
  const role = result.role as { season: string; family: string };
  assert.equal(role.season, "summer_2027");
  assert.equal(role.family, "swe");
});

// Addendum 2 (2026-09-19, "every major, every level"): the insert gate is WIDE.
// These two lock the flip at the upsertRole level (tests/title-filter.test.ts
// locks the predicate itself): a non-CS title INSERTS, a wrong-term title is
// still skip_filtered.
test("a non-CS internship title ('Marketing Intern') is INSERTED by the wide gate (was skip_filtered)", async () => {
  await seedCompany();
  const result = await upsertRole(db.q, { company: "Acme", title: "Marketing Intern", posted_at: "2026-08-01" });
  assert.equal(result.action, "insert");
  assert.equal((result.role as Row).level, null, "no level in the payload -> null, never guessed");
  assert.equal(await rolesCount(), 1);
});

test("a wrong-term title is still skip_filtered by the wide gate", async () => {
  await seedCompany();
  const result = await upsertRole(db.q, { company: "Acme", title: "Software Engineer Intern - Fall 2026", posted_at: "2026-08-01" });
  assert.equal(result.action, "skip_filtered");
  assert.equal(await rolesCount(), 0);
});

test("inserts when no existing role", () => {
  assert.equal(resolveRoleUpsert(undefined, false), "insert");
});

test("skips an existing applied role (the applied-lock handshake)", () => {
  assert.equal(resolveRoleUpsert("applied", true), "skip_applied");
});

test("updates an existing open role", () => {
  assert.equal(resolveRoleUpsert("open", true), "update");
});

test("'applied' is not a settable lifecycle via upsert; 'open' is", () => {
  assert.equal(isSettableLifecycle("applied"), false);
  assert.equal(isSettableLifecycle("open"), true);
  assert.equal(isSettableLifecycle("eligible"), false); // collapsed away
  assert.equal(isSettableLifecycle("bogus"), false);
  assert.equal(isSettableLifecycle(null), false);
});

// The watcher webhook's `inserted_roles` identity echo (SPEC: notify on real
// inserts, not a date proxy). Built straight from the request input, so it's
// testable without a database — mirrors how resolveRoleUpsert /
// isSettableLifecycle are tested above instead of upsertRole itself.
test("toInsertedRoleEcho echoes the six contract fields, defaulting missing ones to null", () => {
  const echo = toInsertedRoleEcho({
    company: "Acme",
    title: "SWE Intern",
    link: "https://acme.example/jobs/1",
    source: "greenhouse",
  });
  assert.deepEqual(echo, {
    company: "Acme",
    title: "SWE Intern",
    role_type: null,
    link: "https://acme.example/jobs/1",
    source: "greenhouse",
    posted_at: null,
  });
});

test("toInsertedRoleEcho passes through all six fields when provided", () => {
  const echo = toInsertedRoleEcho({
    company: "Beta",
    title: "AI Intern",
    role_type: "ai",
    link: "https://beta.example/jobs/2",
    source: "lever",
    posted_at: "2026-07-01",
  });
  assert.deepEqual(echo, {
    company: "Beta",
    title: "AI Intern",
    role_type: "ai",
    link: "https://beta.example/jobs/2",
    source: "lever",
    posted_at: "2026-07-01",
  });
});

// Parity lock (MISSION v7 D8): ingestSeason/ingestFamily are duplicated (not
// imported — see the module-resolution comment above their definitions) from
// lib/season.ts/lib/family.ts. Rather than cross-import the canonical modules
// here too (which would cost another tsc-baseline TS5097 line beyond the two
// that season.test.ts/family.test.ts already add), this mirrors the SAME
// title -> expected-value pairs asserted there as plain literals — the exact
// pattern tests/title-filter.test.ts already uses to lock isTargetTitle
// against scripts/scan.mjs's copy. A rule change in one place without the
// other fails a test on both sides.
const SEASON_PARITY: Array<[string, string]> = [
  ["Software Engineer Intern - Summer 2027 (Remote)", "summer_2027"],
  ["Fall 2027 Co-op", "fall_2027"],
  ["Spring 2028 Software Engineering Intern", "spring_2028"],
  ["Summer 2028 Software Engineering Intern", "summer_2028"],
  ["Summer 2026 Intern", "unspecified"],
  ["Winter 2027 Intern", "unspecified"],
  ["Co-op Software Engineer", "coop"],
  ["Fall Software Engineering Intern", "fall_2027"],
  ["2027 SWE Internship", "summer_2027"],
  ["Software Engineer Intern", "unspecified"],
];

const FAMILY_PARITY: Array<[string, string]> = [
  ["Quantitative Trader Intern", "quant"],
  ["Machine Learning Intern", "ai_ml"],
  ["Data Scientist Intern", "data"],
  ["Security Engineer Intern", "security"],
  ["Firmware Engineer Intern", "hardware"],
  ["UX Designer Intern", "design"],
  ["Product Manager Intern", "product"],
  ["Software Engineer Intern", "swe"],
  ["Campus Crypto Researcher (Intern)", "other"],
  // v7/feed lane 2026-09-03: the widened DATA/SWE signals and the
  // SECURITY-before-DATA ordering must hold in the ingest copy too.
  ["Data Analytics Intern", "data"],
  ["Product Analyst Intern", "data"],
  ["Security Analyst Intern", "security"],
  ["Cloud Infrastructure Intern", "swe"],
  ["NVIDIA 2027 Internships: Ph.D. Research Large Language Models", "ai_ml"],
];

for (const [title, expected] of SEASON_PARITY) {
  test(`ingestSeason(${JSON.stringify(title)}) -> ${expected} (parity with lib/season.ts)`, () => {
    assert.equal(ingestSeason(title), expected);
  });
}

for (const [title, expected] of FAMILY_PARITY) {
  test(`ingestFamily(${JSON.stringify(title)}) -> ${expected} (parity with lib/family.ts)`, () => {
    assert.equal(ingestFamily(title), expected);
  });
}

// Task 3 T2/T3 (lane L1, 2026-09-16): liveness (last_seen_at, repost_count)
// and identity (canonical_key) on the upsert write path. MISSION V2.

test("insert stamps last_seen_at and canonical_key, computed server-side", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern, Summer 2027", posted_at: "2026-08-01" },
    nowIso,
  );
  assert.equal(result.action, "insert");
  const role = result.role as Row;
  assert.equal(role.last_seen_at, nowIso);
  assert.equal(role.canonical_key, `co:${role.company_id}|t:software engineer intern summer 2027|l:-`);
});

test("re-find re-stamps last_seen_at; a stale re-find (>7d) increments repost_count and refreshes posted_at on the SAME row; a fresh re-find (<7d) leaves both alone", async () => {
  const oldSeen = "2026-09-01T00:00:00.000Z"; // 15 days before the stale re-find below
  const staleNow = "2026-09-16T00:00:00.000Z";
  await seedCompany();
  await seedRole({
    id: R_1,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    season: "summer_2027",
    family: "swe",
    last_seen_at: oldSeen,
    repost_count: 0,
    canonical_key: `co:${CO_1}|t:software engineer intern|l:-`,
  });

  const staleResult = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-08-15" },
    staleNow,
  );
  assert.equal(staleResult.action, "update");
  const staleRole = staleResult.role as Row;
  assert.equal(staleRole.id, R_1, "must resolve to the SAME row via canonical_key");
  assert.equal(staleRole.last_seen_at, staleNow, "last_seen_at is re-stamped on every re-find");
  assert.equal(staleRole.repost_count, 1, "a re-find after a >7-day gap must increment repost_count");
  assert.equal(staleRole.posted_at, "2026-08-15", "posted_at must be refreshed from the payload on a stale re-find");
  assert.equal(await rolesCount(), 1, "the repost must not insert a new row");

  const freshNow = "2026-09-18T00:00:00.000Z"; // 2 days after staleNow
  const freshResult = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-09-01" },
    freshNow,
  );
  assert.equal(freshResult.action, "update");
  const freshRole = freshResult.role as Row;
  assert.equal(freshRole.last_seen_at, freshNow, "last_seen_at is re-stamped even on a fresh (non-stale) re-find");
  assert.equal(freshRole.repost_count, 1, "a re-find within 7 days must not increment repost_count again");
  assert.equal(freshRole.posted_at, "2026-08-15", "a re-find within 7 days must not refresh posted_at");
});

// Fold 2 2026-09-16 (consistency audit, MAJOR): roles_dedup_uidx unique
// (company_id, title, posted_at) still exists. A stale re-find must not blindly
// refresh posted_at into a value a DIFFERENT row of the same company+title
// already holds (a historical duplicate inserted under the old triple
// semantics, common on the live table) — that update would throw 23505 and
// abort the WHOLE patch, including last_seen_at, on every scanner cycle
// forever. The guard still increments repost_count and re-stamps last_seen_at.
test("a stale re-find whose new posted_at is already held by a DIFFERENT row of the same company+title skips the posted_at refresh, but still increments repost_count and re-stamps last_seen_at", async () => {
  const oldSeen = "2026-09-01T00:00:00.000Z"; // 15 days before the re-find below
  const nowIso = "2026-09-16T00:00:00.000Z";
  await seedCompany();
  await seedRole({
    id: R_1,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    season: "summer_2027",
    family: "swe",
    last_seen_at: oldSeen,
    repost_count: 0,
    canonical_key: `co:${CO_1}|t:software engineer intern|l:-`,
  });
  // A historical duplicate (old triple-dedup era) that already owns
  // (company_id, title, "2026-08-15") — the exact date the re-find below
  // would otherwise try to move r-1's posted_at to.
  await seedRole({
    id: R_COLLIDER,
    title: "Software Engineer Intern",
    posted_at: "2026-08-15",
    season: "summer_2027",
    family: "swe",
    last_seen_at: "2026-08-15T00:00:00.000Z",
    repost_count: 0,
    canonical_key: `co:${CO_1}|t:software engineer intern|l:different-location`, // never matched via canonical_key
  });

  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-08-15" },
    nowIso,
  );
  assert.equal(result.action, "update");
  const role = result.role as Row;
  assert.equal(role.id, R_1, "must still resolve to r-1 via canonical_key");
  assert.equal(role.last_seen_at, nowIso, "last_seen_at must still be re-stamped despite the guard");
  assert.equal(role.repost_count, 1, "repost_count must still increment despite the guard");
  assert.equal(role.posted_at, "2026-07-01", "posted_at must NOT be refreshed — r-collider already owns 2026-08-15 for this company+title");
  assert.equal(await rolesCount(), 2, "no row should be inserted or removed by the guard");
});

test("a pre-migration row with last_seen_at null counts as stale only when its own updated_at/created_at is older than 7 days", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  const fixture = async (updatedAt: string) => {
    await truncateAll(db.q);
    await seedCompany();
    await seedRole({
      id: R_1,
      title: "Data Analyst Intern",
      posted_at: "2026-07-01",
      season: "summer_2027",
      family: "data",
      last_seen_at: null,
      updated_at: updatedAt,
      canonical_key: `co:${CO_1}|t:data analyst intern|l:-`,
    });
  };
  await fixture("2026-09-01T00:00:00.000Z"); // 15 days old
  const staleResult = await upsertRole(
    db.q,
    { company: "Acme", title: "Data Analyst Intern", posted_at: "2026-08-20" },
    nowIso,
  );
  const staleRole = staleResult.role as Row;
  assert.equal(staleRole.repost_count, 1, "a null last_seen_at falls back to an updated_at that is itself >7 days old");
  assert.equal(staleRole.posted_at, "2026-08-20");

  await fixture("2026-09-15T00:00:00.000Z"); // 1 day old
  const freshResult = await upsertRole(
    db.q,
    { company: "Acme", title: "Data Analyst Intern", posted_at: "2026-08-20" },
    nowIso,
  );
  const freshRole = freshResult.role as Row;
  assert.equal(freshRole.repost_count ?? 0, 0, "a recent updated_at means a null last_seen_at is NOT treated as stale");
  assert.equal(freshRole.posted_at, "2026-07-01", "posted_at must not be refreshed inside the 7-day window");
});

test("a payload whose link carries the same Workday id as a stored row but a different title resolves to that row (update), inserting nothing", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  const link = "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049";
  await seedCompany();
  await seedRole({
    id: R_1,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    season: "summer_2027",
    family: "swe",
    last_seen_at: nowIso,
    repost_count: 0,
    canonical_key: "wd:R01171049",
  });
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Development Engineer Intern", link, posted_at: "2026-07-01" },
    nowIso,
  );
  assert.equal(result.action, "update");
  assert.equal((result.role as Row).id, R_1);
  assert.equal(await rolesCount(), 1, "a different title on the same ATS id must never insert a duplicate");
});

test("when two stored rows share a canonical_key, the OLDEST (by created_at) is the one updated", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  await seedCompany();
  await seedRole({
    id: R_NEW,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    season: "summer_2027",
    family: "swe",
    canonical_key: `co:${CO_1}|t:software engineer intern|l:-`,
    created_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-01T00:00:00.000Z",
  });
  await seedRole({
    id: R_OLD,
    title: "Software Engineer Intern",
    posted_at: "2026-06-01",
    season: "summer_2027",
    family: "swe",
    canonical_key: `co:${CO_1}|t:software engineer intern|l:-`,
    created_at: "2026-06-01T00:00:00.000Z",
    last_seen_at: "2026-06-01T00:00:00.000Z",
  });
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-08-01" },
    nowIso,
  );
  assert.equal(result.action, "update");
  assert.equal((result.role as Row).id, R_OLD, "the oldest matching row (by created_at) must be the one updated");
  assert.equal(await rolesCount(), 2, "no new row should be inserted");
});

test("a tombstone whose canonical_key matches (same Workday id, different title) blocks the insert", async () => {
  const link = "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049";
  await seedCompany();
  await insertRow(db.q, "tombstones", { company_id: CO_1, title: "Software Engineer Intern", posted_at: "2026-07-01", link });
  const result = await upsertRole(db.q, {
    company: "Acme",
    title: "Software Development Engineer Intern",
    link,
    posted_at: "2026-09-01",
  });
  assert.equal(result.action, "skip_tombstoned");
  assert.equal(await rolesCount(), 0, "a canonical-key-matched tombstone must never let the posting re-insert");
});

// Fold 2026-09-16 (orchestrator review, MAJOR): the ATS-id half of
// canonical_key is TENANT-scoped for Workday/SuccessFactors — two different
// companies can each legitimately carry "wd:R01171049" on their own Workday
// tenant. The canonical_key lookup must be scoped by company_id or it would
// merge two unrelated companies' rows into one.
// Task 3 done-gate P1-1 fix (2026-09-16): a stored ATS-id key must never be
// downgraded to the co: fallback by a re-find whose link carries no ATS id
// (e.g. a feed/alert copy of the same posting linking to an aggregator like
// simplify.jobs instead of the original ATS). Locks the update patch's
// `existingRole.canonical_key == null || incomingAtsId` guard directly.
test("a stored gh: canonical_key survives a legacy-triple re-find whose link has no ATS id", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  await seedCompany();
  await seedRole({ id: R_1, title: "Software Engineer Intern", posted_at: "2026-07-01", canonical_key: "gh:123" });
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-07-01", link: "https://simplify.jobs/p/abc" },
    nowIso,
  );
  assert.equal(result.action, "update");
  const role = result.role as Row;
  assert.equal(role.id, R_1);
  assert.equal(role.canonical_key, "gh:123", "an ATS-id key must never be downgraded to the co: fallback");
});

test("a stored null canonical_key gets the fallback co: key written on a legacy-triple re-find with no ATS id", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  await seedCompany();
  await seedRole({ id: R_1, title: "Software Engineer Intern", posted_at: "2026-07-01", canonical_key: null });
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-07-01", link: "https://simplify.jobs/p/abc" },
    nowIso,
  );
  assert.equal(result.action, "update");
  const role = result.role as Row;
  assert.equal(role.id, R_1);
  assert.equal(role.canonical_key, `co:${role.company_id}|t:software engineer intern|l:-`);
});

test("a stored co: fallback key is upgraded to wd:... when the re-find's payload carries a Workday id", async () => {
  const nowIso = "2026-09-16T00:00:00.000Z";
  const link = "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049";
  await seedCompany();
  await seedRole({
    id: R_1,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    canonical_key: `co:${CO_1}|t:software engineer intern|l:-`,
  });
  const result = await upsertRole(
    db.q,
    { company: "Acme", title: "Software Engineer Intern", posted_at: "2026-07-01", link },
    nowIso,
  );
  assert.equal(result.action, "update");
  const role = result.role as Row;
  assert.equal(role.id, R_1);
  assert.equal(role.canonical_key, "wd:R01171049", "a co: fallback key must upgrade to a real ATS id once one is seen");
});

test("a stored wd:R01171049 at company A does not match a payload carrying the same Workday id for company B — inserts a new row under B, leaves A untouched", async () => {
  const linkA = "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049";
  const linkB = "https://globex.wd2.myworkdayjobs.com/en-US/Careers/job/Remote/Data-Analyst-Intern_R01171049";
  await seedCompany(CO_A, "Acme");
  await seedRole({
    id: R_A,
    company_id: CO_A,
    title: "Software Engineer Intern",
    posted_at: "2026-07-01",
    season: "summer_2027",
    family: "swe",
    link: linkA,
    last_seen_at: "2026-09-01T00:00:00.000Z",
    repost_count: 0,
    canonical_key: "wd:R01171049",
  });
  const result = await upsertRole(db.q, {
    company: "Globex",
    title: "Data Analyst Intern",
    link: linkB,
    posted_at: "2026-09-01",
  });
  assert.equal(result.action, "insert", "the same Workday id under a DIFFERENT company must insert, not merge into A's row");
  const newRole = result.role as Row;
  assert.notEqual(newRole.company_id, CO_A, "the new row must belong to company B, not A");
  assert.equal(newRole.canonical_key, "wd:R01171049");

  const rowA = await roleById(R_A);
  assert.equal(rowA.title, "Software Engineer Intern", "company A's row must be untouched");
  assert.equal(rowA.repost_count, 0, "company A's row must not have been treated as a repost");
  assert.equal(await rolesCount(), 2, "two rows must now exist: A's original and B's new insert");
});
