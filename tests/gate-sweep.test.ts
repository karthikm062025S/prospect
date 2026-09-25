import { test } from "node:test";
import assert from "node:assert/strict";
import { gateSweepRequest, parseParams, runGateSweep, type Db, type GateRow } from "../lib/gate-sweep.ts";
import { gateFromText } from "../lib/gate-rules.ts";

// Task 3 L3: the rules-only sweep behind POST /api/gate-sweep.
// lib/gate-sweep.ts holds no static lib-to-lib VALUE import (the strip-types
// runner cannot follow one, the module-resolution rule), so the rules arrive
// injected and the Db is an in-memory stub shaped like the route's.

type Stored = GateRow & { created_at: string; eligibility_note: string | null; gate_checked_at: string | null };

const NOW = new Date("2026-09-16T12:00:00.000Z");
const deps = { gate: gateFromText, now: () => NOW };

function row(i: number, jd: string | null, visa_class: string | null = null): Stored {
  return { id: `r-${i}`, jd_snapshot: jd as string, visa_class, eligibility_note: null, created_at: `2026-01-0${i}T00:00:00Z`, gate_checked_at: null };
}

// Residue = a JD and no stamp, oldest first; every write lands on the row.
function fakeDb(rows: Stored[]) {
  const writes: { id: string; patch: Record<string, unknown> }[] = [];
  const residueRows = () => rows.filter((r) => r.jd_snapshot != null && r.gate_checked_at == null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const db: Db = {
    async residue(limit) {
      return residueRows().slice(0, limit).map(({ id, jd_snapshot, visa_class }) => ({ id, jd_snapshot, visa_class }));
    },
    async update(id, patch) {
      writes.push({ id, patch });
      Object.assign(rows.find((r) => r.id === id)!, patch);
    },
    async remaining() {
      return residueRows().length;
    },
  };
  return { db, writes, rows };
}

test("runGateSweep processes rows with a JD and no stamp, oldest first, and stamps every one", async () => {
  const { db, writes, rows } = fakeDb([
    row(3, "<p>We are unable to sponsor visas.</p>"),
    row(1, "<p>Great benefits and mentorship.</p>"),
    row(2, "<p>Must be a U.S. citizen.</p>"),
    row(4, null),
  ]);
  const out = await runGateSweep({ limit: 50, dryRun: false }, db, deps);
  assert.deepEqual(writes.map((w) => w.id), ["r-1", "r-2", "r-3"]);
  assert.equal(out.processed, 3);
  assert.equal(out.flagged, 2);
  assert.equal(out.remaining, 0);
  assert.equal(out.dry_run, false);
  for (const id of ["r-1", "r-2", "r-3"]) assert.equal(rows.find((r) => r.id === id)!.gate_checked_at, NOW.toISOString());
  assert.equal(rows.find((r) => r.id === "r-4")!.gate_checked_at, null);
  // the abstained row got only the stamp
  assert.deepEqual(writes[0].patch, { gate_checked_at: NOW.toISOString() });
  assert.equal(rows[2].visa_class, "citizen_required");
  assert.match(rows[2].eligibility_note ?? "", /^Posting says: "Must be a U\.S\. citizen"\. Check the posting before applying\.$/);
  assert.equal(rows[0].visa_class, "no_sponsors");
});

test("runGateSweep never overwrites a non-null visa_class but still stamps the row", async () => {
  const { db, writes, rows } = fakeDb([row(1, "<p>We are unable to sponsor visas.</p>", "clean")]);
  const out = await runGateSweep({ limit: 50, dryRun: false }, db, deps);
  assert.equal(out.processed, 1);
  assert.equal(out.flagged, 0);
  assert.deepEqual(writes, [{ id: "r-1", patch: { gate_checked_at: NOW.toISOString() } }]);
  assert.equal(rows[0].visa_class, "clean");
  assert.equal(rows[0].eligibility_note, null);
  assert.equal(out.rows[0].skipped, true);
});

test("runGateSweep dry run writes nothing and returns the proposals", async () => {
  const { db, writes } = fakeDb([row(1, "<p>We will not sponsor.</p>"), row(2, "<p>hi</p>")]);
  const out = await runGateSweep({ limit: 50, dryRun: true }, db, deps);
  assert.equal(writes.length, 0);
  assert.equal(out.dry_run, true);
  assert.equal(out.processed, 2);
  assert.equal(out.flagged, 1);
  assert.equal(out.remaining, 2); // nothing was stamped
  assert.deepEqual(out.rows.map((r) => [r.id, r.visa_class]), [["r-1", "no_sponsors"], ["r-2", null]]);
});

test("runGateSweep is idempotent: a second run over the same table processes 0", async () => {
  const { db } = fakeDb([row(1, "<p>We will not sponsor.</p>"), row(2, "<p>hi</p>")]);
  const first = await runGateSweep({ limit: 50, dryRun: false }, db, deps);
  assert.equal(first.processed, 2);
  assert.equal(first.remaining, 0);
  const second = await runGateSweep({ limit: 50, dryRun: false }, db, deps);
  assert.equal(second.processed, 0);
  assert.equal(second.remaining, 0);
});

// Fold 2 A8: a JD that makes the rules throw is stamped and skipped, so it can
// never block the oldest-50 batch; abstaining is the contract.
test("runGateSweep stamps and skips a row whose gate throws", async () => {
  const { db, writes, rows } = fakeDb([row(1, "<p>boom</p>"), row(2, "<p>We will not sponsor.</p>")]);
  const gate = (html: string) => {
    if (html.includes("boom")) throw new Error("pathological");
    return gateFromText(html);
  };
  const out = await runGateSweep({ limit: 50, dryRun: false }, db, { gate, now: () => NOW });
  assert.equal(out.processed, 2);
  assert.equal(out.flagged, 1);
  assert.equal(out.remaining, 0);
  assert.deepEqual(out.rows[0], { id: "r-1", visa_class: null, note: null, skipped: true });
  assert.deepEqual(writes[0], { id: "r-1", patch: { gate_checked_at: NOW.toISOString() } });
  assert.equal(rows[0].visa_class, null);
  assert.equal(rows[1].visa_class, "no_sponsors");
});

test("runGateSweep honours the limit and reports the rest as remaining", async () => {
  const { db } = fakeDb([row(1, "<p>a</p>"), row(2, "<p>b</p>"), row(3, "<p>c</p>")]);
  const out = await runGateSweep({ limit: 2, dryRun: false }, db, deps);
  assert.equal(out.processed, 2);
  assert.equal(out.remaining, 1);
});

test("parseParams defaults limit to 50, clamps it to 1..200, and reads dry_run=1", () => {
  assert.deepEqual(parseParams(new URL("https://x/api/gate-sweep")), { limit: 50, dryRun: false });
  assert.equal(parseParams(new URL("https://x/api/gate-sweep?limit=500")).limit, 200);
  assert.equal(parseParams(new URL("https://x/api/gate-sweep?limit=0")).limit, 1);
  assert.equal(parseParams(new URL("https://x/api/gate-sweep?limit=abc")).limit, 50);
  assert.equal(parseParams(new URL("https://x/api/gate-sweep?dry_run=1")).dryRun, true);
  assert.equal(parseParams(new URL("https://x/api/gate-sweep?dry_run=0")).dryRun, false);
});

// null = WATCHER_SECRET unset.
function ctx(rows: Stored[], expected: string | null = "secret") {
  const fake = fakeDb(rows);
  let built = 0;
  return {
    fake,
    built: () => built,
    ctx: {
      expected: expected ?? undefined,
      isCorrectPassword: (a: string, b: string) => a === b,
      db: () => {
        built += 1;
        return fake.db;
      },
      deps,
    },
  };
}

const post = (url: string, secret?: string) =>
  new Request(url, { method: "POST", headers: secret ? { "X-Watcher-Secret": secret } : {} });

test("gateSweepRequest without the header returns 401 and writes nothing", async () => {
  const c = ctx([row(1, "<p>We will not sponsor.</p>")]);
  const out = await gateSweepRequest(post("https://x/api/gate-sweep"), c.ctx);
  assert.deepEqual(out, { status: 401, body: { error: "unauthorized" } });
  assert.equal(c.fake.writes.length, 0);
  assert.equal(c.built(), 0); // the client is never built before the secret passes
});

test("gateSweepRequest with the wrong secret or no configured secret returns 401", async () => {
  const wrong = ctx([row(1, "<p>x</p>")]);
  assert.equal((await gateSweepRequest(post("https://x/api/gate-sweep", "nope"), wrong.ctx)).status, 401);
  assert.equal(wrong.fake.writes.length, 0);
  const unset = ctx([row(1, "<p>x</p>")], null);
  assert.equal((await gateSweepRequest(post("https://x/api/gate-sweep", "secret"), unset.ctx)).status, 401);
  assert.equal(unset.fake.writes.length, 0);
});

test("gateSweepRequest with the secret returns 200 with the counters", async () => {
  const c = ctx([row(1, "<p>We will not sponsor.</p>"), row(2, "<p>hi</p>")]);
  const out = await gateSweepRequest(post("https://x/api/gate-sweep?limit=500", "secret"), c.ctx);
  assert.equal(out.status, 200);
  const body = out.body as Record<string, unknown>;
  assert.equal(body.processed, 2);
  assert.equal(body.flagged, 1);
  assert.equal(body.remaining, 0);
  assert.equal(body.dry_run, false);
  assert.equal(c.fake.writes.length, 2);
});

test("gateSweepRequest turns a db failure into a 500 and logs the real message server-side only", async () => {
  const logged: Record<string, unknown>[] = [];
  const failing: Db = {
    residue: async () => {
      throw new Error("relation roles does not exist");
    },
    update: async () => {},
    remaining: async () => 0,
  };
  const out = await gateSweepRequest(post("https://x/api/gate-sweep", "secret"), {
    expected: "secret",
    isCorrectPassword: (a, b) => a === b,
    db: () => failing,
    deps,
    log: (entry) => logged.push(entry),
  });
  assert.deepEqual(out, { status: 500, body: { error: "sweep failed" } });
  assert.equal(logged[0]?.error, "relation roles does not exist");
});
