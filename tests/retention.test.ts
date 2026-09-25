import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  parseParams,
  runRetentionSweep,
  retentionSweepRequest,
  makeRetentionDb,
  BATCH_SIZE,
  MAX_BATCHES,
  SEEN_DAYS,
  type RetentionDb,
} from "../lib/retention.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

// The free-tier
// retention prune behind POST /api/retention-sweep. makeRetentionDb's SQL
// runs against the REAL schema (pglite, tests/helpers/test-db.ts) so the
// NOT EXISTS / legacy-column predicate is proven against real Postgres
// semantics, not a hand-rolled JS reimplementation of it.

const COMPANY = uuid(1);
const OLD = "2000-01-01T00:00:00Z"; // far past any 30/45-day cutoff
const RECENT = new Date().toISOString(); // inside every cutoff this file uses

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme" });
});

// roles_dedup_uidx is unique on (company_id, title, posted_at) with nulls not
// distinct: every seeded role needs its own title so rows in the same test don't collide.
// last_seen_at defaults to created_at (a role's own insert stamps both the same way,
// lib/upsert-role.ts): pass last_seen_at in `extra` to test the D16 recency gate independently of age.
async function role(id: string, created_at: string, extra: Record<string, unknown> = {}) {
  await insertRow(db.q, "roles", { id, company_id: COMPANY, title: `SWE Intern ${id}`, created_at, last_seen_at: created_at, ...extra });
}

const rolesCount = async () => {
  const [row] = await db.q<{ n: number }>("select count(*)::int as n from roles");
  return row.n;
};

// Seeds one old role with no acted-on signal, one old role for each of the
// five acted-on kinds, and one recent (never-old) role. Only the plain old
// role is prune-eligible.
async function seedOneOfEachKind() {
  const PLAIN = uuid(10);
  const USER_ROLE = uuid(11);
  const APPLICATION = uuid(12);
  const CORRECTION = uuid(13);
  const LEGACY = uuid(14);
  const RECENT_ROLE = uuid(15);
  const OUTREACH = uuid(16);
  await role(PLAIN, OLD);
  await role(USER_ROLE, OLD);
  await role(APPLICATION, OLD);
  await role(CORRECTION, OLD);
  await role(LEGACY, OLD, { saved_at: OLD });
  await role(RECENT_ROLE, RECENT);
  await role(OUTREACH, OLD);
  await insertRow(db.q, "user_roles", { user_id: uuid(90), role_id: USER_ROLE });
  await insertRow(db.q, "applications", { id: uuid(91), user_id: uuid(90), company_id: COMPANY, role: "SWE", role_id: APPLICATION });
  await insertRow(db.q, "role_corrections", { user_id: uuid(90), role_id: CORRECTION, field: "season", value: "coop" });
  await insertRow(db.q, "outreach", {
    user_id: uuid(90),
    role_id: OUTREACH,
    company_name: "Acme",
    contact_name: "Jane",
  });
  return { PLAIN, USER_ROLE, APPLICATION, CORRECTION, LEGACY, RECENT_ROLE, OUTREACH };
}

test("makeRetentionDb excludes every acted-on kind (user_roles, applications, role_corrections, outreach, legacy column) and the not-old-enough role", async () => {
  const { PLAIN } = await seedOneOfEachKind();
  const retentionDb = makeRetentionDb(db.q);

  const would = await retentionDb.wouldDelete(45);
  assert.equal(would.would_delete, 1);
  assert.equal(would.oldest_created_at, new Date(OLD).toISOString());

  const excluded = await retentionDb.excludedActedOn(45);
  assert.equal(excluded, 5); // user_roles, applications, role_corrections, outreach, legacy saved_at (the recent role is excluded by age, not counted here)

  const deletedIds = await retentionDb.deleteBatch(45, BATCH_SIZE);
  assert.deepEqual(deletedIds, [PLAIN]);
  assert.equal(await rolesCount(), 6); // the 5 acted-on + the recent role all survive
});

// Fix round 1, P1: outreach.role_id (db/lakebase/001-schema.sql:145) is a
// user action tracked outside user_roles - a role with only an outreach row
// must never be pruned.
test("a role with only an outreach row is never deleted", async () => {
  const OUTREACH_ONLY = uuid(30);
  await role(OUTREACH_ONLY, OLD);
  await insertRow(db.q, "outreach", { user_id: uuid(90), role_id: OUTREACH_ONLY, company_name: "Acme", contact_name: "Jane" });
  const retentionDb = makeRetentionDb(db.q);

  assert.equal((await retentionDb.wouldDelete(45)).would_delete, 0);
  assert.equal(await retentionDb.excludedActedOn(45), 1);
  assert.deepEqual(await retentionDb.deleteBatch(45, BATCH_SIZE), []);
  assert.equal(await rolesCount(), 1); // survives
});

// a role old enough by created_at but still being
// FOUND by a scanner (last_seen_at inside SEEN_DAYS) must never be pruned -
// the old age-only predicate deleted it anyway, it re-inserted on the next
// scan as a "new" drop, and Karthik got a repeat email.
test("a role old by created_at but seen within SEEN_DAYS is never deleted, even with no acted-on signal", async () => {
  const STILL_LIVE = uuid(21);
  const recentlySeen = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
  await role(STILL_LIVE, OLD, { last_seen_at: recentlySeen });
  const retentionDb = makeRetentionDb(db.q);

  assert.equal((await retentionDb.wouldDelete(45)).would_delete, 0);
  assert.deepEqual(await retentionDb.deleteBatch(45, BATCH_SIZE), []);
  assert.equal(await rolesCount(), 1); // survives
});

test("a role old by created_at AND not seen for more than SEEN_DAYS is prune-eligible", async () => {
  const STALE = uuid(22);
  const staleSeen = new Date(Date.now() - (SEEN_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  await role(STALE, OLD, { last_seen_at: staleSeen });
  const retentionDb = makeRetentionDb(db.q);

  assert.equal((await retentionDb.wouldDelete(45)).would_delete, 1);
  assert.deepEqual(await retentionDb.deleteBatch(45, BATCH_SIZE), [STALE]);
});

// A pre-migration row with no last_seen_at yet is judged by updated_at, then
// created_at (same fallback as lib/upsert-role.ts's isStaleReFind) - never
// treated as "unseen" just because the column happens to be null.
test("null last_seen_at falls back to updated_at, then created_at, for the recency gate", async () => {
  const NULL_SEEN_RECENT_UPDATE = uuid(23);
  await role(NULL_SEEN_RECENT_UPDATE, OLD, { last_seen_at: null, updated_at: RECENT });
  const NULL_SEEN_STALE_UPDATE = uuid(24);
  const staleUpdate = new Date(Date.now() - (SEEN_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  await role(NULL_SEEN_STALE_UPDATE, OLD, { last_seen_at: null, updated_at: staleUpdate });
  const retentionDb = makeRetentionDb(db.q);

  const would = await retentionDb.wouldDelete(45);
  assert.equal(would.would_delete, 1);
  assert.deepEqual(await retentionDb.deleteBatch(45, BATCH_SIZE), [NULL_SEEN_STALE_UPDATE]);
  assert.equal(await rolesCount(), 1); // NULL_SEEN_RECENT_UPDATE survives
});

test("makeRetentionDb wouldDelete reports no rows and a null oldest_created_at when nothing is prune-eligible", async () => {
  await role(uuid(20), RECENT);
  const retentionDb = makeRetentionDb(db.q);
  const would = await retentionDb.wouldDelete(45);
  assert.equal(would.would_delete, 0);
  assert.equal(would.oldest_created_at, null);
});

test("runRetentionSweep dry run writes nothing", async () => {
  await seedOneOfEachKind();
  const out = await runRetentionSweep({ days: 45, dryRun: true, pruneEnabled: true }, makeRetentionDb(db.q));
  assert.deepEqual(out, {
    dry_run: true,
    would_delete: 1,
    excluded_acted_on: 5,
    oldest_created_at: new Date(OLD).toISOString(),
    days: 45,
  });
  assert.equal(await rolesCount(), 7); // nothing deleted
});

test("runRetentionSweep real run deletes the eligible role and reports remaining", async () => {
  await seedOneOfEachKind();
  const out = await runRetentionSweep({ days: 45, dryRun: false, pruneEnabled: true }, makeRetentionDb(db.q));
  assert.deepEqual(out, { dry_run: false, deleted: 1, excluded_acted_on: 5, remaining: 0 });
  assert.equal(await rolesCount(), 6);
});

test("runRetentionSweep honours a wider days window (30-day floor) without touching the acted-on set", async () => {
  await seedOneOfEachKind();
  const out = await runRetentionSweep({ days: 30, dryRun: true, pruneEnabled: true }, makeRetentionDb(db.q));
  assert.equal(out.dry_run, true);
  if (out.dry_run) {
    assert.equal(out.would_delete, 1);
    assert.equal(out.excluded_acted_on, 5);
  }
});

// D3/D11: the kill switch is enforced server-side. A caller
// that has the watcher secret but no RETENTION_PRUNE_ENABLED='1' can request
// dry_run=0 and still never get a real delete.
test("runRetentionSweep forces dry-run when the kill switch (pruneEnabled) is off, even if dryRun=false was requested", async () => {
  await seedOneOfEachKind();
  const out = await runRetentionSweep({ days: 45, dryRun: false, pruneEnabled: false }, makeRetentionDb(db.q));
  assert.equal(out.dry_run, true);
  if (out.dry_run) assert.equal(out.would_delete, 1);
  assert.equal(await rolesCount(), 7); // nothing deleted
});

// Batching (500/batch, max 10 calls) is pure control flow, tested with an
// in-memory fake so it does not require seeding thousands of real rows.
test("runRetentionSweep batches deletes at BATCH_SIZE and stops after MAX_BATCHES even if more remain", async () => {
  let calls = 0;
  const fake: RetentionDb = {
    wouldDelete: async () => ({ would_delete: 999, oldest_created_at: null }),
    excludedActedOn: async () => 0,
    deleteBatch: async (_days, limit) => {
      calls += 1;
      return Array.from({ length: limit }, (_, i) => `id-${calls}-${i}`); // always full: simulates more remaining
    },
  };
  const out = await runRetentionSweep({ days: 45, dryRun: false, pruneEnabled: true }, fake);
  assert.equal(calls, MAX_BATCHES);
  assert.equal(out.dry_run, false);
  if (!out.dry_run) assert.equal(out.deleted, BATCH_SIZE * MAX_BATCHES);
});

test("runRetentionSweep stops early once a batch comes back short", async () => {
  let calls = 0;
  const fake: RetentionDb = {
    wouldDelete: async () => ({ would_delete: 0, oldest_created_at: null }),
    excludedActedOn: async () => 0,
    deleteBatch: async () => {
      calls += 1;
      return ["only-one"]; // short batch: nothing left after this
    },
  };
  const out = await runRetentionSweep({ days: 45, dryRun: false, pruneEnabled: true }, fake);
  assert.equal(calls, 1);
  assert.equal(out.dry_run, false);
  if (!out.dry_run) assert.equal(out.deleted, 1);
});

test("parseParams defaults days to 45 and dry_run to true, clamps days below 30 up to 30, and only dry_run=0 asks for a real run", () => {
  assert.deepEqual(parseParams(new URL("https://x/api/retention-sweep")), { days: 45, dryRun: true });
  assert.equal(parseParams(new URL("https://x/api/retention-sweep?days=10")).days, 30);
  assert.equal(parseParams(new URL("https://x/api/retention-sweep?days=90")).days, 90);
  assert.equal(parseParams(new URL("https://x/api/retention-sweep?days=abc")).days, 45);
  assert.equal(parseParams(new URL("https://x/api/retention-sweep?dry_run=1")).dryRun, true);
  assert.equal(parseParams(new URL("https://x/api/retention-sweep?dry_run=0")).dryRun, false);
});

const post = (url: string, secret?: string) =>
  new Request(url, { method: "POST", headers: secret ? { "X-Watcher-Secret": secret } : {} });

function ctx(retentionDb: RetentionDb, opts: { expected?: string | null; pruneEnabled?: boolean } = {}) {
  const { expected = "secret", pruneEnabled = true } = opts;
  let built = 0;
  const logged: Record<string, unknown>[] = [];
  return {
    built: () => built,
    logged,
    ctx: {
      expected: expected ?? undefined,
      isCorrectPassword: (a: string, b: string) => a === b,
      pruneEnabled,
      db: () => {
        built += 1;
        return retentionDb;
      },
      log: (entry: Record<string, unknown>) => logged.push(entry),
    },
  };
}

const okDb: RetentionDb = {
  wouldDelete: async () => ({ would_delete: 0, oldest_created_at: null }),
  excludedActedOn: async () => 0,
  deleteBatch: async () => [],
};

test("retentionSweepRequest without the header returns 401 and never builds the db", async () => {
  const c = ctx(okDb);
  const out = await retentionSweepRequest(post("https://x/api/retention-sweep"), c.ctx);
  assert.deepEqual(out, { status: 401, body: { error: "unauthorized" } });
  assert.equal(c.built(), 0);
});

test("retentionSweepRequest with the wrong secret or no configured secret returns 401", async () => {
  const wrong = ctx(okDb);
  assert.equal((await retentionSweepRequest(post("https://x/api/retention-sweep", "nope"), wrong.ctx)).status, 401);
  const unset = ctx(okDb, { expected: null });
  assert.equal((await retentionSweepRequest(post("https://x/api/retention-sweep", "secret"), unset.ctx)).status, 401);
});

test("retentionSweepRequest with the right secret returns 200 with the dry-run counters", async () => {
  const c = ctx(okDb);
  const out = await retentionSweepRequest(post("https://x/api/retention-sweep?dry_run=1", "secret"), c.ctx);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { dry_run: true, would_delete: 0, excluded_acted_on: 0, oldest_created_at: null, days: 45 });
});

test("retentionSweepRequest forces dry_run:true in the response when the kill switch is off, even with dry_run=0", async () => {
  const c = ctx(okDb, { pruneEnabled: false });
  const out = await retentionSweepRequest(post("https://x/api/retention-sweep?dry_run=0", "secret"), c.ctx);
  assert.equal(out.status, 200);
  assert.equal((out.body as { dry_run: boolean }).dry_run, true);
});

test("retentionSweepRequest turns a db failure into a 500 and logs the real message server-side only", async () => {
  const failing: RetentionDb = {
    wouldDelete: async () => {
      throw new Error("relation roles does not exist");
    },
    excludedActedOn: async () => 0,
    deleteBatch: async () => [],
  };
  const c = ctx(failing);
  const out = await retentionSweepRequest(post("https://x/api/retention-sweep?dry_run=1", "secret"), c.ctx);
  assert.deepEqual(out, { status: 500, body: { error: "retention sweep failed" } });
  assert.equal(c.logged[0]?.error, "relation roles does not exist");
});
