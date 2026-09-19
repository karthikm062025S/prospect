import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFeed, ingestFeeds } from "../scripts/read-feeds.mjs";
import { parseAlertEmail, ingestCandidates, loadContext, detectSource } from "../scripts/read-alerts.mjs";
import { upsertRole, type UpsertRoleInput } from "../lib/upsert-role.ts";
import { buildHomeList } from "../lib/sort.ts";
import type { RoleWithCompany } from "../lib/types.ts";
import { fakeSupabase, type Row } from "./helpers/fake-supabase.ts";

// SC-3 (01-prd.md): "Zero duplicate visible roles across a full watcher cycle,
// verified by a dedup regression test suite over real ingest fixtures." RB-006 /
// TRD §4: ingestion dedups on the (company_id, title, posted_at) triple; display
// additionally collapses same-title repostings (a different posted_at) down to
// one row, keeping the newest.
//
// This test drives the SAME entry points tests/read-feeds.test.ts and
// tests/read-alerts.test.ts already prove parse the real fixtures correctly
// (parseFeed/ingestFeeds, parseAlertEmail/ingestCandidates) — it never
// re-implements parsing — then feeds every surviving candidate through the REAL
// upsertRole (tests/tombstone-replay.test.ts's fake Supabase client, moved to
// tests/helpers/fake-supabase.ts so both suites share one stub) to prove the
// full ingest-cycle dedup identity, and finally through the REAL buildHomeList
// (tests/sort.test.ts) to prove the display-collapse identity.

const here = dirname(fileURLToPath(import.meta.url));
const readFeedFx = (name: string) => readFile(join(here, "fixtures", "feeds", name), "utf8");
const readAlertFx = (name: string) => readFile(join(here, "fixtures", "alerts", name), "utf8");

let ctxCache: Awaited<ReturnType<typeof loadContext>> | undefined;
const getCtx = async () => (ctxCache ??= await loadContext());

const FEED_FILES = [
  { file: "simplify.md", listName: "simplify" },
  { file: "vanshb03.md", listName: "vanshb03" },
  { file: "speedyapply.md", listName: "speedyapply" }, // known 0-candidate case: 6-col layout, parser incompatible
] as const;

const ALERT_FILES = [
  { file: "linkedin.eml", source: "linkedin" },
  { file: "indeed.eml", source: "indeed" },
  { file: "handshake.eml", source: "handshake" },
  { file: "direct.eml", source: "direct" },
  { file: "malformed.eml", source: detectSource("newsletter@thedailybyte.example") }, // known 0-candidate case
] as const;

// Parses every fixture in both dirs (mirroring each script's own main(): all
// lists/messages collect into ONE pairs array before the single ingestFeeds /
// ingestCandidates call runs its in-batch cross-source dedup) and returns the
// per-fixture raw-candidate counts plus the combined surviving-role pool that a
// real watcher cycle would POST to the webhook.
async function buildAllCandidates() {
  const ctx = await getCtx();

  const feedCandCounts: Record<string, number> = {};
  const feedPairs: Array<{ cand: unknown; listName: string }> = [];
  for (const { file, listName } of FEED_FILES) {
    const md = await readFeedFx(file);
    const cands = parseFeed(md, listName);
    feedCandCounts[file] = cands.length;
    for (const cand of cands) feedPairs.push({ cand, listName });
  }

  const alertCandCounts: Record<string, number> = {};
  const alertPairs: Array<{ cand: unknown; source: string }> = [];
  for (const { file, source } of ALERT_FILES) {
    const raw = await readAlertFx(file);
    const cands = await parseAlertEmail(raw, source);
    alertCandCounts[file] = cands.length;
    for (const cand of cands) alertPairs.push({ cand, source });
  }

  // Wide window (3650d): this integration test is about dedup identity, not the
  // recency window (already covered by tests/read-feeds.test.ts), and it keeps
  // vanshb03.md's fixed absolute dates ("Jul 12" etc.) from going stale as real
  // time passes.
  const feedResult = ingestFeeds(feedPairs, ctx, 3650);
  const alertResult = ingestCandidates(alertPairs, ctx);

  return {
    feedCandCounts,
    alertCandCounts,
    roles: [...feedResult.roles, ...alertResult.roles] as UpsertRoleInput[],
  };
}

function freshTables(): Record<string, Row[]> {
  return { companies: [], roles: [], tombstones: [] };
}

function tripleKey(row: Row): string {
  return `${row.company_id}|${row.title}|${row.posted_at ?? "null"}`;
}

function companyNameOf(tables: Record<string, Row[]>, companyId: unknown): string {
  const company = tables.companies.find((c) => c.id === companyId);
  return (company?.name as string | undefined) ?? "UNKNOWN_COMPANY";
}

// Fake-DB role rows carry no created_at (upsertRole never sets one; a real
// Postgres default would). RoleWithCompany.sortRoles/collapseDuplicates need
// created_at to order/collapse, so this test assigns one deterministically from
// call order — the same thing a real watcher cycle's wall-clock would give it.
function toRoleWithCompany(row: Row, tables: Record<string, Row[]>, createdAt: string): RoleWithCompany {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    title: row.title as string,
    role_type: (row.role_type as string | null) ?? null,
    lifecycle: (row.lifecycle as RoleWithCompany["lifecycle"]) ?? "open",
    posted_at: (row.posted_at as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    link: (row.link as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    visa_class: null,
    eligible: null,
    eligibility_note: null,
    location: (row.location as string | null) ?? null,
    season: "unspecified",
    family: "other",
    jd_snapshot: null,
    jd_snapshot_at: null,
    fit_note: null,
    priority: null,
    application_id: null,
    notes: null,
    created_at: createdAt,
    updated_at: (row.updated_at as string | undefined) ?? createdAt,
    apply_clicked_at: null,
    saved_at: null,
    hidden_at: null,
    jd_error: null,
    company_name: companyNameOf(tables, row.company_id),
  };
}

test("case 1: every fixture in feeds/ + alerts/ parses; the full pool survives upsertRole with zero duplicate (company_id,title,posted_at) triples", async () => {
  const { feedCandCounts, alertCandCounts, roles } = await buildAllCandidates();

  // Per-fixture candidate counts, asserted explicitly (incl. the two known
  // zero-candidate fixtures) so a regression names its own fixture, not a bulk
  // total.
  assert.equal(feedCandCounts["simplify.md"], 7, "simplify.md must parse 7 candidate rows (the 🔒 closed Palantir row yields none)");
  assert.equal(feedCandCounts["vanshb03.md"], 3, "vanshb03.md must parse 3 candidate rows (the 🔒 closed Globex row yields none)");
  assert.equal(
    feedCandCounts["speedyapply.md"],
    0,
    "speedyapply.md must parse 0 candidates (6-column Salary layout is incompatible with the 5-column parser — source disabled)",
  );
  assert.equal(alertCandCounts["linkedin.eml"], 6, "linkedin.eml must parse 6 candidate cards");
  assert.equal(alertCandCounts["indeed.eml"], 3, "indeed.eml must parse 3 candidate cards");
  assert.equal(alertCandCounts["handshake.eml"], 1, "handshake.eml must parse 1 candidate card (the 'View job' CTA card yields none)");
  assert.equal(alertCandCounts["direct.eml"], 1, "direct.eml must parse 1 candidate card");
  assert.equal(alertCandCounts["malformed.eml"], 0, "malformed.eml (unrecognized newsletter format) must parse 0 candidates, not throw");

  // 12 = (feed: 4 simplify survivors + 2 vanshb03 survivors) + (alert: 2
  // linkedin + 3 indeed + 1 handshake survivors); direct.eml's one candidate
  // (Google / "Software Engineer Intern, Summer 2027") is the SAME role
  // linkedin.eml already surfaced, so ingestCandidates' own in-batch cross-source
  // dedup drops it here — proof that dedup already fires before upsertRole ever
  // runs, exactly the "two watchers ingest the same role" edge case (01-prd.md §5).
  assert.equal(
    roles.length,
    12,
    `expected 12 surviving candidate roles across both lanes, got ${roles.length}: ${JSON.stringify(roles.map((r) => `${r.company}/${r.title}`))}`,
  );

  const tables = freshTables();
  const supabase = fakeSupabase(tables);

  for (const role of roles) {
    const result = await upsertRole(supabase, role);
    assert.equal(
      result.action,
      "insert",
      `upsertRole(${role.company} / "${role.title}") on a fresh table set must insert, got "${result.action}"`,
    );
  }

  assert.equal(tables.roles.length, 12, "a fresh full ingest cycle over the fixtures must produce exactly 12 role rows");

  const triples = tables.roles.map(tripleKey);
  assert.equal(
    new Set(triples).size,
    triples.length,
    `duplicate (company_id,title,posted_at) triple survived a full ingest cycle: ${JSON.stringify(triples)}`,
  );
});

test("case 2: a watcher replay (the SAME candidate list ingested a second time) inserts nothing and leaves the row count unchanged", async () => {
  const { roles } = await buildAllCandidates();
  const tables = freshTables();
  const supabase = fakeSupabase(tables);

  for (const role of roles) await upsertRole(supabase, role);
  const countAfterFirstPass = tables.roles.length;
  assert.equal(countAfterFirstPass, 12, "first pass must produce 12 rows before the replay is meaningful");

  const secondPassActions: string[] = [];
  for (const role of roles) {
    const result = await upsertRole(supabase, role);
    secondPassActions.push(result.action);
  }

  const inserts = secondPassActions.filter((a) => a === "insert");
  assert.equal(
    inserts.length,
    0,
    `a same-cycle replay must insert 0 new rows, got ${inserts.length} inserts: ${JSON.stringify(secondPassActions)}`,
  );
  assert.ok(
    secondPassActions.every((a) => a === "update"),
    `every replayed role should resolve to "update" (existing, unlocked), got: ${JSON.stringify(secondPassActions)}`,
  );
  assert.equal(tables.roles.length, countAfterFirstPass, "roles table row count must be unchanged after the replay");
});

test("case 3: RB-006 display collapse over the real ingest output — buildHomeList shows zero duplicate (company_id, normalized title) rows and one group per company", async () => {
  const { roles } = await buildAllCandidates();
  const tables = freshTables();
  const supabase = fakeSupabase(tables);

  const baseTime = Date.parse("2026-08-23T00:00:00.000Z");
  const withCompany: RoleWithCompany[] = [];
  for (const [i, role] of roles.entries()) {
    const { role: inserted } = await upsertRole(supabase, role);
    const createdAt = new Date(baseTime + i * 1000).toISOString();
    withCompany.push(toRoleWithCompany(inserted as Row, tables, createdAt));
  }
  assert.equal(withCompany.length, 12, "expected 12 RoleWithCompany rows built from the fresh ingest cycle");

  const groups = buildHomeList(withCompany, { sort: "recent", query: "" });

  // Every group's company_id must be unique across the whole home list — this
  // is guaranteed by groupByCompany's own construction, but SC-3 asks that it
  // be proven, not assumed.
  const groupCompanyIds = groups.map((g) => g.company_id);
  assert.equal(
    new Set(groupCompanyIds).size,
    groupCompanyIds.length,
    `two groups shared a company_id: ${JSON.stringify(groupCompanyIds)}`,
  );

  // Flatten and check the RB-006 display identity across ALL groups, not just
  // within one.
  const allRoles = groups.flatMap((g) => g.roles);
  assert.equal(allRoles.length, 12, "no role should be dropped or duplicated by the display pipeline when no ingest-level collision exists yet");
  const displayKeys = allRoles.map((r) => `${r.company_id}|${r.title.trim().toLowerCase()}`);
  assert.equal(
    new Set(displayKeys).size,
    displayKeys.length,
    `two displayed roles shared a (company_id, normalized title) identity: ${JSON.stringify(displayKeys)}`,
  );

  // Ground-truth grouping sanity: Google/Citadel/Two Sigma each surfaced 3
  // distinct-titled roles across the fixtures (feed + alert lanes both hit
  // them); Foobar Labs surfaced 2; Citadel Securities 1. 5 companies, 12 roles.
  assert.equal(groups.length, 5, `expected 5 company groups (Google, Citadel, Foobar Labs, Two Sigma, Citadel Securities), got ${groups.length}: ${JSON.stringify(groupCompanyIds)}`);
});

test("case 4 (Pain-6 re-posting, Task 3 T2/T3): identity now matches on canonical_key, so a re-listing UPDATES the same row with a repost counter instead of inserting a duplicate", async () => {
  const { roles } = await buildAllCandidates();
  const tables = freshTables();
  const supabase = fakeSupabase(tables);

  const baseTime = Date.parse("2026-08-23T00:00:00.000Z");
  const withCompany: RoleWithCompany[] = [];
  for (const [i, role] of roles.entries()) {
    const { role: inserted } = await upsertRole(supabase, role);
    const createdAt = new Date(baseTime + i * 1000).toISOString();
    withCompany.push(toRoleWithCompany(inserted as Row, tables, createdAt));
  }
  assert.equal(tables.roles.length, 12, "expected 12 rows after the fresh ingest cycle");

  // The repost: same company + same title (RB-006 defines "duplicate" as
  // company_id + trimmed-lowercased title) as the Google/"Software Engineer
  // Intern" role from simplify.md, but a DIFFERENT posted_at and different
  // casing/whitespace — a same-title repost, the exact Pain-6 case TRD §4
  // names the display collapse for. Neither role carries a link, so identity
  // falls back to company+normalized-title+normalized-location (T3), which
  // the casing/whitespace-only title change does not disturb.
  const original = roles.find((r) => r.company === "Google" && r.title === "Software Engineer Intern");
  assert.ok(original, "fixture assumption broken: expected a Google / 'Software Engineer Intern' role from simplify.md in the candidate pool");

  const storedRow = tables.roles.find(
    (r) => r.title === "Software Engineer Intern" && companyNameOf(tables, r.company_id) === "Google",
  ) as Row;
  assert.ok(storedRow, "expected the original Google role row in the fake roles table");
  // Age the stored row's last_seen_at past the T2 7-day repost threshold so
  // the re-find below is recognized as a genuine re-listing.
  storedRow.last_seen_at = new Date(baseTime - 10 * 24 * 60 * 60 * 1000).toISOString();

  const repostInput: UpsertRoleInput = {
    ...(original as UpsertRoleInput),
    title: "  SOFTWARE ENGINEER INTERN  ",
    posted_at: "2026-07-01",
  };
  const repostResult = await upsertRole(supabase, repostInput);
  assert.equal(
    repostResult.action,
    "update",
    `T3: the repost must resolve to the SAME row via canonical_key, got "${repostResult.action}"`,
  );
  assert.equal((repostResult.role as Row).id, storedRow.id, "the repost must update the ORIGINAL row, not create a new one");
  assert.equal((repostResult.role as Row).repost_count, 1, "a re-find after a >7-day gap must increment repost_count to 1");
  assert.equal((repostResult.role as Row).posted_at, "2026-07-01", "posted_at must be refreshed from the repost payload");

  // Ingest level: the roles table still holds exactly 12 rows — the repost
  // was recognized as the SAME posting, not a new triple (T3 fixes the old
  // Pain-6 double-row behavior at the ingest layer, not just at display time).
  assert.equal(tables.roles.length, 12, "the repost must not create a new row; roles table must still hold 12 rows");
  const googleId = (repostResult.role as Row).company_id;
  const googleTriples = tables.roles.filter((r) => r.company_id === googleId && r.title === "Software Engineer Intern");
  assert.equal(googleTriples.length, 1, "exactly one row for this identity must exist after the repost");

  const idx = withCompany.findIndex((r) => r.id === storedRow.id);
  withCompany[idx] = toRoleWithCompany(repostResult.role as Row, tables, withCompany[idx].created_at);

  const groups = buildHomeList(withCompany, { sort: "recent", query: "" });
  const allRoles = groups.flatMap((g) => g.roles);
  assert.equal(allRoles.length, 12, "no role should be dropped or duplicated by the display pipeline after the repost");

  const matches = allRoles.filter((r) => r.company_id === googleId && r.title.trim().toLowerCase() === "software engineer intern");
  assert.equal(
    matches.length,
    1,
    `display collapse must show exactly ONE row for this company+title identity, got ${matches.length}: ${JSON.stringify(matches.map((r) => ({ id: r.id, title: r.title, posted_at: r.posted_at })))}`,
  );
  assert.equal(matches[0].posted_at, "2026-07-01", "the surviving displayed row must carry the repost's posted_at");

  // And the display-collapse identity still holds globally across the whole list.
  const displayKeys = allRoles.map((r) => `${r.company_id}|${r.title.trim().toLowerCase()}`);
  assert.equal(
    new Set(displayKeys).size,
    displayKeys.length,
    `two displayed roles shared a (company_id, normalized title) identity after the repost: ${JSON.stringify(displayKeys)}`,
  );
});
