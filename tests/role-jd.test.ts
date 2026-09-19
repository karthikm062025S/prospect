import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { ensureRoleJd, captureInsertedRoleJds, readJdError } from "../lib/role-jd.ts";
import { gateFromText } from "../lib/gate-rules.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

// lib/role-jd.ts's ensureRoleJd is the ONE function both ingest lanes and the
// Home detail pane's lazy-open action call. Every case here injects
// `opts.capture` (a test-only DI hook — see the ponytail comment on
// defaultCapture in lib/role-jd.ts) instead of exercising the real
// captureJobDescription/captureJobPosting path: a STATIC lib-to-lib import of
// lib/jd-snapshot.ts would throw ERR_MODULE_NOT_FOUND the moment this file is
// loaded directly by `node --experimental-strip-types --test` (the D6 gotcha,
// the module-resolution rule), so role-jd.ts resolves the real module lazily via a
// dynamic import that these tests never reach. The real path is proven by the
// live proof against the dev server (MISSION validation item 7) and by
// jd-snapshot's own certified test suite (tests/jd-snapshot.test.ts).
// The rows live in the real schema (pglite), so column types are the real ones.

const COMPANY = uuid(10);
const R1 = uuid(21);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme", ats: null, endpoint: null });
});

async function seed(overrides: Record<string, unknown> = {}) {
  await insertRow(db.q, "roles", {
    id: R1,
    company_id: COMPANY,
    title: "Software Engineer Intern",
    link: "https://acme.example/jobs/1",
    source: "scanner",
    location: null,
    jd_snapshot: null,
    jd_snapshot_at: null,
    jd_error: null,
    ...overrides,
  });
}
const stored = async () => (await db.q<Record<string, unknown>>("select * from roles where id = $1", [R1]))[0];

test("returns the stored snapshot without invoking capture", async () => {
  await seed({ jd_snapshot: "<p>hi</p>", jd_snapshot_at: "2026-01-01T00:00:00.000Z", location: "Remote" });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>never</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(calls, 0);
  assert.deepEqual(result, { html: "<p>hi</p>", captured_at: "2026-01-01T00:00:00.000Z", error: null, location: "Remote" });
});

// SR-004 (2026-09-03): a recorded failure is a result, not an invitation to
// refetch. Without this, any signed-in user could loop role ids and drive two
// outbound fetches per call at employer career pages.
test("a role with a stored jd_error is not re-captured", async () => {
  await seed({ jd_snapshot: null, jd_snapshot_at: null, jd_error: "timeout after 8000 ms" });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>never</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(calls, 0);
  assert.deepEqual(result, { html: null, captured_at: null, error: "timeout after 8000 ms", location: null });
});

test("missing snapshot triggers capture and stores it", async () => {
  await seed();
  const capture = async () => ({ html: "<p>hello</p>", location: "Austin, TX", error: null });
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(result.html, "<p>hello</p>");
  assert.equal(result.error, null);
  assert.equal(result.location, "Austin, TX");
  assert.ok(result.captured_at);
  const row = await stored();
  assert.equal(row.jd_snapshot, "<p>hello</p>");
  assert.equal(row.jd_snapshot_at, result.captured_at);
  assert.equal(row.location, "Austin, TX");
});

test("capture failure stores jd_error with html null, never throws", async () => {
  await seed();
  const capture = async () => ({ html: null, location: null, error: "timeout after 5000 ms" });
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(result.html, null);
  assert.equal(result.error, "timeout after 5000 ms"); // the caller sees the message, not the stamp
  const row = await stored();
  assert.equal(row.jd_snapshot, null);
  // jd_snapshot_at still means "when the snapshot we are showing was captured";
  // a failure has none, so the pane never says "captured <date>" over an error.
  assert.equal(row.jd_snapshot_at, null);
  const failure = readJdError(row.jd_error as string);
  assert.equal(failure.message, "timeout after 5000 ms");
  assert.ok(failure.at !== null && Date.now() - failure.at < 10_000); // the attempt time was recorded
});

// Review fold (2026-09-03): SR-004's short-circuit made the pane's "Retry
// capture" a permanent no-op - a failure recorded no timestamp, so the stored
// error came back forever. The attempt time now rides on jd_error, and a
// forced retry is allowed at most once every 10 minutes per role.
const failedAt = (msAgo: number, message = "timeout after 8000 ms") =>
  `${new Date(Date.now() - msAgo).toISOString()} ${message}`;

test("a forced retry re-captures once the 10-minute ceiling has passed", async () => {
  await seed({ jd_error: failedAt(11 * 60_000) });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>second try</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { force: true, capture });
  assert.equal(calls, 1);
  assert.equal(result.html, "<p>second try</p>");
  assert.equal(result.error, null);
  const row = await stored();
  assert.equal(row.jd_error, null);
  assert.equal(row.jd_snapshot, "<p>second try</p>");
});

test("a forced retry inside the 10-minute ceiling does not re-capture", async () => {
  await seed({ jd_error: failedAt(60_000) });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>never</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { force: true, capture });
  assert.equal(calls, 0);
  assert.deepEqual(result, { html: null, captured_at: null, error: "timeout after 8000 ms", location: null });
});

test("a legacy unstamped failure is retried on force", async () => {
  await seed({ jd_error: "timeout after 8000 ms" });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>third try</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { force: true, capture });
  assert.equal(calls, 1);
  assert.equal(result.html, "<p>third try</p>");
});

test("readJdError round-trips a stamped error and passes an unstamped one through", () => {
  const at = "2026-09-03T12:00:00.000Z";
  assert.deepEqual(readJdError(`${at} http 403`), { at: Date.parse(at), message: "http 403" });
  assert.deepEqual(readJdError("http 403"), { at: null, message: "http 403" });
  assert.deepEqual(readJdError(null), { at: null, message: null });
});

test("location backfills only when the stored value is null", async () => {
  await seed({ location: "Seattle, WA" });
  const capture = async () => ({ html: "<p>x</p>", location: "Austin, TX", error: null });
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(result.location, "Seattle, WA"); // never churned
  assert.equal((await stored()).location, "Seattle, WA");
});

test("location backfills when the stored value is null", async () => {
  await seed();
  const capture = async () => ({ html: "<p>x</p>", location: "Austin, TX", error: null });
  const result = await ensureRoleJd(db.q, R1, { capture });
  assert.equal(result.location, "Austin, TX");
  assert.equal((await stored()).location, "Austin, TX");
});

test("force re-captures even when a snapshot is already stored", async () => {
  await seed({ jd_snapshot: "<p>old</p>", jd_snapshot_at: "2020-01-01T00:00:00.000Z" });
  let calls = 0;
  const capture = async () => {
    calls++;
    return { html: "<p>new</p>", location: null, error: null };
  };
  const result = await ensureRoleJd(db.q, R1, { force: true, capture });
  assert.equal(calls, 1);
  assert.equal(result.html, "<p>new</p>");
  assert.equal((await stored()).jd_snapshot, "<p>new</p>");
});

test("role not found returns a clean error, never throws", async () => {
  const result = await ensureRoleJd(db.q, uuid(999), {});
  assert.equal(result.html, null);
  assert.equal(result.error, "role not found");
  assert.equal(result.location, null);
});

// captureInsertedRoleJds: the ingest-lane fan-out. Exercised only against
// roles that ALREADY have a stored snapshot (the "return without invoking
// capture" branch above) so it stays inside the same DI-safe test boundary —
// it calls the real ensureRoleJd(q, id) with no injected capture, and a
// role with jd_snapshot already set never reaches the dynamic-import branch.
async function seedCached(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = uuid(1000 + i);
    ids.push(id);
    await insertRow(db.q, "roles", {
      id,
      company_id: COMPANY,
      title: `Software Engineer Intern ${i}`,
      link: "https://acme.example/jobs/1",
      source: "scanner",
      jd_snapshot: "<p>cached</p>",
      jd_snapshot_at: "2026-01-01T00:00:00.000Z",
    });
  }
  return ids;
}

test("captureInsertedRoleJds counts already-captured roles", async () => {
  const ids = await seedCached(3);
  const { captured, failed } = await captureInsertedRoleJds(db.q, ids);
  assert.equal(captured, 3);
  assert.equal(failed, 0);
});

test("captureInsertedRoleJds caps at 40 ids per request", async () => {
  const ids = await seedCached(45);
  const { captured, failed } = await captureInsertedRoleJds(db.q, ids);
  assert.equal(captured + failed, 40);
});

// Task 3 T4 (2026-09-16): the sponsorship / citizenship / clearance gate rides
// in the same patch as the snapshot. `gate` is injected for the same reason
// `capture` is (lib/gate-rules.ts is reached through a dynamic import that the
// strip-types runner cannot resolve); the real function is what the tests pass.
const noSponsorHtml = "<p>About the role.</p><p>We are unable to sponsor visas for this position.</p>";

test("a capture on a role with null visa_class writes the gate fields in the same patch as the snapshot", async () => {
  await seed({ visa_class: null, eligibility_note: null, gate_checked_at: null });
  const capture = async () => ({ html: noSponsorHtml, location: null, error: null });
  const result = await ensureRoleJd(db.q, R1, { capture, gate: gateFromText });
  assert.equal(result.error, null);
  const row = await stored();
  assert.equal(row.jd_snapshot, noSponsorHtml);
  assert.equal(row.visa_class, "no_sponsors");
  assert.equal(row.eligibility_note, 'Posting says: "We are unable to sponsor visas for this position". You can still apply.');
  assert.equal(row.gate_checked_at, row.jd_snapshot_at); // one patch, one clock
});

test("a capture on a role that abstains stamps gate_checked_at and no flag", async () => {
  await seed({ visa_class: null, eligibility_note: null, gate_checked_at: null });
  const capture = async () => ({ html: "<p>Great benefits and mentorship.</p>", location: null, error: null });
  await ensureRoleJd(db.q, R1, { capture, gate: gateFromText });
  const row = await stored();
  assert.equal(row.visa_class, null);
  assert.equal(row.eligibility_note, null);
  assert.ok(row.gate_checked_at);
});

test("a capture on a role with visa_class clean writes neither visa_class nor eligibility_note", async () => {
  await seed({ visa_class: "clean", eligibility_note: null, gate_checked_at: null });
  let gateCalls = 0;
  const gate = (html: string) => {
    gateCalls++;
    return gateFromText(html);
  };
  const capture = async () => ({ html: noSponsorHtml, location: null, error: null });
  await ensureRoleJd(db.q, R1, { capture, gate });
  assert.equal(gateCalls, 0);
  const row = await stored();
  assert.equal(row.visa_class, "clean");
  assert.equal(row.eligibility_note, null);
  assert.equal(row.gate_checked_at, null);
  assert.equal(row.jd_snapshot, noSponsorHtml);
});

test("a failed capture writes no gate fields", async () => {
  await seed({ visa_class: null, eligibility_note: null, gate_checked_at: null });
  let gateCalls = 0;
  const gate = (html: string) => {
    gateCalls++;
    return gateFromText(html);
  };
  const capture = async () => ({ html: null, location: null, error: "timeout after 5000 ms" });
  await ensureRoleJd(db.q, R1, { capture, gate });
  assert.equal(gateCalls, 0);
  const row = await stored();
  assert.equal(row.visa_class, null);
  assert.equal(row.eligibility_note, null);
  assert.equal(row.gate_checked_at, null);
});
