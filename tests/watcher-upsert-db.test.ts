import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { upsertRole, isTargetTitle } from "../lib/upsert-role.ts";
import { parseWatcherPayload } from "../lib/watcher-payload.ts";
import { baselineDir } from "../scripts/import-baseline.mjs";
import { makeTestDb, type TestDb } from "./helpers/test-db.ts";

// The watcher's write path (app/api/watcher/route.ts -> upsertRole) against the
// real schema, driven by ONE REAL row from the 2026-09-04 export: first call
// inserts, an identical second call updates the same row, and a twin with a
// null posted_at dedups onto it (canonical_key + the NULLS NOT DISTINCT unique
// index) instead of inserting a second posting.
const DIR = baselineDir();
type ExportRole = { title: string; company_id: string; posted_at: string | null; link: string | null; location: string | null; source: string | null };
type ExportCompany = { id: string; name: string };

const roles = JSON.parse(readFileSync(join(DIR, "roles.json"), "utf8")) as ExportRole[];
const companies = JSON.parse(readFileSync(join(DIR, "companies.json"), "utf8")) as ExportCompany[];
const real = roles.find((r) => r.posted_at && r.link && isTargetTitle(r.title));
assert.ok(real, "the export holds at least one dated, linked, on-target role");
const company = companies.find((c) => c.id === real.company_id);
assert.ok(company, "the role's company is in the export");

const payload = {
  company: company.name,
  title: real.title,
  link: real.link,
  posted_at: real.posted_at,
  location: real.location,
  source: real.source,
};

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());

const rolesCount = async () => (await db.q<{ n: number }>("select count(*)::int as n from roles"))[0].n;

test("first upsert of the real row inserts it (and its company)", async () => {
  const result = await upsertRole(db.q, payload, "2026-09-19T15:00:00.000Z");
  assert.equal(result.action, "insert");
  const role = result.role as { title: string; posted_at: string; last_seen_at: string; canonical_key: string };
  assert.equal(role.title, real.title);
  assert.equal(role.posted_at, real.posted_at);
  assert.equal(role.last_seen_at, "2026-09-19T15:00:00.000Z");
  assert.ok(role.canonical_key);
  assert.equal(await rolesCount(), 1);
});

test("the identical second call updates the same row", async () => {
  const result = await upsertRole(db.q, payload, "2026-09-19T15:05:00.000Z");
  assert.equal(result.action, "update");
  assert.equal((result.role as { last_seen_at: string }).last_seen_at, "2026-09-19T15:05:00.000Z");
  assert.equal(await rolesCount(), 1);
});

test("a null-posted_at twin dedups onto the stored row instead of inserting", async () => {
  const result = await upsertRole(db.q, { ...payload, posted_at: null }, "2026-09-19T15:10:00.000Z");
  assert.equal(result.action, "update");
  assert.equal((result.role as { posted_at: string }).posted_at, real.posted_at, "a fresh re-find never clears posted_at");
  assert.equal(await rolesCount(), 1);
});

// 2026-09-19 addendum (drop latency): source_posted_at rides the watcher payload
// through parseWatcherPayload into the column; it backfills once, never churns.
test("a payload row with source_posted_at lands in roles.source_posted_at", async () => {
  const parsed = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: "2026-09-18T09:30:00Z" }] });
  assert.ok(parsed.ok);
  const result = await upsertRole(db.q, parsed.roles[0], "2026-09-19T15:15:00.000Z");
  assert.equal(result.action, "update");
  assert.equal((result.role as { source_posted_at: string | null }).source_posted_at, "2026-09-18T09:30:00.000Z");

  const again = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: "2026-09-01T00:00:00Z" }] });
  assert.ok(again.ok);
  const second = await upsertRole(db.q, again.roles[0], "2026-09-19T15:20:00.000Z");
  assert.equal((second.role as { source_posted_at: string }).source_posted_at, "2026-09-18T09:30:00.000Z", "never churned once set");

  const bad = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: "not a date" }] });
  assert.ok(bad.ok);
  assert.equal(bad.roles[0].source_posted_at, null, "an unparseable value is dropped, never stored");
});

// Addendum 3 (security review fold): strict ISO-8601 only, and never more than an hour in the future.
test("source_posted_at rejects non-ISO strings V8's Date.parse would accept", () => {
  for (const value of ["1", "12/31/2030", "2026-09-18", "2026-09-18 09:30:00", "Sep 18 2026"]) {
    const parsed = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: value }] });
    assert.ok(parsed.ok);
    assert.equal(parsed.roles[0].source_posted_at, null, `${JSON.stringify(value)} must be dropped`);
  }
  for (const value of ["2026-09-18T09:30Z", "2026-09-18T09:30:00Z", "2026-09-18T09:30:00.123+00:00", "2026-09-18T05:30:00-04:00"]) {
    const parsed = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: value }] });
    assert.ok(parsed.ok);
    assert.equal(parsed.roles[0].source_posted_at, new Date(value).toISOString(), `${JSON.stringify(value)} must be kept`);
  }
});

test("source_posted_at more than an hour in the future is dropped", () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const parsed = parseWatcherPayload({ roles: [{ ...payload, source_posted_at: future }, { ...payload, source_posted_at: soon }] });
  assert.ok(parsed.ok);
  assert.equal(parsed.roles[0].source_posted_at, null, "2 h ahead is dropped");
  assert.equal(parsed.roles[1].source_posted_at, soon, "30 min ahead (clock skew) is kept");
});

test("a brand-new row inserts with source_posted_at set", async () => {
  const parsed = parseWatcherPayload({
    roles: [{ company: company.name, title: "Software Engineer Intern, Summer 2027 (L0 latency probe)", source_posted_at: "2026-09-19T14:00:00Z" }],
  });
  assert.ok(parsed.ok);
  const result = await upsertRole(db.q, parsed.roles[0], "2026-09-19T15:30:00.000Z");
  assert.equal(result.action, "insert");
  assert.equal((result.role as { source_posted_at: string }).source_posted_at, "2026-09-19T14:00:00.000Z");
  const [row] = await db.q<{ source_posted_at: string }>("select source_posted_at from roles_public where id = $1", [(result.role as { id: string }).id]);
  assert.equal(row.source_posted_at, "2026-09-19T14:00:00.000Z", "exposed through roles_public");
});

// Addendum 2 (2026-09-19): `level` rides the watcher payload the same way;
// validated against the enum, backfills once, never churns; roles_public exposes it.
test("a payload row with level lands in roles.level; an invalid level is dropped; a stored level never churns", async () => {
  const parsed = parseWatcherPayload({ roles: [{ ...payload, level: "internship" }] });
  assert.ok(parsed.ok);
  const result = await upsertRole(db.q, parsed.roles[0], "2026-09-19T16:50:00.000Z");
  assert.equal(result.action, "update");
  assert.equal((result.role as { level: string | null }).level, "internship");

  const again = parseWatcherPayload({ roles: [{ ...payload, level: "full_time" }] });
  assert.ok(again.ok);
  const second = await upsertRole(db.q, again.roles[0], "2026-09-19T16:55:00.000Z");
  assert.equal((second.role as { level: string }).level, "internship", "never churned once set");

  const bad = parseWatcherPayload({ roles: [{ ...payload, level: "senior" }] });
  assert.ok(bad.ok);
  assert.equal(bad.roles[0].level, null, "a value outside the enum is dropped, never stored");

  const fresh = parseWatcherPayload({
    roles: [{ company: company.name, title: "Nursing Intern (L0 wide-gate probe)", level: "coop" }],
  });
  assert.ok(fresh.ok);
  const inserted = await upsertRole(db.q, fresh.roles[0], "2026-09-19T17:00:00.000Z");
  assert.equal(inserted.action, "insert", "a non-CS title is eligible (every major, every level)");
  const [row] = await db.q<{ level: string }>("select level from roles_public where id = $1", [(inserted.role as { id: string }).id]);
  assert.equal(row.level, "coop");
});
