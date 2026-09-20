import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRequest,
  classifyWithModel,
  mergeModel,
  needsModel,
  parseParams,
  postingText,
  runSweep,
  type Db,
  type Deps,
  type ModelResult,
  type ResidueRow,
} from "../lib/classify.ts";
import { deriveSeason } from "../lib/season.ts";
import { familySignals } from "../lib/family.ts";
import { decodeEntities } from "../lib/decode-entities.ts";

// Task 2 L2 (MISSION D5-D8): the residue sweep behind POST /api/classify.
// lib/classify.ts holds no static lib-to-lib VALUE import (the strip-types
// runner cannot follow one, the module-resolution rule), so every collaborator is
// injected here: the real season/family/entity rules from their own modules,
// a fake fetch (tests never hit the network) and an in-memory Db.

// ---- postingText: JD html -> the text the rules and the model read ----

test("postingText drops script content, decodes entities and collapses whitespace", () => {
  assert.equal(postingText("<p>Summer&nbsp;2027 &amp; more</p><script>x</script>", decodeEntities), "Summer 2027 & more");
});

test("postingText caps the text at 6,000 characters", () => {
  assert.equal(postingText("a".repeat(20_000), decodeEntities).length, 6_000);
});

// ---- needsModel: tier 2 fires only where the rules could not decide ----

test("needsModel is true when the season is unspecified or the families are only other", () => {
  assert.equal(needsModel({ season: "unspecified", families: ["software"] }), true);
  assert.equal(needsModel({ season: "summer_2027", families: ["other"] }), true);
  assert.equal(needsModel({ season: "summer_2027", families: ["software"] }), false);
});

// ---- mergeModel: rules win, the model only fills gaps or adds ----

const accepted: ModelResult = { season: "fall_2027", families: ["data_ai"], confidence: 0.95, is_internship: true };

test("mergeModel keeps the rules season and adds the model family", () => {
  const out = mergeModel({ season: "summer_2027", families: ["software"] }, accepted);
  assert.equal(out.season, "summer_2027");
  assert.deepEqual(out.families, ["software", "data_ai"]);
  assert.equal(out.by, "llm");
});

test("mergeModel fills an unspecified season and replaces an other-only family list", () => {
  const out = mergeModel({ season: "unspecified", families: ["other"] }, accepted);
  assert.equal(out.season, "fall_2027");
  assert.deepEqual(out.families, ["data_ai"]);
  assert.equal(out.by, "llm");
});

test("mergeModel never removes a rules family and never adds other", () => {
  const out = mergeModel({ season: "unspecified", families: ["software", "data_ai"] }, { ...accepted, families: ["software", "other"] });
  assert.deepEqual(out.families, ["software", "data_ai"]);
});

test("mergeModel below the confidence bar returns the rules values stamped rules", () => {
  const out = mergeModel({ season: "unspecified", families: ["other"] }, { ...accepted, confidence: 0.5 });
  assert.deepEqual(out, { season: "unspecified", families: ["other"], by: "rules" });
});

test("mergeModel with is_internship false returns the rules values stamped rules", () => {
  const out = mergeModel({ season: "unspecified", families: ["other"] }, { ...accepted, is_internship: false });
  assert.deepEqual(out, { season: "unspecified", families: ["other"], by: "rules" });
});

// Fold 2 MINOR 3: the audit column claims the model only when it changed something.
test("mergeModel stamps rules when an accepted model answer changes nothing", () => {
  const out = mergeModel({ season: "summer_2027", families: ["software"] }, { ...accepted, season: "summer_2027", families: ["software"] });
  assert.deepEqual(out, { season: "summer_2027", families: ["software"], by: "rules" });
});

// Fold 2 NIT 9: the bar is >= 0.8, exactly 0.8 passes.
test("mergeModel accepts confidence exactly 0.8", () => {
  const out = mergeModel({ season: "unspecified", families: ["other"] }, { ...accepted, confidence: 0.8 });
  assert.deepEqual(out, { season: "fall_2027", families: ["data_ai"], by: "llm" });
});

// ---- classifyWithModel: the DeepSeek call, one retry, never throws ----

type Call = { url: string; init: RequestInit | undefined };
function llmFake(contents: (string | null)[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const content = contents[calls.length - 1] ?? null;
    return Response.json({ choices: [{ message: { content } }] });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}
const llmDeps = { apiKey: "k", baseUrl: "https://llm.example", model: "m" };
const good = JSON.stringify({ is_internship: true, families: ["software"], season: "summer_2027", confidence: 0.9 });

test("classifyWithModel retries once on empty content and returns the parsed result", async () => {
  const llm = llmFake(["", good]);
  const out = await classifyWithModel({ title: "SDE Intern", text: "Summer 2027" }, { ...llmDeps, fetch: llm.fetch });
  assert.equal(llm.calls.length, 2);
  assert.deepEqual(out, { is_internship: true, families: ["software"], season: "summer_2027", confidence: 0.9 });
});

test("classifyWithModel returns confidence 0 after two invalid answers and never throws", async () => {
  const llm = llmFake(["not json", '{"season":"summer_2027"}']);
  const out = await classifyWithModel({ title: "x", text: "y" }, { ...llmDeps, fetch: llm.fetch });
  assert.equal(llm.calls.length, 2);
  assert.equal(out.confidence, 0);
  assert.equal(out.is_internship, false);
  assert.ok(out.error);
});

test("classifyWithModel survives a fetch that throws", async () => {
  const fetch = (async () => {
    throw new Error("socket hang up");
  }) as unknown as typeof globalThis.fetch;
  const out = await classifyWithModel({ title: "x", text: "y" }, { ...llmDeps, fetch });
  assert.equal(out.confidence, 0);
});

test("classifyWithModel sends json mode, temperature 0, the bearer key and the word json in the system prompt", async () => {
  const llm = llmFake([good]);
  await classifyWithModel({ title: "SDE Intern", text: "Summer 2027 posting" }, { ...llmDeps, fetch: llm.fetch });
  const call = llm.calls[0];
  assert.equal(call.url, "https://llm.example/chat/completions");
  assert.equal(call.init?.method, "POST");
  assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer k");
  const body = JSON.parse(String(call.init?.body));
  assert.equal(body.model, "m");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /json/);
  assert.equal(body.messages[1].content, "Title: SDE Intern\n\nPosting:\nSummer 2027 posting");
});

// ---- runSweep: orchestration over an injected Db + deps ----

function row(id: string, title: string, jd: string, extra: Partial<ResidueRow> = {}): ResidueRow {
  return { id, title, jd_snapshot: jd, season: "unspecified", family: null, families: null, ...extra };
}

function fakeDb(rows: ResidueRow[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const requested: { limit: number; ids?: string[] }[] = [];
  const db: Db = {
    async residue(limit, ids) {
      requested.push({ limit, ids });
      const picked = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
      return picked.slice(0, limit);
    },
    async update(id, patch) {
      updates.push({ id, patch });
    },
    async remaining() {
      return rows.length - updates.length;
    },
  };
  return { db, updates, requested };
}

// null = no key (an explicit undefined would pick the default).
function deps(fetch: typeof globalThis.fetch, apiKey: string | null = "k"): Deps {
  return { deriveSeason, familySignals, decodeEntities, fetch, apiKey: apiKey ?? undefined, baseUrl: "https://llm.example", model: "m" };
}

const decided = row("r-1", "Software Engineer Intern", "<p>Join us for Summer 2027.</p>");
const noTerm = row("r-2", "Software Engineer Intern", "<p>Build things.</p>");
const noFamily = row("r-3", "Intern", "<p>Summer 2027 program.</p>");

test("runSweep dry run writes nothing and returns one proposal per row", async () => {
  const { db, updates } = fakeDb([decided, noTerm, noFamily]);
  const llm = llmFake([good, good]);
  const out = await runSweep({ limit: 20, dryRun: true }, db, deps(llm.fetch));
  assert.equal(updates.length, 0);
  assert.equal(out.dry_run, true);
  assert.equal(out.processed, 3);
  assert.equal(out.rows.length, 3);
  assert.deepEqual(out.rows[0].after, { season: "summer_2027", family: "software", families: ["software"] });
  assert.equal(out.rows[0].by, "rules");
  assert.equal(out.rows[1].by, "llm");
  assert.equal(out.rows[1].after.season, "summer_2027");
  assert.equal(out.rules_only, 1);
  assert.equal(out.llm_called, 2);
  assert.equal(out.llm_written, 2);
});

test("runSweep updates each row exactly once with the stamp and family = families[0]", async () => {
  const { db, updates } = fakeDb([decided, noTerm, noFamily]);
  const llm = llmFake([good, good]);
  const out = await runSweep({ limit: 20, dryRun: false }, db, deps(llm.fetch));
  assert.equal(updates.length, 3);
  assert.deepEqual(updates.map((u) => u.id).sort(), ["r-1", "r-2", "r-3"]);
  for (const u of updates) {
    assert.ok(typeof u.patch.classified_at === "string");
    assert.equal(u.patch.family, (u.patch.families as string[])[0]);
  }
  const first = updates.find((u) => u.id === "r-1")!;
  assert.equal(first.patch.classified_by, "rules");
  assert.equal(first.patch.classified_model, null);
  const second = updates.find((u) => u.id === "r-2")!;
  assert.equal(second.patch.classified_by, "llm");
  assert.equal(second.patch.classified_model, "m");
  assert.equal(out.remaining, 0);
});

test("runSweep never calls fetch for a row the rules already decide", async () => {
  const { db } = fakeDb([decided]);
  const llm = llmFake([good]);
  const out = await runSweep({ limit: 20, dryRun: false }, db, deps(llm.fetch));
  assert.equal(llm.calls.length, 0);
  assert.equal(out.llm_called, 0);
  assert.equal(out.rules_only, 1);
});

test("runSweep with no API key never calls fetch and stamps every row rules", async () => {
  const { db, updates } = fakeDb([noTerm, noFamily]);
  const llm = llmFake([good, good]);
  const out = await runSweep({ limit: 20, dryRun: false }, db, deps(llm.fetch, null));
  assert.equal(llm.calls.length, 0);
  assert.equal(out.llm_called, 0);
  assert.equal(updates.length, 2);
  assert.ok(updates.every((u) => u.patch.classified_by === "rules" && u.patch.classified_model === null));
  assert.equal(out.rows[1].after.family, "other");
});

test("runSweep low confidence stamps rules, keeps the rules values and logs the model result", async () => {
  const { db, updates } = fakeDb([noTerm]);
  const low = JSON.stringify({ is_internship: true, families: ["software"], season: "fall_2027", confidence: 0.4 });
  const llm = llmFake([low]);
  const out = await runSweep({ limit: 20, dryRun: false }, db, deps(llm.fetch));
  assert.equal(out.llm_called, 1);
  assert.equal(out.llm_written, 0);
  assert.equal(out.llm_low_confidence, 1);
  assert.equal(updates[0].patch.classified_by, "rules");
  assert.equal(updates[0].patch.season, "unspecified");
  assert.equal(out.rows[0].model_result?.confidence, 0.4);
});

test("runSweep never overwrites a stored non-unspecified season with unspecified", async () => {
  // VTHacks taxonomy swap: "Mechanical" (not bare "Engineering") so the
  // title-derived family is decided too (no generic engineer/engineering
  // catch-all any more, see lib/family.ts) — this test is about the season
  // overwrite rule, so the family axis must not force an unwanted LLM call.
  const stored = row("r-9", "Mechanical Engineering Intern", "<p>No term here.</p>", { season: "fall_2027" });
  const { db, updates } = fakeDb([stored]);
  const llm = llmFake([good]);
  const out = await runSweep({ limit: 20, dryRun: false }, db, deps(llm.fetch));
  assert.equal(llm.calls.length, 0);
  assert.equal(updates[0].patch.season, "fall_2027");
  assert.equal(out.rows[0].before.season, "fall_2027");
});

test("runSweep passes ids through to the db", async () => {
  const { db, requested } = fakeDb([decided, noTerm]);
  const out = await runSweep({ limit: 50, dryRun: true, ids: ["r-2"] }, db, deps(llmFake([good]).fetch));
  assert.deepEqual(requested[0], { limit: 50, ids: ["r-2"] });
  assert.equal(out.processed, 1);
  assert.equal(out.rows[0].id, "r-2");
});

// ---- parseParams + classifyRequest: the route's boundary ----

test("parseParams defaults limit to 20 and clamps it to 50", () => {
  assert.equal(parseParams(new URL("https://x/api/classify")).limit, 20);
  assert.equal(parseParams(new URL("https://x/api/classify?limit=500")).limit, 50);
  assert.equal(parseParams(new URL("https://x/api/classify?limit=0")).limit, 1);
  assert.equal(parseParams(new URL("https://x/api/classify?limit=abc")).limit, 20);
  // ids without a limit: limit follows the id count (NIT 6), blanks dropped.
  assert.deepEqual(parseParams(new URL("https://x/api/classify?dry_run=1&ids=a,b,,c")), { limit: 3, dryRun: true, ids: ["a", "b", "c"] });
  assert.equal(parseParams(new URL("https://x/api/classify?dry_run=0")).dryRun, false);
});

// Fold 2 NIT 6: ids without a limit means "all of these ids" (still capped at 50).
test("parseParams defaults limit to the number of ids when ids are given without a limit", () => {
  assert.equal(parseParams(new URL("https://x/api/classify?ids=a,b,c")).limit, 3);
  assert.equal(parseParams(new URL("https://x/api/classify?ids=a,b,c&limit=2")).limit, 2);
  const many = Array.from({ length: 60 }, (_, i) => `id${i}`).join(",");
  const out = parseParams(new URL(`https://x/api/classify?ids=${many}`));
  assert.equal(out.limit, 50);
  assert.equal(out.ids?.length, 50);
});

// null = WATCHER_SECRET unset.
function ctx(rows: ResidueRow[], expected: string | null = "secret") {
  const fake = fakeDb(rows);
  return {
    fake,
    ctx: { expected: expected ?? undefined, isCorrectPassword: (a: string, b: string) => a === b, db: () => fake.db, deps: deps(llmFake([]).fetch, null) },
  };
}

test("classifyRequest without the header returns 401 unauthorized", async () => {
  const { ctx: c } = ctx([decided]);
  const out = await classifyRequest(new Request("https://x/api/classify", { method: "POST" }), c);
  assert.deepEqual(out, { status: 401, body: { error: "unauthorized" } });
});

test("classifyRequest with the wrong secret or no configured secret returns 401", async () => {
  const wrong = await classifyRequest(new Request("https://x/api/classify", { method: "POST", headers: { "X-Watcher-Secret": "nope" } }), ctx([]).ctx);
  assert.equal(wrong.status, 401);
  const unset = await classifyRequest(new Request("https://x/api/classify", { method: "POST", headers: { "X-Watcher-Secret": "secret" } }), ctx([], null).ctx);
  assert.equal(unset.status, 401);
});

test("classifyRequest clamps limit=500 to 50 and runs the sweep", async () => {
  const { ctx: c, fake } = ctx([decided]);
  const out = await classifyRequest(new Request("https://x/api/classify?limit=500&dry_run=1", { method: "POST", headers: { "X-Watcher-Secret": "secret" } }), c);
  assert.equal(out.status, 200);
  assert.equal(fake.requested[0].limit, 50);
  assert.equal((out.body as { processed: number }).processed, 1);
  assert.equal(fake.updates.length, 0);
});

// Fold 2 MINOR 4: the caller gets a fixed string; the real message goes to the injected logger only.
test("classifyRequest turns a db failure into a 500 sweep failed and logs the real message", async () => {
  const logged: Record<string, unknown>[] = [];
  const c = { ...ctx([]).ctx, log: (entry: Record<string, unknown>) => logged.push(entry) };
  c.db = () => ({
    residue: async () => {
      throw new Error("relation roles.families does not exist");
    },
    update: async () => {},
    remaining: async () => 0,
  });
  const out = await classifyRequest(new Request("https://x/api/classify", { method: "POST", headers: { "X-Watcher-Secret": "secret" } }), c);
  assert.deepEqual(out, { status: 500, body: { error: "sweep failed" } });
  assert.equal(logged.length, 1);
  assert.match(String(logged[0].error), /roles\.families/);
});
