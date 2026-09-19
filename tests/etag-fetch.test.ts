import { test } from "node:test";
import assert from "node:assert/strict";
import { makeConditionalFetch, vendorEmptyPayload, type WatchState } from "../lib/etag-fetch.ts";

// The fast lane's ETag branch (TRD §13 spike-5 verdict, slice 6c-finish).
// makeConditionalFetch wraps the fetch that scan-core.mjs already threads
// through its `fetchFn` seam: stored validators go out as If-None-Match /
// If-Modified-Since on GETs, a 304 comes back as the vendor's EMPTY payload so
// the untouched core parses "no jobs" and skips the multi-MB download + parse
// that is the CPU. Workday (POST) has no validator and passes through.

const GH = "https://boards-api.greenhouse.io/v1/boards/stripe/jobs";
const LEVER = "https://api.lever.co/v0/postings/palantir?mode=json";
const ASHBY = "https://api.ashbyhq.com/posting-api/job-board/snowflake?includeCompensation=false";
const SR = "https://api.smartrecruiters.com/v1/companies/visa/postings?limit=100";
const WD = "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs";

type Call = { url: string; init: RequestInit | undefined };

// A scripted base fetch: records every call, answers from `answers` by URL.
function fakeFetch(answers: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); // the core only ever passes strings
    calls.push({ url, init });
    const make = answers[url];
    if (!make) return new Response("not found", { status: 404 });
    return make();
  };
  return { fn, calls };
}

function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init?.headers).get(name);
}

test("vendorEmptyPayload knows the three ETag vendors and nothing else", () => {
  assert.equal(vendorEmptyPayload(GH), '{"jobs":[]}');
  assert.equal(vendorEmptyPayload(ASHBY), '{"jobs":[]}');
  assert.equal(vendorEmptyPayload(LEVER), "[]");
  assert.equal(vendorEmptyPayload(SR), null);
  assert.equal(vendorEmptyPayload(WD), null);
  assert.equal(vendorEmptyPayload("not a url"), null);
});

test("GET with a stored etag sends If-None-Match; last_modified-only sends If-Modified-Since", async () => {
  const state: WatchState = new Map([
    [GH, { etag: 'W/"abc"' }],
    [LEVER, { last_modified: "Mon, 24 Aug 2026 00:00:00 GMT" }],
    [ASHBY, { etag: '"x"', last_modified: "Sun, 23 Aug 2026 00:00:00 GMT" }],
  ]);
  const base = fakeFetch({
    [GH]: () => new Response('{"jobs":[{"id":1}]}', { status: 200 }),
    [LEVER]: () => new Response("[]", { status: 200 }),
    [ASHBY]: () => new Response('{"jobs":[]}', { status: 200 }),
    [SR]: () => new Response('{"content":[]}', { status: 200 }),
  });
  const cf = makeConditionalFetch(base.fn, state);
  await cf.fetch(GH, { headers: { accept: "application/json" } });
  await cf.fetch(LEVER, { headers: { accept: "application/json" } });
  await cf.fetch(ASHBY, { headers: { accept: "application/json" } });
  await cf.fetch(SR, { headers: { accept: "application/json" } }); // no stored validator

  assert.equal(headerOf(base.calls[0], "if-none-match"), 'W/"abc"');
  assert.equal(headerOf(base.calls[0], "if-modified-since"), null);
  assert.equal(headerOf(base.calls[0], "accept"), "application/json"); // caller headers kept
  assert.equal(headerOf(base.calls[1], "if-none-match"), null);
  assert.equal(headerOf(base.calls[1], "if-modified-since"), "Mon, 24 Aug 2026 00:00:00 GMT");
  // etag wins when both exist (one validator, never two competing ones)
  assert.equal(headerOf(base.calls[2], "if-none-match"), '"x"');
  assert.equal(headerOf(base.calls[2], "if-modified-since"), null);
  assert.equal(headerOf(base.calls[3], "if-none-match"), null);
  assert.equal(headerOf(base.calls[3], "if-modified-since"), null);
  assert.equal(cf.sent, 3);
  assert.equal(cf.hits, 0);
});

test("304 becomes a 200 with the vendor's empty payload and the x-scout-304 marker", async () => {
  const state: WatchState = new Map([
    [GH, { etag: "a" }],
    [LEVER, { etag: "b" }],
    [ASHBY, { etag: "c" }],
  ]);
  const base = fakeFetch({
    [GH]: () => new Response(null, { status: 304, headers: { etag: "a" } }),
    [LEVER]: () => new Response(null, { status: 304 }),
    [ASHBY]: () => new Response(null, { status: 304 }),
  });
  const cf = makeConditionalFetch(base.fn, state);
  const gh = await cf.fetch(GH);
  const lever = await cf.fetch(LEVER);
  const ashby = await cf.fetch(ASHBY);
  for (const r of [gh, lever, ashby]) {
    assert.equal(r.status, 200);
    assert.equal(r.ok, true);
    assert.equal(r.headers.get("x-scout-304"), "1");
  }
  // Exactly what scan-core's normalize() reads: greenhouse/ashby `.jobs`, lever = array.
  assert.deepEqual(await gh.json(), { jobs: [] });
  assert.deepEqual(await lever.json(), []);
  assert.deepEqual(await ashby.json(), { jobs: [] });
  assert.equal(cf.hits, 3);
  assert.equal(cf.sent, 3);
  // A 304 never rewrites the stored validator (it is still valid) and never
  // pretends to be a fresh harvest.
  assert.equal(cf.updates.size, 0);
});

test("304 from a host without a known empty shape passes through unchanged", async () => {
  const state: WatchState = new Map([[SR, { etag: "s" }]]);
  const original = new Response(null, { status: 304, headers: { etag: "s" } });
  const base = fakeFetch({ [SR]: () => original });
  const cf = makeConditionalFetch(base.fn, state);
  const res = await cf.fetch(SR);
  assert.equal(res, original); // the core's `if (!res.ok) throw` handles it as before
  assert.equal(res.status, 304);
  assert.equal(cf.hits, 1);
});

test("POST (Workday) passes through untouched: no validators sent, nothing harvested", async () => {
  const state: WatchState = new Map([[WD, { etag: "never-used" }]]);
  const base = fakeFetch({
    [WD]: () => new Response('{"jobPostings":[]}', { status: 200, headers: { etag: '"wd"' } }),
  });
  const cf = makeConditionalFetch(base.fn, state);
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" }, body: "{}" };
  const res = await cf.fetch(WD, init);
  assert.equal(res.status, 200);
  assert.equal(base.calls[0].init, init); // the very same init object, not a copy
  assert.equal(headerOf(base.calls[0], "if-none-match"), null);
  assert.equal(cf.updates.size, 0);
  assert.equal(cf.sent, 0);
});

test("harvests etag / last-modified from every 200 into updates, keyed by URL", async () => {
  const state: WatchState = new Map();
  const base = fakeFetch({
    [GH]: () => new Response('{"jobs":[]}', { status: 200, headers: { etag: 'W/"gh1"' } }),
    [LEVER]: () =>
      new Response("[]", { status: 200, headers: { etag: 'W/"lv1"', "last-modified": "Mon, 24 Aug 2026 01:02:03 GMT" } }),
    [ASHBY]: () => new Response('{"jobs":[]}', { status: 200, headers: { "last-modified": "Sun, 23 Aug 2026 00:00:00 GMT" } }),
    [SR]: () => new Response('{"content":[]}', { status: 200 }), // no validator → nothing to store
  });
  const cf = makeConditionalFetch(base.fn, state);
  for (const u of [GH, LEVER, ASHBY, SR]) await cf.fetch(u);
  assert.deepEqual(
    [...cf.updates.entries()],
    [
      [GH, { etag: 'W/"gh1"', last_modified: null }],
      [LEVER, { etag: 'W/"lv1"', last_modified: "Mon, 24 Aug 2026 01:02:03 GMT" }],
      [ASHBY, { etag: null, last_modified: "Sun, 23 Aug 2026 00:00:00 GMT" }],
    ],
  );
  // The response itself is handed back untouched for the core to parse.
  assert.equal(cf.sent, 0);
  assert.equal(cf.hits, 0);
});

test("non-200 / non-304 responses are passed through and never harvested", async () => {
  const state: WatchState = new Map([[GH, { etag: "a" }]]);
  const base = fakeFetch({ [GH]: () => new Response("nope", { status: 500, headers: { etag: "junk" } }) });
  const cf = makeConditionalFetch(base.fn, state);
  const res = await cf.fetch(GH);
  assert.equal(res.status, 500);
  assert.equal(cf.updates.size, 0);
  assert.equal(cf.hits, 0);
});

test("two-pass idempotency: pass 1 harvests, pass 2 (fed the harvest) sends the validator and skips on 304", async () => {
  let served = 0;
  const base = fakeFetch({
    [GH]: () => {
      served += 1;
      return new Response('{"jobs":[{"id":7}]}', { status: 200, headers: { etag: 'W/"v1"' } });
    },
  });
  const pass1 = makeConditionalFetch(base.fn, new Map());
  assert.deepEqual(await (await pass1.fetch(GH)).json(), { jobs: [{ id: 7 }] });
  assert.equal(pass1.sent, 0);

  // Feed pass 1's harvest to pass 2 exactly as the route does after saving watch_state
  // (updates and state share one row shape, nulls included).
  const state2: WatchState = pass1.updates;
  const base2 = fakeFetch({
    [GH]: () => new Response(null, { status: 304 }),
  });
  const pass2 = makeConditionalFetch(base2.fn, state2);
  const res = await pass2.fetch(GH);
  assert.equal(headerOf(base2.calls[0], "if-none-match"), 'W/"v1"');
  assert.deepEqual(await res.json(), { jobs: [] });
  assert.equal(pass2.hits, 1);
  assert.equal(served, 1);

  // Wrapping a wrapped fetch is harmless: the header is set, not appended twice.
  const nested = makeConditionalFetch(pass2.fetch, state2);
  await nested.fetch(GH);
  assert.equal(headerOf(base2.calls[1], "if-none-match"), 'W/"v1"');
});
